//! Exportação para o Obsidian (§4.1).
//!
//! A regra que governa este módulo inteiro: **o app nunca sobrescreve edição
//! do usuário em silêncio.** §17 classifica isso como risco Alto, e com razão —
//! um vault é trabalho acumulado de anos, e uma exportação atrapalhada é
//! destrutiva de um jeito que não dá para desfazer.
//!
//! O mecanismo é simples e não depende de o usuário fazer nada: antes de
//! reescrever, o app compara o conteúdo em disco com o hash do que ele mesmo
//! gravou da última vez. Igual, pode atualizar. Diferente, alguém mexeu — e o
//! app recua e reporta.
//!
//! Todo caminho de escrita é canonizado e verificado contra a raiz escolhida,
//! o que fecha travessia de diretório e link simbólico apontando para fora
//! (§13 pede os dois explicitamente).

use crate::db::{agora_ms, Db};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Config {
    /// Pasta **dentro** do vault. O app nunca escreve fora dela.
    pub pasta: Option<String>,
    /// Em `true`, o app cria arquivos novos mas jamais mexe em existente —
    /// é o "modo somente exportação" de §4.1, para quem não quer risco nenhum.
    pub somente_criar: bool,
    pub exportar_diario: bool,
    pub exportar_cursos: bool,
    pub exportar_notas: bool,
    /// Modelo da nota diária, editável pelo usuário (§4.1).
    pub modelo_diario: String,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            pasta: None,
            somente_criar: false,
            exportar_diario: true,
            exportar_cursos: true,
            exportar_notas: true,
            modelo_diario: MODELO_DIARIO.into(),
        }
    }
}

/// `{{data}}`, `{{estudo}}`, `{{total}}`, `{{sessoes}}`, `{{tarefas}}`,
/// `{{notas}}` são trocados na exportação. O resto passa intacto, então dá
/// para pôr o que quiser em volta.
const MODELO_DIARIO: &str = "---\ntipo: diario-de-estudo\ndata: {{data}}\nestudo_min: {{estudo_min}}\n---\n\n# {{data}}\n\nEstudo efetivo: **{{estudo}}** · tempo registrado: {{total}}\n\n## Sessões\n\n{{sessoes}}\n\n## Tarefas\n\n{{tarefas}}\n\n## Notas\n\n{{notas}}\n";

pub fn config_de(db: &Db) -> Config {
    db.conn
        .lock()
        .ok()
        .and_then(|c| {
            c.query_row(
                "SELECT valor FROM settings WHERE chave = 'obsidian_config'",
                [],
                |r| r.get::<_, String>(0),
            )
            .ok()
        })
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

#[tauri::command]
pub fn obsidian_config(db: tauri::State<Db>) -> Config {
    config_de(&db)
}

#[tauri::command]
pub fn obsidian_salvar_config(db: tauri::State<Db>, config: Config) -> Result<(), String> {
    if let Some(p) = config.pasta.as_ref().filter(|p| !p.is_empty()) {
        let caminho = Path::new(p);
        if !caminho.is_dir() {
            return Err(format!("a pasta não existe: {p}"));
        }
    }
    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
    let s = serde_json::to_string(&config).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO settings (chave, valor) VALUES ('obsidian_config', ?1)
         ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor",
        params![s],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn hash_de(conteudo: &str) -> String {
    let mut h = Sha256::new();
    h.update(conteudo.as_bytes());
    // Formatação byte a byte: a saída do sha2 0.11 não implementa `LowerHex`.
    h.finalize().iter().fold(String::new(), |mut s, b| {
        use std::fmt::Write;
        let _ = write!(s, "{b:02x}");
        s
    })
}

/// Resolve o destino e garante que ele fica dentro da raiz escolhida.
///
/// Canoniza a raiz (que existe) e monta o alvo a partir dela, recusando
/// qualquer componente que não seja um nome simples. É isso que impede tanto
/// `../` quanto um nome de curso malicioso virando caminho.
fn destino(raiz: &Path, relativo: &str) -> Result<PathBuf, String> {
    let raiz = raiz
        .canonicalize()
        .map_err(|e| format!("pasta inacessível: {e}"))?;

    let mut alvo = raiz.clone();
    for parte in relativo.split('/') {
        if parte.is_empty() || parte == "." || parte == ".." || parte.contains('\\') {
            return Err(format!("caminho recusado: {relativo}"));
        }
        alvo.push(parte);
    }

    // O pai precisa existir e continuar dentro da raiz depois de canonizado —
    // é o passo que pega link simbólico apontando para fora do vault.
    if let Some(pai) = alvo.parent() {
        std::fs::create_dir_all(pai).map_err(|e| e.to_string())?;
        let pai_real = pai.canonicalize().map_err(|e| e.to_string())?;
        if !pai_real.starts_with(&raiz) {
            return Err(format!("caminho sai da pasta escolhida: {relativo}"));
        }
    }
    Ok(alvo)
}

/// Nome de arquivo seguro a partir de um título qualquer. Sem isso, um curso
/// chamado "C#: da/para" viraria caminho.
fn nome_seguro(t: &str) -> String {
    let limpo: String = t
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' | '#' | '^' | '[' | ']' => '-',
            c if c.is_control() => '-',
            c => c,
        })
        .collect();
    let cortado = limpo.trim().trim_matches('.').chars().take(80).collect::<String>();
    if cortado.is_empty() {
        "sem-titulo".into()
    } else {
        cortado
    }
}

#[derive(Serialize, Default)]
pub struct Resultado {
    pub criados: Vec<String>,
    pub atualizados: Vec<String>,
    /// Arquivos que o app deixou de tocar porque alguém os editou por fora.
    pub preservados: Vec<String>,
    pub erros: Vec<String>,
}

/// Grava um arquivo respeitando edição externa.
///
/// Devolve o que aconteceu, e é aqui que mora a garantia do módulo: se o
/// arquivo existe e não bate com o hash que gravamos, saímos sem escrever.
fn escrever(
    db: &Db,
    raiz: &Path,
    relativo: &str,
    conteudo: &str,
    somente_criar: bool,
    r: &mut Resultado,
) {
    let alvo = match destino(raiz, relativo) {
        Ok(a) => a,
        Err(e) => {
            r.erros.push(format!("{relativo}: {e}"));
            return;
        }
    };

    let existe = alvo.exists();

    if existe {
        if somente_criar {
            r.preservados.push(relativo.into());
            return;
        }

        let atual = std::fs::read_to_string(&alvo).unwrap_or_default();
        let gravado: Option<String> = db.conn.lock().ok().and_then(|c| {
            c.query_row(
                "SELECT hash FROM obsidian_arquivos WHERE caminho = ?1",
                params![relativo],
                |row| row.get(0),
            )
            .ok()
        });

        // Sem registro nosso, o arquivo é de outra pessoa: não é conflito, é
        // propriedade. Também não tocamos.
        let nosso = gravado.as_deref() == Some(hash_de(&atual).as_str());
        if !nosso {
            if let Ok(c) = db.conn.lock() {
                let _ = c.execute(
                    "INSERT INTO obsidian_arquivos (caminho, hash, escrito_em, conflito_em)
                     VALUES (?1, '', 0, ?2)
                     ON CONFLICT(caminho) DO UPDATE SET conflito_em = ?2",
                    params![relativo, agora_ms()],
                );
            }
            r.preservados.push(relativo.into());
            return;
        }

        if atual == conteudo {
            return; // nada mudou; não mexe na data de modificação à toa
        }
    }

    if let Err(e) = std::fs::write(&alvo, conteudo) {
        r.erros.push(format!("{relativo}: {e}"));
        return;
    }

    if let Ok(c) = db.conn.lock() {
        let _ = c.execute(
            "INSERT INTO obsidian_arquivos (caminho, hash, escrito_em, conflito_em)
             VALUES (?1, ?2, ?3, NULL)
             ON CONFLICT(caminho) DO UPDATE
               SET hash = excluded.hash, escrito_em = excluded.escrito_em,
                   conflito_em = NULL",
            params![relativo, hash_de(conteudo), agora_ms()],
        );
    }

    if existe {
        r.atualizados.push(relativo.into());
    } else {
        r.criados.push(relativo.into());
    }
}

fn hm(ms: i64) -> String {
    let min = (ms / 60000).max(0);
    if min < 60 {
        format!("{min}m")
    } else if min % 60 == 0 {
        format!("{}h", min / 60)
    } else {
        format!("{}h{:02}m", min / 60, min % 60)
    }
}

/// Exporta o dia. `dia` é `AAAA-MM-DD` local e as fronteiras chegam prontas em
/// milissegundos — a interface é quem sabe o fuso, como em todo o resto do app.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn obsidian_exportar(
    db: tauri::State<Db>,
    dia: String,
    inicio: i64,
    fim: i64,
) -> Result<Resultado, String> {
    let cfg = config_de(&db);
    let pasta = cfg
        .pasta
        .clone()
        .filter(|p| !p.is_empty())
        .ok_or("escolha a pasta do vault primeiro")?;
    let raiz = PathBuf::from(&pasta);
    if !raiz.is_dir() {
        return Err(format!("a pasta não existe: {pasta}"));
    }

    let mut r = Resultado::default();

    // --- nota diária ---
    if cfg.exportar_diario {
        let (sessoes, estudo_ms, total_ms) = sessoes_md(&db, inicio, fim);
        let tarefas = tarefas_md(&db, &dia);
        let notas = notas_md(&db, inicio, fim);

        let corpo = cfg
            .modelo_diario
            .replace("{{data}}", &dia)
            .replace("{{estudo_min}}", &(estudo_ms / 60000).to_string())
            .replace("{{estudo}}", &hm(estudo_ms))
            .replace("{{total}}", &hm(total_ms))
            .replace("{{sessoes}}", &sessoes)
            .replace("{{tarefas}}", &tarefas)
            .replace("{{notas}}", &notas);

        escrever(
            &db,
            &raiz,
            &format!("diario/{dia}.md"),
            &corpo,
            cfg.somente_criar,
            &mut r,
        );
    }

    // --- uma nota por curso ---
    if cfg.exportar_cursos {
        for (titulo, corpo) in cursos_md(&db) {
            escrever(
                &db,
                &raiz,
                &format!("cursos/{}.md", nome_seguro(&titulo)),
                &corpo,
                cfg.somente_criar,
                &mut r,
            );
        }
    }

    // --- notas do app ---
    if cfg.exportar_notas {
        for (nome, corpo) in notas_arquivos(&db) {
            escrever(
                &db,
                &raiz,
                &format!("notas/{}.md", nome_seguro(&nome)),
                &corpo,
                cfg.somente_criar,
                &mut r,
            );
        }
    }

    Ok(r)
}

// --- geração de Markdown ----------------------------------------------------

fn sessoes_md(db: &Db, inicio: i64, fim: i64) -> (String, i64, i64) {
    let Ok(conn) = db.conn.lock() else {
        return (String::new(), 0, 0);
    };
    let mut estudo = 0i64;
    let mut total = 0i64;
    let mut linhas = Vec::new();

    let _ = conn
        .prepare(
            "SELECT a.nome, a.conta_como_estudo, e.description, c.titulo,
                    e.started_at, e.ended_at
               FROM time_entries e
               JOIN activity_types a ON a.id = e.activity_type_id
               LEFT JOIN courses c ON c.id = e.course_id
              WHERE e.deleted_at IS NULL AND e.ended_at IS NOT NULL
                AND e.started_at < ?2 AND e.ended_at > ?1
              ORDER BY e.started_at",
        )
        .and_then(|mut s| {
            let it = s.query_map(params![inicio, fim], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, i64>(1)? != 0,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, i64>(4)?,
                    row.get::<_, i64>(5)?,
                ))
            })?;
            for x in it {
                let (ativ, conta, desc, curso, ini, f) = x?;
                let d = f - ini;
                total += d;
                if conta {
                    estudo += d;
                }
                let alvo = desc.unwrap_or(ativ);
                let curso_link = curso
                    .map(|c| format!(" — [[{}]]", nome_seguro(&c)))
                    .unwrap_or_default();
                linhas.push(format!("- **{}** · {}{}", hm(d), alvo, curso_link));
            }
            Ok(())
        });

    let texto = if linhas.is_empty() {
        "_Nada registrado._".into()
    } else {
        linhas.join("\n")
    };
    (texto, estudo, total)
}

fn tarefas_md(db: &Db, dia: &str) -> String {
    let Ok(conn) = db.conn.lock() else {
        return String::new();
    };
    let mut linhas = Vec::new();
    let _ = conn
        .prepare(
            "SELECT titulo, estado FROM tasks
              WHERE deleted_at IS NULL AND dia_planejado = ?1 ORDER BY ordem",
        )
        .and_then(|mut s| {
            let it = s.query_map(params![dia], |r| {
                Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
            })?;
            for x in it {
                let (t, e) = x?;
                let marca = if e == "concluida" { "x" } else { " " };
                linhas.push(format!("- [{marca}] {t}"));
            }
            Ok(())
        });
    if linhas.is_empty() {
        "_Sem tarefas planejadas._".into()
    } else {
        linhas.join("\n")
    }
}

fn notas_md(db: &Db, inicio: i64, fim: i64) -> String {
    let Ok(conn) = db.conn.lock() else {
        return String::new();
    };
    let mut linhas = Vec::new();
    let _ = conn
        .prepare(
            "SELECT COALESCE(titulo, substr(conteudo, 1, 60))
               FROM notes
              WHERE deleted_at IS NULL AND created_at >= ?1 AND created_at < ?2
              ORDER BY created_at",
        )
        .and_then(|mut s| {
            let it = s.query_map(params![inicio, fim], |r| r.get::<_, String>(0))?;
            for x in it {
                let t = x?;
                linhas.push(format!("- [[{}]]", nome_seguro(&t)));
            }
            Ok(())
        });
    if linhas.is_empty() {
        "_Sem notas neste dia._".into()
    } else {
        linhas.join("\n")
    }
}

fn cursos_md(db: &Db) -> Vec<(String, String)> {
    let Ok(conn) = db.conn.lock() else {
        return Vec::new();
    };
    let mut saida = Vec::new();
    let _ = conn
        .prepare(
            "SELECT c.titulo, c.estado, c.progresso, c.ultima_url,
                    COALESCE((SELECT SUM(e.ended_at - e.started_at)
                                FROM time_entries e
                                JOIN activity_types a ON a.id = e.activity_type_id
                               WHERE e.course_id = c.id AND e.deleted_at IS NULL
                                 AND e.ended_at IS NOT NULL
                                 AND a.conta_como_estudo = 1), 0)
               FROM courses c
              WHERE c.deleted_at IS NULL ORDER BY c.titulo",
        )
        .and_then(|mut s| {
            let it = s.query_map([], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, i64>(2)?,
                    r.get::<_, Option<String>>(3)?,
                    r.get::<_, i64>(4)?,
                ))
            })?;
            for x in it {
                let (titulo, estado, progresso, url, ms) = x?;
                let link = url
                    .map(|u| format!("\n\n[Continuar de onde parei]({u})"))
                    .unwrap_or_default();
                let corpo = format!(
                    "---\ntipo: curso\nestado: {estado}\nprogresso: {progresso}\nestudo_min: {}\n---\n\n# {titulo}\n\nTempo estudado: **{}**{link}\n",
                    ms / 60000,
                    hm(ms)
                );
                saida.push((titulo, corpo));
            }
            Ok(())
        });
    saida
}

fn notas_arquivos(db: &Db) -> Vec<(String, String)> {
    let Ok(conn) = db.conn.lock() else {
        return Vec::new();
    };
    let mut saida = Vec::new();
    let _ = conn
        .prepare(
            "SELECT COALESCE(n.titulo, substr(n.conteudo, 1, 60)), n.conteudo,
                    c.titulo, n.created_at
               FROM notes n
               LEFT JOIN courses c ON c.id = n.course_id
              WHERE n.deleted_at IS NULL ORDER BY n.updated_at DESC LIMIT 500",
        )
        .and_then(|mut s| {
            let it = s.query_map([], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, Option<String>>(2)?,
                    r.get::<_, i64>(3)?,
                ))
            })?;
            for x in it {
                let (titulo, conteudo, curso, _criada) = x?;
                let curso_prop = curso
                    .map(|c| format!("curso: \"[[{}]]\"\n", nome_seguro(&c)))
                    .unwrap_or_default();
                let corpo =
                    format!("---\ntipo: nota-de-estudo\n{curso_prop}---\n\n# {titulo}\n\n{conteudo}\n");
                saida.push((titulo, corpo));
            }
            Ok(())
        });
    saida
}

/// Arquivos que deixaram de ser atualizados por terem sido editados no vault.
#[derive(Serialize)]
pub struct Conflito {
    pub caminho: String,
    pub conflito_em: i64,
}

#[tauri::command]
pub fn obsidian_conflitos(db: tauri::State<Db>) -> Result<Vec<Conflito>, String> {
    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
    let mut stmt = conn
        .prepare(
            "SELECT caminho, conflito_em FROM obsidian_arquivos
              WHERE conflito_em IS NOT NULL ORDER BY conflito_em DESC",
        )
        .map_err(|e| e.to_string())?;
    let v = stmt
        .query_map([], |r| {
            Ok(Conflito {
                caminho: r.get(0)?,
                conflito_em: r.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(v)
}

/// Assume a versão que está no vault: esquece o que o app tinha gravado, para
/// que a próxima exportação volte a atualizar aquele arquivo.
#[tauri::command]
pub fn obsidian_aceitar_externo(db: tauri::State<Db>, caminho: String) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
    conn.execute(
        "DELETE FROM obsidian_arquivos WHERE caminho = ?1",
        params![caminho],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod testes {
    use super::{destino, hash_de, nome_seguro};

    fn raiz_temporaria(nome: &str) -> std::path::PathBuf {
        let p = std::env::temp_dir().join(format!("estudos-teste-{nome}"));
        let _ = std::fs::create_dir_all(&p);
        p
    }

    #[test]
    fn aceita_caminho_simples() {
        let raiz = raiz_temporaria("ok");
        let alvo = destino(&raiz, "diario/2026-09-02.md").expect("deveria aceitar");
        assert!(alvo.ends_with("2026-09-02.md"));
        assert!(alvo.starts_with(raiz.canonicalize().unwrap()));
    }

    /// O caso que a §13 do plano manda cobrir: travessia de diretório.
    #[test]
    fn recusa_travessia() {
        let raiz = raiz_temporaria("travessia");
        for tentativa in [
            "../fora.md",
            "diario/../../fora.md",
            "./oculto.md",
            "..",
            "diario//vazio.md",
        ] {
            assert!(
                destino(&raiz, tentativa).is_err(),
                "deveria recusar: {tentativa}"
            );
        }
    }

    /// Barra invertida é separador no Windows: aceitá-la dentro de um segmento
    /// deixaria passar `..\\fora.md` disfarçado de nome de arquivo.
    #[test]
    fn recusa_barra_invertida_no_segmento() {
        let raiz = raiz_temporaria("barra");
        assert!(destino(&raiz, "diario/..\\fora.md").is_err());
        assert!(destino(&raiz, "sub\\arquivo.md").is_err());
    }

    #[test]
    fn nome_de_arquivo_nunca_vira_caminho() {
        // Um curso chamado assim existiria de verdade; sem limpeza, viraria
        // pasta e escaparia da estrutura esperada.
        assert_eq!(nome_seguro("C#: da/para"), "C-- da-para");

        // O que importa não é o texto exato, é a propriedade: nada que o
        // sistema de arquivos leia como separador pode sobreviver.
        for entrada in ["../../etc/passwd", "a/b\\c", "x:y|z", "<script>"] {
            let s = nome_seguro(entrada);
            assert!(!s.contains('/'), "{entrada} -> {s}");
            assert!(!s.contains('\\'), "{entrada} -> {s}");
            assert!(!s.contains(':'), "{entrada} -> {s}");
            assert!(!s.starts_with('.'), "{entrada} -> {s}");
        }

        assert_eq!(nome_seguro("  "), "sem-titulo");
        assert_eq!(nome_seguro("...."), "sem-titulo");
        assert!(!nome_seguro("a".repeat(300).as_str()).is_empty());
        assert!(nome_seguro("a".repeat(300).as_str()).len() <= 80);
    }

    #[test]
    fn hash_muda_com_o_conteudo() {
        // É disto que depende a detecção de edição externa: se o hash não
        // mudasse com uma vírgula, o app sobrescreveria trabalho do usuário.
        let a = hash_de("# Nota\n\ntexto");
        let b = hash_de("# Nota\n\ntexto.");
        assert_ne!(a, b);
        assert_eq!(a, hash_de("# Nota\n\ntexto"));
        assert_eq!(a.len(), 64);
    }
}
