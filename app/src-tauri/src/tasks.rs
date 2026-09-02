//! Planejamento (§3.3).
//!
//! A tarefa não é só um item de lista: ela é o ponto de partida da sessão.
//! O indicador nº 1 de §2 do plano é "percentual de sessões iniciadas a partir
//! do planejamento" — se começar a estudar a partir da tarefa for mais difícil
//! que apertar o cronômetro solto, esse número nunca sobe.
//!
//! `dia_planejado` é texto `AAAA-MM-DD` na data local, não instante. É
//! deliberado: "segunda-feira" não deixa de ser segunda porque o usuário viajou
//! de fuso, e o plano pede tratamento explícito de fuso e horário de verão.

use crate::db::{agora_ms, Db};
use rusqlite::params;
use serde::Serialize;

#[derive(Serialize)]
pub struct Tarefa {
    pub id: String,
    pub titulo: String,
    pub course_id: Option<String>,
    pub curso: Option<String>,
    pub duracao_estimada_min: Option<i64>,
    pub prioridade: i64,
    pub dia_planejado: Option<String>,
    pub ordem: i64,
    pub estado: String,
    pub concluida_em: Option<i64>,
    /// Tempo já lançado contra esta tarefa. É o "planejado versus realizado"
    /// de §3.11, calculado na consulta em vez de guardado — total guardado
    /// desatualiza na primeira edição de lançamento.
    pub realizado_ms: i64,
}

const SELECT: &str = "
  SELECT t.id, t.titulo, t.course_id, c.titulo, t.duracao_estimada_min,
         t.prioridade, t.dia_planejado, t.ordem, t.estado, t.concluida_em,
         COALESCE((SELECT SUM(COALESCE(e.ended_at, 0) - e.started_at)
                     FROM time_entries e
                    WHERE e.task_id = t.id AND e.deleted_at IS NULL
                      AND e.ended_at IS NOT NULL), 0)
    FROM tasks t
    LEFT JOIN courses c ON c.id = t.course_id
   WHERE t.deleted_at IS NULL";

fn ler(r: &rusqlite::Row) -> rusqlite::Result<Tarefa> {
    Ok(Tarefa {
        id: r.get(0)?,
        titulo: r.get(1)?,
        course_id: r.get(2)?,
        curso: r.get(3)?,
        duracao_estimada_min: r.get(4)?,
        prioridade: r.get(5)?,
        dia_planejado: r.get(6)?,
        ordem: r.get(7)?,
        estado: r.get(8)?,
        concluida_em: r.get(9)?,
        realizado_ms: r.get(10)?,
    })
}

/// `dia` traz as tarefas daquele dia; `atrasadas` traz as abertas de dias
/// anteriores; `concluidas` traz as últimas encerradas.
#[tauri::command]
pub fn listar_tarefas(
    db: tauri::State<Db>,
    dia: Option<String>,
    ate: Option<String>,
    modo: String,
) -> Result<Vec<Tarefa>, String> {
    let conn = db.conn.lock().unwrap();

    let (sql, args): (String, Vec<String>) = match modo.as_str() {
        "atrasadas" => (
            format!(
                "{SELECT} AND t.estado = 'aberta' AND t.dia_planejado IS NOT NULL
                   AND t.dia_planejado < ?1
                 ORDER BY t.dia_planejado, t.ordem"
            ),
            vec![dia.clone().unwrap_or_default()],
        ),
        "concluidas" => (
            format!("{SELECT} AND t.estado = 'concluida' ORDER BY t.concluida_em DESC LIMIT 60"),
            vec![],
        ),
        "sem_dia" => (
            format!("{SELECT} AND t.estado = 'aberta' AND t.dia_planejado IS NULL ORDER BY t.ordem"),
            vec![],
        ),
        // Intervalo: usado pela semana. Sem `ate`, é um dia só.
        _ => (
            format!(
                "{SELECT} AND t.dia_planejado >= ?1 AND t.dia_planejado <= ?2
                 ORDER BY t.dia_planejado, t.ordem"
            ),
            vec![
                dia.clone().unwrap_or_default(),
                ate.or(dia).unwrap_or_default(),
            ],
        ),
    };

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let v = stmt
        .query_map(rusqlite::params_from_iter(args), |r| ler(r))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(v)
}

#[tauri::command]
pub fn criar_tarefa(
    db: tauri::State<Db>,
    titulo: String,
    curso_id: Option<String>,
    duracao_min: Option<i64>,
    prioridade: Option<i64>,
    dia: Option<String>,
) -> Result<String, String> {
    let titulo = titulo.trim().to_string();
    if titulo.is_empty() {
        return Err("a tarefa precisa de um título".into());
    }

    let conn = db.conn.lock().unwrap();
    // Entra no fim da lista do dia. Ordem explícita e não por data de criação
    // porque o usuário reordena, e reordenar precisa sobreviver a tudo.
    let ordem: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(ordem), -1) + 1 FROM tasks
              WHERE deleted_at IS NULL AND dia_planejado IS ?1",
            params![dia],
            |r| r.get(0),
        )
        .unwrap_or(0);

    let id = uuid::Uuid::new_v4().to_string();
    let agora = agora_ms();
    conn.execute(
        "INSERT INTO tasks
           (id, titulo, course_id, duracao_estimada_min, prioridade, dia_planejado,
            ordem, estado, device_id, version, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'aberta', ?8, 1, ?9, ?9)",
        params![
            id,
            titulo,
            curso_id,
            duracao_min,
            prioridade.unwrap_or(0),
            dia,
            ordem,
            db.device_id,
            agora
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(id)
}

#[tauri::command]
pub fn editar_tarefa(
    db: tauri::State<Db>,
    id: String,
    titulo: String,
    curso_id: Option<String>,
    duracao_min: Option<i64>,
    prioridade: i64,
) -> Result<(), String> {
    let conn = db.conn.lock().unwrap();
    conn.execute(
        "UPDATE tasks SET titulo = ?2, course_id = ?3, duracao_estimada_min = ?4,
                          prioridade = ?5, updated_at = ?6, version = version + 1
          WHERE id = ?1 AND deleted_at IS NULL",
        params![id, titulo.trim(), curso_id, duracao_min, prioridade, agora_ms()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn mover_tarefa(db: tauri::State<Db>, id: String, dia: Option<String>) -> Result<(), String> {
    let conn = db.conn.lock().unwrap();
    let ordem: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(ordem), -1) + 1 FROM tasks
              WHERE deleted_at IS NULL AND dia_planejado IS ?1",
            params![dia],
            |r| r.get(0),
        )
        .unwrap_or(0);
    conn.execute(
        "UPDATE tasks SET dia_planejado = ?2, ordem = ?3, updated_at = ?4,
                          version = version + 1
          WHERE id = ?1 AND deleted_at IS NULL",
        params![id, dia, ordem, agora_ms()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Reordena gravando a posição de cada id na lista recebida.
#[tauri::command]
pub fn reordenar_tarefas(db: tauri::State<Db>, ids: Vec<String>) -> Result<(), String> {
    let mut conn = db.conn.lock().unwrap();
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let agora = agora_ms();
    for (i, id) in ids.iter().enumerate() {
        tx.execute(
            "UPDATE tasks SET ordem = ?2, updated_at = ?3, version = version + 1
              WHERE id = ?1",
            params![id, i as i64, agora],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn mudar_estado_tarefa(
    db: tauri::State<Db>,
    id: String,
    estado: String,
) -> Result<(), String> {
    if !matches!(estado.as_str(), "aberta" | "concluida" | "cancelada") {
        return Err(format!("estado inválido: {estado}"));
    }
    let conn = db.conn.lock().unwrap();
    let concluida_em = (estado == "concluida").then(agora_ms);
    conn.execute(
        "UPDATE tasks SET estado = ?2, concluida_em = ?3, updated_at = ?4,
                          version = version + 1
          WHERE id = ?1 AND deleted_at IS NULL",
        params![id, estado, concluida_em, agora_ms()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn excluir_tarefa(db: tauri::State<Db>, id: String) -> Result<(), String> {
    let conn = db.conn.lock().unwrap();
    conn.execute(
        "UPDATE tasks SET deleted_at = ?2, updated_at = ?2, version = version + 1
          WHERE id = ?1",
        params![id, agora_ms()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Replaneja as tarefas abertas de dias anteriores. §3.3 exige confirmação —
/// a confirmação mora na interface, e esta função devolve quantas moveu para
/// que a tela consiga dizer o que aconteceu em vez de mover em silêncio.
#[tauri::command]
pub fn replanejar_atrasadas(
    db: tauri::State<Db>,
    hoje: String,
    para: String,
) -> Result<usize, String> {
    let conn = db.conn.lock().unwrap();
    let n = conn
        .execute(
            "UPDATE tasks SET dia_planejado = ?2, updated_at = ?3, version = version + 1
              WHERE deleted_at IS NULL AND estado = 'aberta'
                AND dia_planejado IS NOT NULL AND dia_planejado < ?1",
            params![hoje, para, agora_ms()],
        )
        .map_err(|e| e.to_string())?;
    Ok(n)
}
