//! Lançamentos de tempo: ver o dia e corrigir o que estiver errado (§3.5).
//!
//! Um registro de tempo em que o usuário não enxerga o dia e não conserta um
//! erro não ganha confiança — e sem confiança ele para de ser usado. Por isso
//! editar, excluir e desfazer vêm junto com a listagem, não depois.
//!
//! Fronteiras de dia chegam prontas da interface, em milissegundos. É de
//! propósito: o JavaScript já sabe o fuso e o horário de verão do usuário, e
//! duplicar essa lógica aqui só criaria duas verdades para "o que é hoje".

use crate::db::{agora_ms, Db};
use rusqlite::params;
use serde::Serialize;

#[derive(Serialize)]
pub struct Lancamento {
    pub id: String,
    pub started_at: i64,
    pub ended_at: Option<i64>,
    pub activity_type_id: String,
    pub atividade: String,
    pub cor: String,
    pub cor_escura: Option<String>,
    pub conta_como_estudo: bool,
    pub description: Option<String>,
    pub course_id: Option<String>,
    pub curso: Option<String>,
    pub source: String,
}

#[derive(Serialize)]
pub struct TipoAtividade {
    pub id: String,
    pub nome: String,
    pub cor: String,
    pub cor_escura: Option<String>,
    pub conta_como_estudo: bool,
}

/// Aceita `45m`, `1h30`, `1:30`, `2h` e número puro em minutos.
///
/// Devolve minutos. `None` quando não dá para entender — nunca um palpite: um
/// lançamento com duração adivinhada é pior que um lançamento recusado.
pub fn parse_duracao(texto: &str) -> Option<i64> {
    let t = texto.trim().to_lowercase().replace(' ', "");
    if t.is_empty() {
        return None;
    }

    // 1:30
    if let Some((h, m)) = t.split_once(':') {
        let h: i64 = h.parse().ok()?;
        let m: i64 = m.parse().ok()?;
        if !(0..60).contains(&m) {
            return None;
        }
        return Some(h * 60 + m);
    }

    // 1h30 / 1h / 2h00
    if let Some((h, resto)) = t.split_once('h') {
        let h: i64 = h.parse().ok()?;
        if resto.is_empty() {
            return Some(h * 60);
        }
        let m: i64 = resto.trim_end_matches('m').parse().ok()?;
        if !(0..60).contains(&m) {
            return None;
        }
        return Some(h * 60 + m);
    }

    // 45m
    if let Some(m) = t.strip_suffix('m') {
        return m.parse().ok();
    }

    // número puro = minutos
    t.parse().ok()
}

#[tauri::command]
pub fn listar_tipos(db: tauri::State<Db>) -> Result<Vec<TipoAtividade>, String> {
    let conn = db.conn.lock().unwrap();
    let mut stmt = conn
        .prepare(
            "SELECT id, nome, cor, cor_escura, conta_como_estudo FROM activity_types
              WHERE deleted_at IS NULL ORDER BY ordem",
        )
        .map_err(|e| e.to_string())?;
    let v = stmt
        .query_map([], |r| {
            Ok(TipoAtividade {
                id: r.get(0)?,
                nome: r.get(1)?,
                cor: r.get(2)?,
                cor_escura: r.get(3)?,
                conta_como_estudo: r.get::<_, i64>(4)? != 0,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(v)
}

/// Lançamentos que **tocam** o período, não só os que começam dentro dele —
/// senão uma sessão que atravessa a meia-noite some da lista dos dois dias.
#[tauri::command]
pub fn listar_periodo(
    db: tauri::State<Db>,
    inicio: i64,
    fim: i64,
) -> Result<Vec<Lancamento>, String> {
    let conn = db.conn.lock().unwrap();
    let mut stmt = conn
        .prepare(
            "SELECT e.id, e.started_at, e.ended_at, e.activity_type_id, a.nome, a.cor,
                    a.cor_escura, a.conta_como_estudo, e.description, e.course_id,
                    c.titulo, e.source
               FROM time_entries e
               JOIN activity_types a ON a.id = e.activity_type_id
               LEFT JOIN courses c ON c.id = e.course_id
              WHERE e.deleted_at IS NULL
                AND e.started_at < ?2
                AND COALESCE(e.ended_at, ?2) > ?1
              ORDER BY e.started_at",
        )
        .map_err(|e| e.to_string())?;

    let v = stmt
        .query_map(params![inicio, fim], |r| {
            Ok(Lancamento {
                id: r.get(0)?,
                started_at: r.get(1)?,
                ended_at: r.get(2)?,
                activity_type_id: r.get(3)?,
                atividade: r.get(4)?,
                cor: r.get(5)?,
                cor_escura: r.get(6)?,
                conta_como_estudo: r.get::<_, i64>(7)? != 0,
                description: r.get(8)?,
                course_id: r.get(9)?,
                curso: r.get(10)?,
                source: r.get(11)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(v)
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn criar_lancamento(
    db: tauri::State<Db>,
    inicio: i64,
    fim: Option<i64>,
    duracao: Option<String>,
    activity_type_id: String,
    descricao: Option<String>,
    curso_id: Option<String>,
) -> Result<String, String> {
    // Fim explícito ganha da duração; se vierem os dois, o usuário foi mais
    // específico com o fim.
    let fim = match (fim, duracao.as_deref()) {
        (Some(f), _) => f,
        (None, Some(d)) => {
            let min = parse_duracao(d)
                .ok_or_else(|| format!("não entendi a duração “{d}”. Use 45m, 1h30 ou 1:30"))?;
            if min <= 0 {
                return Err("a duração precisa ser maior que zero".into());
            }
            inicio + min * 60_000
        }
        (None, None) => return Err("informe o fim ou a duração".into()),
    };

    if fim < inicio {
        return Err("o fim não pode ser antes do início".into());
    }

    let conn = db.conn.lock().unwrap();
    let id = uuid::Uuid::new_v4().to_string();
    let agora = agora_ms();
    conn.execute(
        "INSERT INTO time_entries
           (id, started_at, ended_at, activity_type_id, description, course_id,
            source, device_id, version, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'manual', ?7, 1, ?8, ?8)",
        params![
            id,
            inicio,
            fim,
            activity_type_id,
            descricao,
            curso_id,
            db.device_id,
            agora
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(id)
}

/// Guarda o estado anterior antes de mexer. É o que sustenta o desfazer e a
/// área de recuperação de §7 — sem isto, "excluir" seria perda real.
fn registrar_revisao(
    conn: &rusqlite::Connection,
    device: &str,
    id: &str,
    operacao: &str,
) -> Result<(), String> {
    let anterior: String = conn
        .query_row(
            "SELECT json_object(
                'started_at', started_at, 'ended_at', ended_at,
                'activity_type_id', activity_type_id, 'description', description,
                'course_id', course_id, 'deleted_at', deleted_at)
               FROM time_entries WHERE id = ?1",
            params![id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO session_revisions
           (id, entry_id, operacao, estado_anterior, device_id, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            uuid::Uuid::new_v4().to_string(),
            id,
            operacao,
            anterior,
            device,
            agora_ms()
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn editar_lancamento(
    db: tauri::State<Db>,
    id: String,
    inicio: i64,
    fim: i64,
    activity_type_id: String,
    descricao: Option<String>,
    curso_id: Option<String>,
) -> Result<(), String> {
    if fim < inicio {
        return Err("o fim não pode ser antes do início".into());
    }
    let conn = db.conn.lock().unwrap();
    registrar_revisao(&conn, &db.device_id, &id, "editar")?;
    conn.execute(
        "UPDATE time_entries
            SET started_at = ?2, ended_at = ?3, activity_type_id = ?4,
                description = ?5, course_id = ?6, updated_at = ?7,
                version = version + 1
          WHERE id = ?1 AND deleted_at IS NULL",
        params![
            id,
            inicio,
            fim,
            activity_type_id,
            descricao,
            curso_id,
            agora_ms()
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn excluir_lancamento(db: tauri::State<Db>, id: String) -> Result<(), String> {
    let conn = db.conn.lock().unwrap();
    registrar_revisao(&conn, &db.device_id, &id, "excluir")?;
    conn.execute(
        "UPDATE time_entries SET deleted_at = ?2, updated_at = ?2, version = version + 1
          WHERE id = ?1",
        params![id, agora_ms()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn restaurar_lancamento(db: tauri::State<Db>, id: String) -> Result<(), String> {
    let conn = db.conn.lock().unwrap();
    registrar_revisao(&conn, &db.device_id, &id, "restaurar")?;
    conn.execute(
        "UPDATE time_entries SET deleted_at = NULL, updated_at = ?2, version = version + 1
          WHERE id = ?1",
        params![id, agora_ms()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod testes {
    use super::parse_duracao;

    #[test]
    fn formatos_aceitos() {
        assert_eq!(parse_duracao("45m"), Some(45));
        assert_eq!(parse_duracao("45"), Some(45));
        assert_eq!(parse_duracao("1h30"), Some(90));
        assert_eq!(parse_duracao("1h"), Some(60));
        assert_eq!(parse_duracao("2h00"), Some(120));
        assert_eq!(parse_duracao("1:30"), Some(90));
        assert_eq!(parse_duracao("0:45"), Some(45));
        assert_eq!(parse_duracao("1h30m"), Some(90));
    }

    #[test]
    fn tolera_espaco_e_caixa() {
        assert_eq!(parse_duracao(" 1H30 "), Some(90));
        assert_eq!(parse_duracao("1 h 30"), Some(90));
    }

    #[test]
    fn recusa_em_vez_de_adivinhar() {
        assert_eq!(parse_duracao(""), None);
        assert_eq!(parse_duracao("abc"), None);
        assert_eq!(parse_duracao("1h70"), None, "minuto acima de 59");
        assert_eq!(parse_duracao("1:70"), None, "minuto acima de 59");
        assert_eq!(parse_duracao("h30"), None);
    }
}

/// Resumo agregado do período, para a ponte. Sai pronto em minutos: o cliente
/// MCP não deveria precisar somar nada para responder "quanto estudei".
pub fn resumo_json(db: &Db, desde: i64, ate: i64) -> serde_json::Value {
    let Ok(conn) = db.conn.lock() else {
        return serde_json::json!({});
    };

    let por_atividade = conn
        .prepare(
            "SELECT a.nome, a.conta_como_estudo,
                    SUM(COALESCE(e.ended_at, ?2) - e.started_at) / 60000
               FROM time_entries e
               JOIN activity_types a ON a.id = e.activity_type_id
              WHERE e.deleted_at IS NULL AND e.started_at < ?2
                AND COALESCE(e.ended_at, ?2) > ?1
              GROUP BY a.id ORDER BY 3 DESC",
        )
        .and_then(|mut s| {
            s.query_map(params![desde, ate], |r| {
                Ok(serde_json::json!({
                    "atividade": r.get::<_, String>(0)?,
                    "conta_como_estudo": r.get::<_, i64>(1)? != 0,
                    "minutos": r.get::<_, i64>(2)?,
                }))
            })?
            .collect::<Result<Vec<_>, _>>()
        })
        .unwrap_or_default();

    let por_curso = conn
        .prepare(
            "SELECT COALESCE(c.titulo, ?3),
                    SUM(COALESCE(e.ended_at, ?2) - e.started_at) / 60000
               FROM time_entries e
               JOIN activity_types a ON a.id = e.activity_type_id
               LEFT JOIN courses c ON c.id = e.course_id
              WHERE e.deleted_at IS NULL AND a.conta_como_estudo = 1
                AND e.started_at < ?2 AND COALESCE(e.ended_at, ?2) > ?1
              GROUP BY e.course_id ORDER BY 2 DESC",
        )
        .and_then(|mut s| {
            s.query_map(params![desde, ate, "Sem curso"], |r| {
                Ok(serde_json::json!({
                    "curso": r.get::<_, String>(0)?,
                    "minutos": r.get::<_, i64>(1)?,
                }))
            })?
            .collect::<Result<Vec<_>, _>>()
        })
        .unwrap_or_default();

    serde_json::json!({
        "desde": desde,
        "ate": ate,
        "por_atividade": por_atividade,
        "por_curso": por_curso,
    })
}
