//! Pacote de fontes para o NotebookLM (§4.3).
//!
//! "Integração baseada em formatos suportados, não em automação de cliques."
//! O app gera **um arquivo Markdown** e abre o NotebookLM; quem adiciona a
//! fonte é o usuário. Não há interface oficial estável para subir fonte, e o
//! plano é explícito em só adotar integração direta quando houver.
//!
//! **Markdown, e não PDF nem CSV.** O plano lista os três, mas o NotebookLM não
//! aceita CSV como fonte, e PDF exigiria uma caixa de geração inteira para
//! entregar o mesmo texto num formato que o NotebookLM converte de volta. Um
//! arquivo só, legível por humano e por máquina, é o que o caso pede.
//!
//! **Nota marcada como indisponível para IA fica de fora.** O usuário tem esse
//! interruptor por nota (`disponivel_para_ia`), e o NotebookLM é IA. Ignorar a
//! marca aqui seria desfazer, em silêncio, uma escolha explícita dele.

use crate::db::Db;
use rusqlite::params;
use serde::Serialize;
use std::fmt::Write as _;

#[derive(Serialize)]
pub struct Pacote {
    pub caminho: String,
    pub bytes: u64,
    pub sessoes: i64,
    pub notas: i64,
    pub notas_ocultas: i64,
    pub tarefas: i64,
}

/// Escapa o que pode quebrar a estrutura do documento.
///
/// Uma nota que comece com `#` viraria título e reorganizaria o sumário do
/// pacote; três crases dentro do texto fechariam um bloco cedo demais. O
/// conteúdo do usuário entra como conteúdo, nunca como marcação da moldura.
fn corpo_seguro(t: &str) -> String {
    t.lines()
        .map(|l| {
            let s = l.trim_end();
            if s.starts_with('#') || s.starts_with("```") {
                format!("\\{s}")
            } else {
                s.to_string()
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn data(ms: i64) -> String {
    // Sem fuso: o pacote é lido por gente e por modelo de linguagem, e os dois
    // se viram melhor com "2026-09-02 14:20" do que com um inteiro.
    let dias = ms / 86_400_000;
    let (a, m, d) = civil(dias);
    let min = (ms % 86_400_000) / 60_000;
    format!("{a:04}-{m:02}-{d:02} {:02}:{:02}", min / 60, min % 60)
}

fn dia(ms: i64) -> String {
    let (a, m, d) = civil(ms / 86_400_000);
    format!("{a:04}-{m:02}-{d:02}")
}

/// Dias desde a época para ano-mês-dia. É o algoritmo de Howard Hinnant, e
/// está aqui em vez de uma dependência de calendário porque é a única conta de
/// data que o módulo precisa.
fn civil(z: i64) -> (i64, i64, i64) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    (if m <= 2 { y + 1 } else { y }, m, d)
}

fn dur(ms: i64) -> String {
    let min = ms / 60_000;
    if min < 60 {
        format!("{min}min")
    } else {
        format!("{}h{:02}", min / 60, min % 60)
    }
}

/// Gera o pacote e devolve o que entrou nele.
///
/// `curso_id` vazio significa "todos os cursos"; `desde`/`ate` recortam o
/// período. Os dois juntos são o "por curso **ou** período" do plano — e nada
/// impede combinar, que é o caso de quem quer só o último mês de um curso.
#[tauri::command]
pub fn gerar_pacote(
    db: tauri::State<Db>,
    caminho: String,
    curso_id: Option<String>,
    desde: i64,
    ate: i64,
) -> Result<Pacote, String> {
    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
    let (md, mut p) = montar(&conn, curso_id, desde, ate)?;
    std::fs::write(&caminho, &md).map_err(|e| format!("não consegui gravar: {e}"))?;
    p.caminho = caminho;
    Ok(p)
}

/// A montagem do documento, separada do comando para poder ser testada.
///
/// O pacote é texto montado à mão a partir de seis consultas; testar só as
/// funções auxiliares deixaria de fora exatamente o que pode sair errado — uma
/// seção vazia, uma nota que não devia estar ali, um título fora de lugar.
fn montar(
    conn: &rusqlite::Connection,
    curso_id: Option<String>,
    desde: i64,
    ate: i64,
) -> Result<(String, Pacote), String> {
    let curso = curso_id.filter(|c| !c.is_empty());

    let titulo_curso: Option<String> = curso.as_ref().and_then(|c| {
        conn.query_row(
            "SELECT titulo FROM courses WHERE id = ?1",
            params![c],
            |r| r.get(0),
        )
        .ok()
    });

    let mut md = String::new();
    let escopo = titulo_curso.clone().unwrap_or_else(|| "Todos os cursos".into());
    let _ = writeln!(md, "# Estudos — {escopo}\n");
    let _ = writeln!(
        md,
        "Período: {} a {}. Pacote gerado em {}.\n",
        dia(desde),
        dia(ate - 1),
        data(crate::db::agora_ms())
    );
    let _ = writeln!(
        md,
        "> Fonte para o NotebookLM. Contém sessões de estudo, notas, dúvidas, \
         tarefas e links do material — tudo registrado pelo próprio usuário.\n"
    );

    // --- visão geral ---------------------------------------------------------
    //
    // O filtro é sempre a mesma cláusula, com `?3` vazio significando "todos".
    // Montá-la condicionalmente deixava a consulta sem `?3` mas os três
    // parâmetros no lugar, e o rusqlite recusa o extra — o caso "todos os
    // cursos", que é o primeiro que alguém tenta, quebrava.
    let filtro_curso = "AND (?3 = '' OR e.course_id = ?3)";
    let p3 = curso.clone().unwrap_or_default();

    let (total_ms, sessoes): (i64, i64) = conn
        .query_row(
            &format!(
                "SELECT COALESCE(SUM(e.ended_at - e.started_at), 0), count(*)
                   FROM time_entries e
                   JOIN activity_types a ON a.id = e.activity_type_id
                  WHERE e.deleted_at IS NULL AND e.ended_at IS NOT NULL
                    AND a.conta_como_estudo = 1
                    AND e.started_at >= ?1 AND e.started_at < ?2 {filtro_curso}"
            ),
            params![desde, ate, p3],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .unwrap_or((0, 0));

    let _ = writeln!(md, "## Visão geral\n");
    let _ = writeln!(md, "- Tempo de estudo: **{}**", dur(total_ms));
    let _ = writeln!(md, "- Sessões: **{sessoes}**");

    // Por matéria: é o corte que o NotebookLM usa melhor, porque agrupa assunto
    // e não recipiente.
    let mut stmt = conn
        .prepare(&format!(
            "SELECT COALESCE(s.nome, 'Sem matéria'),
                    COALESCE(SUM(e.ended_at - e.started_at), 0)
               FROM time_entries e
               JOIN activity_types a ON a.id = e.activity_type_id
               LEFT JOIN subjects s ON s.id = e.subject_id
              WHERE e.deleted_at IS NULL AND e.ended_at IS NOT NULL
                AND a.conta_como_estudo = 1
                AND e.started_at >= ?1 AND e.started_at < ?2 {filtro_curso}
              GROUP BY s.id ORDER BY 2 DESC"
        ))
        .map_err(|e| e.to_string())?;
    let materias = stmt
        .query_map(params![desde, ate, p3], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .unwrap_or_default();
    if materias.len() > 1 {
        let _ = writeln!(md, "\n### Por matéria\n");
        for (nome, ms) in &materias {
            let _ = writeln!(md, "- {nome}: {}", dur(*ms));
        }
    }

    // --- cronologia ----------------------------------------------------------
    let mut stmt = conn
        .prepare(&format!(
            "SELECT e.started_at, e.ended_at, e.description, c.titulo, s.nome,
                    e.aula, e.observacao
               FROM time_entries e
               JOIN activity_types a ON a.id = e.activity_type_id
               LEFT JOIN courses c ON c.id = e.course_id
               LEFT JOIN subjects s ON s.id = e.subject_id
              WHERE e.deleted_at IS NULL AND e.ended_at IS NOT NULL
                AND a.conta_como_estudo = 1
                AND e.started_at >= ?1 AND e.started_at < ?2 {filtro_curso}
              ORDER BY e.started_at"
        ))
        .map_err(|e| e.to_string())?;
    let linhas = stmt
        .query_map(params![desde, ate, p3], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, i64>(1)?,
                r.get::<_, Option<String>>(2)?,
                r.get::<_, Option<String>>(3)?,
                r.get::<_, Option<String>>(4)?,
                r.get::<_, Option<String>>(5)?,
                r.get::<_, Option<String>>(6)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .unwrap_or_default();

    if !linhas.is_empty() {
        let _ = writeln!(md, "\n## Cronologia\n");
        for (ini, fim, desc, curso_t, materia, aula, obs) in &linhas {
            let rotulo = desc.clone().unwrap_or_else(|| "sessão".into());
            let _ = write!(md, "- **{}** ({}) — {rotulo}", data(*ini), dur(fim - ini));
            for extra in [curso_t, materia, aula] {
                if let Some(x) = extra.as_deref().filter(|x| !x.is_empty()) {
                    let _ = write!(md, " · {x}");
                }
            }
            let _ = writeln!(md);
            if let Some(o) = obs.as_deref().filter(|o| !o.is_empty()) {
                let _ = writeln!(md, "  - {}", corpo_seguro(o).replace('\n', " "));
            }
        }
    }

    // --- notas ---------------------------------------------------------------
    let filtro_curso_n = "AND (?3 = '' OR n.course_id = ?3)";
    let mut stmt = conn
        .prepare(&format!(
            "SELECT n.titulo, n.conteudo, n.modelo, c.titulo, n.created_at,
                    (SELECT group_concat(t.tag, ', ') FROM note_tags t WHERE t.note_id = n.id)
               FROM notes n
               LEFT JOIN courses c ON c.id = n.course_id
              WHERE n.deleted_at IS NULL AND n.disponivel_para_ia = 1
                AND n.created_at >= ?1 AND n.created_at < ?2 {filtro_curso_n}
              ORDER BY n.created_at"
        ))
        .map_err(|e| e.to_string())?;
    let notas = stmt
        .query_map(params![desde, ate, p3], |r| {
            Ok((
                r.get::<_, Option<String>>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, Option<String>>(3)?,
                r.get::<_, i64>(4)?,
                r.get::<_, Option<String>>(5)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .unwrap_or_default();

    let ocultas: i64 = conn
        .query_row(
            &format!(
                "SELECT count(*) FROM notes n
                  WHERE n.deleted_at IS NULL AND n.disponivel_para_ia = 0
                    AND n.created_at >= ?1 AND n.created_at < ?2 {filtro_curso_n}"
            ),
            params![desde, ate, p3],
            |r| r.get(0),
        )
        .unwrap_or(0);

    // Dúvidas saem numa seção própria: é o que o NotebookLM responde melhor, e
    // enterrá-las no meio das outras notas desperdiça a pergunta já formulada.
    let (duvidas, outras): (Vec<_>, Vec<_>) =
        notas.iter().partition(|n| n.2 == "duvidas");

    if !outras.is_empty() {
        let _ = writeln!(md, "\n## Notas\n");
        for (titulo, conteudo, modelo, curso_t, criada, tags) in &outras {
            let _ = writeln!(
                md,
                "### {}\n",
                titulo.clone().unwrap_or_else(|| "Sem título".into())
            );
            let mut meta = vec![dia(*criada)];
            if let Some(c) = curso_t {
                meta.push(c.clone());
            }
            if modelo != "livre" {
                meta.push(modelo.clone());
            }
            if let Some(t) = tags.as_deref().filter(|t| !t.is_empty()) {
                meta.push(format!("tags: {t}"));
            }
            let _ = writeln!(md, "*{}*\n", meta.join(" · "));
            let _ = writeln!(md, "{}\n", corpo_seguro(conteudo));
        }
    }

    if !duvidas.is_empty() {
        let _ = writeln!(md, "\n## Perguntas em aberto\n");
        for (titulo, conteudo, _, curso_t, criada, _) in &duvidas {
            let _ = writeln!(
                md,
                "### {} — {}\n",
                titulo.clone().unwrap_or_else(|| "Dúvida".into()),
                dia(*criada)
            );
            if let Some(c) = curso_t {
                let _ = writeln!(md, "*{c}*\n");
            }
            let _ = writeln!(md, "{}\n", corpo_seguro(conteudo));
        }
    }

    // --- tarefas -------------------------------------------------------------
    let filtro_curso_t = "AND (?3 = '' OR t.course_id = ?3)";
    let mut stmt = conn
        .prepare(&format!(
            "SELECT t.titulo, t.estado, c.titulo
               FROM tasks t
               LEFT JOIN courses c ON c.id = t.course_id
              WHERE t.deleted_at IS NULL
                AND COALESCE(t.concluida_em, t.created_at) >= ?1
                AND COALESCE(t.concluida_em, t.created_at) < ?2 {filtro_curso_t}
              ORDER BY t.estado, t.titulo"
        ))
        .map_err(|e| e.to_string())?;
    let tarefas = stmt
        .query_map(params![desde, ate, p3], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, Option<String>>(2)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .unwrap_or_default();

    if !tarefas.is_empty() {
        let _ = writeln!(md, "\n## Tarefas\n");
        for (titulo, estado, curso_t) in &tarefas {
            let marca = if estado == "concluida" { "x" } else { " " };
            let _ = write!(md, "- [{marca}] {titulo}");
            if let Some(c) = curso_t {
                let _ = write!(md, " · {c}");
            }
            let _ = writeln!(md);
        }
    }

    // --- referências ---------------------------------------------------------
    let mut stmt = conn
        .prepare(
            "SELECT titulo, url_principal, ultima_url, professor, plataforma_nome
               FROM (SELECT c.id, c.titulo, c.url_principal, c.ultima_url, c.professor,
                            p.nome AS plataforma_nome
                       FROM courses c
                       LEFT JOIN platforms p ON p.id = c.platform_id
                      WHERE c.deleted_at IS NULL)
              WHERE (?1 = '' OR id = ?1)
              ORDER BY titulo",
        )
        .map_err(|e| e.to_string())?;
    let refs = stmt
        .query_map(params![p3], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, Option<String>>(1)?,
                r.get::<_, Option<String>>(2)?,
                r.get::<_, Option<String>>(3)?,
                r.get::<_, Option<String>>(4)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .unwrap_or_default();

    if !refs.is_empty() {
        let _ = writeln!(md, "\n## Material de referência\n");
        for (titulo, url, ultima, professor, plataforma) in &refs {
            let _ = write!(md, "- **{titulo}**");
            for x in [plataforma, professor] {
                if let Some(v) = x.as_deref().filter(|v| !v.is_empty()) {
                    let _ = write!(md, " · {v}");
                }
            }
            let _ = writeln!(md);
            if let Some(u) = url.as_deref().filter(|u| !u.is_empty()) {
                let _ = writeln!(md, "  - Curso: {u}");
            }
            if let Some(u) = ultima.as_deref().filter(|u| !u.is_empty()) {
                let _ = writeln!(md, "  - Última aula acessada: {u}");
            }
        }
    }

    if ocultas > 0 {
        let _ = writeln!(
            md,
            "\n---\n\n*{ocultas} nota(s) ficaram de fora por estarem marcadas como \
             indisponíveis para IA.*"
        );
    }

    let p = Pacote {
        caminho: String::new(),
        bytes: md.len() as u64,
        sessoes,
        notas: notas.len() as i64,
        notas_ocultas: ocultas,
        tarefas: tarefas.len() as i64,
    };
    Ok((md, p))
}

/// Abre o NotebookLM no navegador padrão.
///
/// Endereço fixo no código, e não vindo de configuração: um destino
/// configurável seria um lugar a mais onde alguém poderia apontar o app para
/// um site qualquer.
#[tauri::command]
pub fn abrir_notebooklm(app: tauri::AppHandle) -> Result<(), String> {
    crate::library::abrir_no_navegador(app, "https://notebooklm.google.com/".into())
}

#[cfg(test)]
mod testes {
    use super::*;

    #[test]
    fn datas_conhecidas() {
        assert_eq!(civil(0), (1970, 1, 1));
        assert_eq!(civil(19_723), (2024, 1, 1), "ano bissexto");
        assert_eq!(dia(1_756_800_000_000), "2025-09-02");
        assert_eq!(&data(1_756_800_000_000)[..10], "2025-09-02");
    }

    #[test]
    fn titulo_dentro_da_nota_nao_vira_secao_do_pacote() {
        // Sem isto, uma nota que começa com "# Aula 1" criaria um título de
        // primeiro nível no meio do documento e bagunçaria o sumário que o
        // NotebookLM monta.
        let t = corpo_seguro("# Aula 1\ntexto normal\n``` codigo");
        assert!(t.starts_with("\\# Aula 1"));
        assert!(t.contains("\ntexto normal"));
        assert!(t.contains("\\``` codigo"));
    }

    #[test]
    fn duracao_legivel() {
        assert_eq!(dur(45 * 60_000), "45min");
        assert_eq!(dur(60 * 60_000), "1h00");
        assert_eq!(dur(95 * 60_000), "1h35");
    }

    /// Banco mínimo com o suficiente para o pacote ter todas as seções.
    fn banco() -> rusqlite::Connection {
        let c = rusqlite::Connection::open_in_memory().unwrap();
        c.execute_batch(
            r#"
            CREATE TABLE activity_types (id TEXT PRIMARY KEY, conta_como_estudo INT);
            CREATE TABLE subjects (id TEXT PRIMARY KEY, nome TEXT);
            CREATE TABLE platforms (id TEXT PRIMARY KEY, nome TEXT);
            CREATE TABLE courses (id TEXT PRIMARY KEY, titulo TEXT, url_principal TEXT,
                                  ultima_url TEXT, professor TEXT, platform_id TEXT,
                                  deleted_at INT);
            CREATE TABLE tasks (id TEXT PRIMARY KEY, titulo TEXT, estado TEXT,
                                course_id TEXT, concluida_em INT, created_at INT,
                                deleted_at INT);
            CREATE TABLE time_entries (id TEXT PRIMARY KEY, started_at INT, ended_at INT,
                                       description TEXT, course_id TEXT, subject_id TEXT,
                                       aula TEXT, observacao TEXT, activity_type_id TEXT,
                                       deleted_at INT);
            CREATE TABLE notes (id TEXT PRIMARY KEY, titulo TEXT, conteudo TEXT,
                                modelo TEXT, course_id TEXT, created_at INT,
                                disponivel_para_ia INT, deleted_at INT);
            CREATE TABLE note_tags (note_id TEXT, tag TEXT);

            INSERT INTO activity_types VALUES ('at-estudo', 1), ('at-pausa', 0);
            INSERT INTO subjects VALUES ('m1', 'Modelagem 3D'), ('m2', 'Renda variável');
            INSERT INTO platforms VALUES ('p1', 'Hotmart');
            INSERT INTO courses VALUES
              ('c1','Blender','https://ex/c1','https://ex/aula13','Rafael','p1',NULL);

            INSERT INTO time_entries VALUES
              ('e1', 1000, 3_601_000, 'Aula 13', 'c1', 'm1', 'Aula 13', 'fluiu', 'at-estudo', NULL),
              ('e2', 4000, 5_800_000, 'Retopologia', 'c1', 'm2', NULL, NULL, 'at-estudo', NULL),
              ('e3', 6000, 7_000_000, 'cafe', NULL, NULL, NULL, NULL, 'at-pausa', NULL);

            INSERT INTO notes VALUES
              ('n1','Snap','# titulo interno\nO snap resolve','resumo','c1',2000,1,NULL),
              ('n2','O que travou','Nao entendi modificadores','duvidas','c1',3000,1,NULL),
              ('n3','Segredo','isso e pessoal','livre','c1',4000,0,NULL);
            INSERT INTO note_tags VALUES ('n1','blender');

            INSERT INTO tasks VALUES
              ('t1','Refazer exercicio','aberta','c1',NULL,5000,NULL),
              ('t2','Assistir aula 12','concluida','c1',6000,1000,NULL);
            "#,
        )
        .unwrap();
        c
    }

    #[test]
    fn o_pacote_tem_todas_as_secoes() {
        let c = banco();
        let (md, p) = montar(&c, None, 0, 9_999_999).unwrap();

        for secao in [
            "## Visão geral",
            "### Por matéria",
            "## Cronologia",
            "## Notas",
            "## Perguntas em aberto",
            "## Tarefas",
            "## Material de referência",
        ] {
            assert!(md.contains(secao), "faltou {secao}\n---\n{md}");
        }

        assert_eq!(p.sessoes, 2, "a pausa não conta como sessão de estudo");
        assert_eq!(p.notas, 2);
        assert_eq!(p.tarefas, 2);
        assert!(md.contains("- [x] Assistir aula 12"));
        assert!(md.contains("- [ ] Refazer exercicio"));
        assert!(md.contains("Última aula acessada: https://ex/aula13"));
    }

    #[test]
    fn nota_indisponivel_para_ia_nao_entra_e_o_pacote_avisa() {
        // O interruptor é do usuário e o NotebookLM é IA: vazar a nota aqui
        // desfaria em silêncio uma escolha explícita dele.
        let c = banco();
        let (md, p) = montar(&c, None, 0, 9_999_999).unwrap();
        assert!(!md.contains("isso e pessoal"), "nota privada vazou no pacote");
        assert_eq!(p.notas_ocultas, 1);
        assert!(md.contains("indisponíveis para IA"));
    }

    #[test]
    fn duvida_vai_para_perguntas_e_nao_para_notas() {
        let c = banco();
        let (md, _) = montar(&c, None, 0, 9_999_999).unwrap();
        let i_notas = md.find("## Notas").unwrap();
        let i_perg = md.find("## Perguntas em aberto").unwrap();
        let i_duvida = md.find("Nao entendi modificadores").unwrap();
        assert!(i_duvida > i_perg, "a dúvida caiu fora da seção de perguntas");
        assert!(i_perg > i_notas);
    }

    #[test]
    fn o_recorte_e_pelo_inicio_da_sessao() {
        // Mesma regra do resto do app: a sessão pertence ao período em que
        // **começou**, mesmo que termine depois. Cortar pelo fim faria o pacote
        // discordar da folha da semana e do Painel.
        let c = banco();
        let (_, dentro) = montar(&c, None, 0, 3_000).unwrap();
        assert_eq!(dentro.sessoes, 1, "e1 começa em 1000 e entra no recorte");

        let (md, fora) = montar(&c, None, 10_000, 20_000).unwrap();
        assert_eq!(fora.sessoes, 0);
        assert!(!md.contains("## Cronologia"), "seção vazia não deve aparecer");
    }

    #[test]
    fn titulo_dentro_da_nota_nao_cria_secao_no_pacote() {
        let c = banco();
        let (md, _) = montar(&c, None, 0, 9_999_999).unwrap();
        assert!(md.contains("\\# titulo interno"), "o # da nota não foi escapado");
    }
}
