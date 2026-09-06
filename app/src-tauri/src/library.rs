//! Biblioteca de cursos (§3.6) e o "continuar estudando" (§3.7).
//!
//! O caminho de navegação da plataforma é ruim de seguir todo dia. A saída não
//! é automatizar cliques na Hotmart — é guardar a URL da aula em que o usuário
//! parou e voltar direto para ela. Isso resolve sem depender do layout de
//! terceiro, que é justamente o risco que D-006 manda evitar.

use crate::db::{agora_ms, Db};
use rusqlite::params;
use serde::Serialize;

#[derive(Serialize)]
pub struct Curso {
    pub id: String,
    pub titulo: String,
    pub url_principal: Option<String>,
    pub ultima_url: Option<String>,
    pub ultima_url_em: Option<i64>,
    pub estado: String,
    pub favorito: bool,
}

#[tauri::command]
pub fn listar_cursos(db: tauri::State<Db>) -> Result<Vec<Curso>, String> {
    listar(&db)
}

pub fn listar(db: &Db) -> Result<Vec<Curso>, String> {
    let conn = db.conn.lock().unwrap();
    let mut stmt = conn
        .prepare(
            "SELECT id, titulo, url_principal, ultima_url, ultima_url_em, estado, favorito
               FROM courses
              WHERE deleted_at IS NULL
              ORDER BY favorito DESC, updated_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let linhas = stmt
        .query_map([], |r| {
            Ok(Curso {
                id: r.get(0)?,
                titulo: r.get(1)?,
                url_principal: r.get(2)?,
                ultima_url: r.get(3)?,
                ultima_url_em: r.get(4)?,
                estado: r.get(5)?,
                favorito: r.get::<_, i64>(6)? != 0,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(linhas)
}

/// Lista enxuta para a extensão: ela só precisa escolher contra o quê contar
/// tempo, não do registro inteiro.
pub fn cursos_json(db: &Db) -> serde_json::Value {
    match listar(db) {
        Ok(cs) => serde_json::json!(cs
            .iter()
            .map(|c| serde_json::json!({ "id": c.id, "titulo": c.titulo }))
            .collect::<Vec<_>>()),
        Err(_) => serde_json::json!([]),
    }
}

#[tauri::command]
pub fn criar_curso(
    db: tauri::State<Db>,
    titulo: String,
    url: Option<String>,
) -> Result<String, String> {
    criar(&db, titulo, url)
}

pub fn criar(db: &Db, titulo: String, url: Option<String>) -> Result<String, String> {
    let titulo = titulo.trim().to_string();
    if titulo.is_empty() {
        return Err("o curso precisa de um título".into());
    }

    let conn = db.conn.lock().unwrap();
    let id = uuid::Uuid::new_v4().to_string();
    let agora = agora_ms();

    conn.execute(
        "INSERT INTO courses (id, titulo, url_principal, estado, device_id, version, created_at, updated_at)
         VALUES (?1, ?2, ?3, 'ativo', ?4, 1, ?5, ?5)",
        params![id, titulo, url, db.device_id, agora],
    )
    .map_err(|e| e.to_string())?;

    Ok(id)
}

#[tauri::command]
pub fn excluir_curso(db: tauri::State<Db>, id: String) -> Result<(), String> {
    let conn = db.conn.lock().unwrap();
    // Exclusão lógica: o histórico de tempo aponta para este curso e não pode
    // ficar órfão. Some da lista, continua no banco.
    conn.execute(
        "UPDATE courses SET deleted_at = ?2, updated_at = ?2, version = version + 1
          WHERE id = ?1",
        params![id, agora_ms()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn favoritar_curso(db: tauri::State<Db>, id: String, favorito: bool) -> Result<(), String> {
    let conn = db.conn.lock().unwrap();
    conn.execute(
        "UPDATE courses SET favorito = ?2, updated_at = ?3, version = version + 1
          WHERE id = ?1 AND deleted_at IS NULL",
        params![id, favorito as i64, agora_ms()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Grava onde o usuário parou. Chamado a cada navegação aceita na janela do
/// curso — é o que sustenta o "continuar estudando".
pub fn registrar_ultima_url(db: &Db, curso_id: &str, url: &str) {
    let Ok(conn) = db.conn.lock() else { return };
    let _ = conn.execute(
        "UPDATE courses SET ultima_url = ?2, ultima_url_em = ?3, updated_at = ?3,
                            version = version + 1
          WHERE id = ?1 AND deleted_at IS NULL",
        params![curso_id, url, agora_ms()],
    );
}

/// Modo navegador dedicado — agora o único (D-007). Abre no navegador padrão
/// do sistema, onde a sessão do usuário já existe. Não copia cookie nem
/// credencial de lugar nenhum.
#[tauri::command]
pub fn abrir_no_navegador(app: tauri::AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let parsed = tauri::Url::parse(&url).map_err(|e| format!("URL inválida: {e}"))?;
    // Só http(s): bloqueia file:, javascript:, data: e esquemas customizados
    // antes de chegarem ao navegador (§8 do plano).
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err(format!("esquema não permitido: {}", parsed.scheme()));
    }
    app.opener()
        .open_url(parsed.as_str(), None::<&str>)
        .map_err(|e| format!("falha ao abrir navegador: {e}"))
}

// --- detalhe do curso (§3.6) -------------------------------------------------

#[derive(Serialize)]
pub struct Plataforma {
    pub id: String,
    pub nome: String,
    pub url_base: Option<String>,
}

#[tauri::command]
pub fn listar_plataformas(db: tauri::State<Db>) -> Result<Vec<Plataforma>, String> {
    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
    let mut stmt = conn
        .prepare(
            "SELECT id, nome, url_base FROM platforms
              WHERE deleted_at IS NULL ORDER BY nome",
        )
        .map_err(|e| e.to_string())?;
    let v = stmt
        .query_map([], |r| {
            Ok(Plataforma {
                id: r.get(0)?,
                nome: r.get(1)?,
                url_base: r.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(v)
}

#[tauri::command]
pub fn criar_plataforma(
    db: tauri::State<Db>,
    nome: String,
    url_base: Option<String>,
) -> Result<String, String> {
    let nome = nome.trim().to_string();
    if nome.is_empty() {
        return Err("a plataforma precisa de um nome".into());
    }
    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
    let id = uuid::Uuid::new_v4().to_string();
    let agora = agora_ms();
    conn.execute(
        "INSERT INTO platforms (id, nome, url_base, device_id, version, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, 1, ?5, ?5)",
        params![id, nome, url_base, db.device_id, agora],
    )
    .map_err(|e| e.to_string())?;
    Ok(id)
}

#[tauri::command]
pub fn listar_tags_curso(db: tauri::State<Db>) -> Result<Vec<String>, String> {
    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
    let mut stmt = conn
        .prepare(
            "SELECT g.tag FROM course_tags g
               JOIN courses c ON c.id = g.course_id AND c.deleted_at IS NULL
              GROUP BY g.tag ORDER BY count(*) DESC, g.tag",
        )
        .map_err(|e| e.to_string())?;
    let v = stmt
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(v)
}

#[derive(Serialize)]
pub struct Detalhe {
    pub id: String,
    pub titulo: String,
    pub platform_id: Option<String>,
    pub plataforma: Option<String>,
    pub professor: Option<String>,
    pub categoria: Option<String>,
    pub estado: String,
    pub prioridade: i64,
    pub progresso: i64,
    pub meta_minutos: Option<i64>,
    pub estimado_min: Option<i64>,
    pub prazo: Option<i64>,
    pub url_principal: Option<String>,
    pub ultima_url: Option<String>,
    pub ultima_url_em: Option<i64>,
    pub favorito: bool,
    pub capa_url: Option<String>,
    pub capa: Option<String>,
    pub tags: Vec<String>,
    /// Tempo que conta como estudo, acumulado neste curso.
    pub total_ms: i64,
    pub recente_ms: i64,
    /// Doze semanas, da mais antiga para a mais recente, em minutos. É a
    /// "distribuição semanal" de §3.6 — e serve para ver abandono, que uma
    /// soma acumulada esconde.
    pub semanas: Vec<i64>,
    pub tarefas_abertas: i64,
    pub tarefas_concluidas: i64,
    pub notas: i64,
    /// As últimas sessões, tarefas e notas presas a este curso. Vêm cortadas:
    /// a página serve para retomar o curso, não para auditar o histórico
    /// inteiro — isso é o que a tela de Histórico faz.
    pub sessoes: Vec<Ligado>,
    pub lista_tarefas: Vec<Ligado>,
    pub lista_notas: Vec<Ligado>,
}

#[derive(Serialize)]
pub struct Ligado {
    pub id: String,
    pub texto: String,
    pub em: Option<i64>,
    /// Duração em ms para sessão; estado para tarefa; vazio para nota.
    pub extra: Option<String>,
    pub concluido: bool,
}

/// Quantas semanas o gráfico mostra, e o intervalo de cada uma.
///
/// `semana_zero` é a segunda-feira da semana corrente, calculada na interface.
/// O índice 0 é a semana mais antiga e o último é a atual — é essa ordem que
/// faz o gráfico ser lido da esquerda para a direita como o tempo passa.
const SEMANAS: i64 = 12;

fn janela_semana(semana_zero: i64, i: i64) -> (i64, i64) {
    const SEMANA: i64 = 7 * 86_400_000;
    let ini = semana_zero - (SEMANAS - 1 - i) * SEMANA;
    (ini, ini + SEMANA)
}

/// Tudo que a página do curso precisa, numa chamada.
///
/// Os recortes de tempo chegam prontos da interface, como no resto do app: é o
/// JavaScript que sabe o fuso, e duplicar isso no Rust criaria duas verdades
/// para "esta semana".
#[tauri::command]
pub fn curso_detalhe(
    db: tauri::State<Db>,
    id: String,
    recente_desde: i64,
    semana_zero: i64,
) -> Result<Detalhe, String> {
    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;

    let mut d = conn
        .query_row(
            "SELECT c.id, c.titulo, c.platform_id, p.nome, c.professor, c.categoria,
                    c.estado, c.prioridade, c.progresso, c.meta_minutos, c.estimado_min,
                    c.prazo, c.url_principal, c.ultima_url, c.ultima_url_em, c.favorito,
                    c.capa_url, c.capa
               FROM courses c
               LEFT JOIN platforms p ON p.id = c.platform_id
              WHERE c.id = ?1 AND c.deleted_at IS NULL",
            params![id],
            |r| {
                Ok(Detalhe {
                    id: r.get(0)?,
                    titulo: r.get(1)?,
                    platform_id: r.get(2)?,
                    plataforma: r.get(3)?,
                    professor: r.get(4)?,
                    categoria: r.get(5)?,
                    estado: r.get(6)?,
                    prioridade: r.get(7)?,
                    progresso: r.get(8)?,
                    meta_minutos: r.get(9)?,
                    estimado_min: r.get(10)?,
                    prazo: r.get(11)?,
                    url_principal: r.get(12)?,
                    ultima_url: r.get(13)?,
                    ultima_url_em: r.get(14)?,
                    favorito: r.get::<_, i64>(15)? != 0,
                    capa_url: r.get(16)?,
                    capa: r.get(17)?,
                    tags: Vec::new(),
                    total_ms: 0,
                    recente_ms: 0,
                    semanas: Vec::new(),
                    tarefas_abertas: 0,
                    tarefas_concluidas: 0,
                    notas: 0,
                    sessoes: Vec::new(),
                    lista_tarefas: Vec::new(),
                    lista_notas: Vec::new(),
                })
            },
        )
        .map_err(|_| "curso não encontrado".to_string())?;

    d.tags = conn
        .prepare("SELECT tag FROM course_tags WHERE course_id = ?1 ORDER BY tag")
        .and_then(|mut s| {
            s.query_map(params![id], |r| r.get::<_, String>(0))?
                .collect::<Result<Vec<_>, _>>()
        })
        .unwrap_or_default();

    let soma = |desde: i64, ate: Option<i64>| -> i64 {
        conn.query_row(
            "SELECT COALESCE(SUM(e.ended_at - e.started_at), 0)
               FROM time_entries e
               JOIN activity_types a ON a.id = e.activity_type_id
              WHERE e.course_id = ?1 AND e.deleted_at IS NULL
                AND e.ended_at IS NOT NULL AND a.conta_como_estudo = 1
                AND e.started_at >= ?2 AND e.started_at < ?3",
            params![id, desde, ate.unwrap_or(i64::MAX)],
            |r| r.get(0),
        )
        .unwrap_or(0)
    };

    d.total_ms = soma(0, None);
    d.recente_ms = soma(recente_desde, None);

    d.semanas = (0..SEMANAS)
        .map(|i| {
            let (ini, fim) = janela_semana(semana_zero, i);
            soma(ini, Some(fim)) / 60000
        })
        .collect();

    let conta = |sql: &str| -> i64 {
        conn.query_row(sql, params![id], |r| r.get(0)).unwrap_or(0)
    };
    d.tarefas_abertas = conta(
        "SELECT count(*) FROM tasks WHERE course_id = ?1 AND deleted_at IS NULL AND estado = 'aberta'",
    );
    d.tarefas_concluidas = conta(
        "SELECT count(*) FROM tasks WHERE course_id = ?1 AND deleted_at IS NULL AND estado = 'concluida'",
    );
    d.notas = conta("SELECT count(*) FROM notes WHERE course_id = ?1 AND deleted_at IS NULL");

    let lista = |sql: &str| -> Vec<Ligado> {
        conn.prepare(sql)
            .and_then(|mut s| {
                s.query_map(params![id], |r| {
                    Ok(Ligado {
                        id: r.get(0)?,
                        texto: r.get(1)?,
                        em: r.get(2)?,
                        extra: r.get(3)?,
                        concluido: r.get::<_, i64>(4)? != 0,
                    })
                })?
                .collect::<Result<Vec<_>, _>>()
            })
            .unwrap_or_default()
    };

    d.sessoes = lista(
        "SELECT id, COALESCE(NULLIF(description, ''), 'sem descrição'), started_at,
                CAST(COALESCE(ended_at - started_at, 0) AS TEXT), 0
           FROM time_entries
          WHERE course_id = ?1 AND deleted_at IS NULL AND ended_at IS NOT NULL
          ORDER BY started_at DESC LIMIT 8",
    );
    // Abertas primeiro: o que falta fazer é o motivo de abrir esta página.
    d.lista_tarefas = lista(
        "SELECT id, titulo, prazo, estado, (estado = 'concluida')
           FROM tasks
          WHERE course_id = ?1 AND deleted_at IS NULL
          ORDER BY (estado = 'aberta') DESC, prazo IS NULL, prazo LIMIT 8",
    );
    d.lista_notas = lista(
        "SELECT id, COALESCE(NULLIF(titulo, ''), 'sem título'), updated_at, NULL, 0
           FROM notes
          WHERE course_id = ?1 AND deleted_at IS NULL
          ORDER BY fixada DESC, updated_at DESC LIMIT 8",
    );

    Ok(d)
}

const ESTADOS: &[&str] = &[
    "nao_iniciado",
    "ativo",
    "pausado",
    "concluido",
    "arquivado",
];

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn salvar_curso(
    db: tauri::State<Db>,
    id: String,
    titulo: String,
    platform_id: Option<String>,
    professor: Option<String>,
    categoria: Option<String>,
    estado: String,
    prioridade: i64,
    progresso: i64,
    meta_minutos: Option<i64>,
    estimado_min: Option<i64>,
    prazo: Option<i64>,
    url_principal: Option<String>,
    capa_url: Option<String>,
    tags: Vec<String>,
) -> Result<(), String> {
    let titulo = titulo.trim().to_string();
    if titulo.is_empty() {
        return Err("o curso precisa de um título".into());
    }
    if !ESTADOS.contains(&estado.as_str()) {
        return Err(format!("estado inválido: {estado}"));
    }
    if !(0..=100).contains(&progresso) {
        return Err("o progresso vai de 0 a 100".into());
    }

    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;

    // As tags entram antes do UPDATE: o gatilho de sincronização monta o
    // payload no UPDATE, com `json_group_array` de `course_tags`, e as tags
    // gravadas depois só viajariam na edição seguinte.
    conn.execute("DELETE FROM course_tags WHERE course_id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    for t in tags.iter() {
        let t = t.trim().to_lowercase().replace(' ', "-");
        if t.is_empty() {
            continue;
        }
        conn.execute(
            "INSERT OR IGNORE INTO course_tags (course_id, tag) VALUES (?1, ?2)",
            params![id, t],
        )
        .map_err(|e| e.to_string())?;
    }

    conn.execute(
        "UPDATE courses
            SET titulo = ?2, platform_id = ?3, professor = ?4, categoria = ?5,
                estado = ?6, prioridade = ?7, progresso = ?8, meta_minutos = ?9,
                estimado_min = ?10, prazo = ?11, url_principal = ?12,
                capa_url = ?13, updated_at = ?14, version = version + 1
          WHERE id = ?1 AND deleted_at IS NULL",
        params![
            id, titulo, platform_id, professor, categoria, estado, prioridade,
            progresso, meta_minutos, estimado_min, prazo, url_principal, capa_url,
            agora_ms()
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Baixa a capa e guarda embutida no banco.
///
/// Fica como data URL porque `img-src` já aceita `data:` — liberar `https:` na
/// CSP deixaria a janela do app buscar imagem em qualquer host, e uma URL
/// digitada errada viraria uma requisição a um servidor desconhecido toda vez
/// que a tela abrisse.
#[tauri::command]
pub async fn baixar_capa(db: tauri::State<'_, Db>, id: String, url: String) -> Result<(), String> {
    let endereco = tauri::Url::parse(url.trim()).map_err(|e| format!("URL inválida: {e}"))?;
    if !matches!(endereco.scheme(), "http" | "https") {
        return Err("a capa precisa de um endereço http ou https".into());
    }

    // Tempo limite: sem ele, um servidor que aceita a conexão e não responde
    // deixaria o comando pendurado sem nunca devolver nada à tela.
    let r = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?
        .get(endereco.as_str())
        .send()
        .await
        .map_err(|e| format!("não consegui baixar: {e}"))?;

    if !r.status().is_success() {
        return Err(format!("o servidor respondeu {}", r.status()));
    }

    // Recusa pelo tamanho anunciado antes de baixar: o corpo inteiro entraria
    // na memória só para ser rejeitado depois.
    if let Some(n) = r.content_length() {
        if n > 400 * 1024 {
            return Err(format!(
                "imagem grande demais ({} KB). Use uma menor que 400 KB.",
                n / 1024
            ));
        }
    }

    let tipo = r
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("image/jpeg")
        .split(';')
        .next()
        .unwrap_or("image/jpeg")
        .to_string();

    if !tipo.starts_with("image/") {
        return Err(format!("o endereço não devolveu uma imagem ({tipo})"));
    }

    let bytes = r.bytes().await.map_err(|e| e.to_string())?;
    // Teto de tamanho: sem ele, uma imagem de vários megabytes entraria no
    // banco e seria relida a cada abertura da tela.
    if bytes.len() > 400 * 1024 {
        return Err(format!(
            "imagem grande demais ({} KB). Use uma menor que 400 KB.",
            bytes.len() / 1024
        ));
    }

    let dados = base64_simples(&bytes);
    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
    conn.execute(
        "UPDATE courses SET capa = ?2, capa_url = ?3, updated_at = ?4,
                            version = version + 1
          WHERE id = ?1 AND deleted_at IS NULL",
        params![id, format!("data:{tipo};base64,{dados}"), url.trim(), agora_ms()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Base64 sem dependência: são doze linhas, e não vale uma caixa nova no
/// `Cargo.toml` para isso.
fn base64_simples(dados: &[u8]) -> String {
    const T: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut s = String::with_capacity(dados.len().div_ceil(3) * 4);
    for bloco in dados.chunks(3) {
        let b = [
            bloco[0],
            *bloco.get(1).unwrap_or(&0),
            *bloco.get(2).unwrap_or(&0),
        ];
        let n = ((b[0] as u32) << 16) | ((b[1] as u32) << 8) | b[2] as u32;
        s.push(T[(n >> 18) as usize & 63] as char);
        s.push(T[(n >> 12) as usize & 63] as char);
        s.push(if bloco.len() > 1 { T[(n >> 6) as usize & 63] as char } else { '=' });
        s.push(if bloco.len() > 2 { T[n as usize & 63] as char } else { '=' });
    }
    s
}

#[cfg(test)]
mod testes {
    use super::{base64_simples, janela_semana, SEMANAS};

    #[test]
    fn base64_com_e_sem_sobra() {
        // Os três restos possíveis: sem padding, um '=' e dois '='. É aqui que
        // implementação escrita à mão costuma errar.
        assert_eq!(base64_simples(b"abc"), "YWJj");
        assert_eq!(base64_simples(b"ab"), "YWI=");
        assert_eq!(base64_simples(b"a"), "YQ==");
        assert_eq!(base64_simples(b""), "");
        assert_eq!(base64_simples(&[0xff, 0xfe, 0xfd]), "//79", "usa + e /");
        assert_eq!(base64_simples(b"qualquer coisa"), "cXVhbHF1ZXIgY29pc2E=");
    }

    #[test]
    fn a_ultima_semana_e_a_corrente() {
        let zero = 1_700_000_000_000;
        let semana = 7 * 86_400_000;

        let (ini, fim) = janela_semana(zero, SEMANAS - 1);
        assert_eq!(ini, zero, "a última barra começa na segunda desta semana");
        assert_eq!(fim, zero + semana);

        let (ini, _) = janela_semana(zero, 0);
        assert_eq!(ini, zero - 11 * semana, "a primeira é onze semanas atrás");
    }

    #[test]
    fn as_janelas_encostam_sem_buraco_nem_sobreposicao() {
        let zero = 1_700_000_000_000;
        for i in 1..SEMANAS {
            assert_eq!(janela_semana(zero, i - 1).1, janela_semana(zero, i).0);
        }
    }
}
