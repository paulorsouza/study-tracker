//! Notas (§3.10).
//!
//! A busca é `LIKE` sobre o texto, não FTS. É uma escolha consciente de escala:
//! para alguns milhares de notas pessoais a diferença é imperceptível, e o
//! índice de texto completo traria sincronização de índice, rebuild em
//! migração e um segundo lugar onde a exclusão lógica precisa ser respeitada.
//! Se um dia a busca ficar lenta, trocar é local — o resto do módulo não muda.

use crate::db::{agora_ms, Db};
use rusqlite::params;
use serde::Serialize;

#[derive(Serialize)]
pub struct Nota {
    pub id: String,
    pub titulo: Option<String>,
    pub conteudo: String,
    pub modelo: String,
    pub course_id: Option<String>,
    pub curso: Option<String>,
    pub task_id: Option<String>,
    pub tarefa: Option<String>,
    pub time_entry_id: Option<String>,
    pub revisar_em: Option<String>,
    pub revisada_em: Option<i64>,
    pub disponivel_para_ia: bool,
    pub fixada: bool,
    pub created_at: i64,
    pub updated_at: i64,
    pub tags: Vec<String>,
}

const SELECT: &str = "
  SELECT n.id, n.titulo, n.conteudo, n.modelo, n.course_id, c.titulo,
         n.task_id, t.titulo, n.time_entry_id, n.revisar_em, n.revisada_em,
         n.disponivel_para_ia, n.fixada, n.created_at, n.updated_at
    FROM notes n
    LEFT JOIN courses c ON c.id = n.course_id
    LEFT JOIN tasks t   ON t.id = n.task_id
   WHERE n.deleted_at IS NULL";

fn tags_de(conn: &rusqlite::Connection, id: &str) -> Vec<String> {
    conn.prepare("SELECT tag FROM note_tags WHERE note_id = ?1 ORDER BY tag")
        .and_then(|mut s| {
            s.query_map(params![id], |r| r.get::<_, String>(0))?
                .collect::<Result<Vec<_>, _>>()
        })
        .unwrap_or_default()
}

fn ler(r: &rusqlite::Row) -> rusqlite::Result<Nota> {
    Ok(Nota {
        id: r.get(0)?,
        titulo: r.get(1)?,
        conteudo: r.get(2)?,
        modelo: r.get(3)?,
        course_id: r.get(4)?,
        curso: r.get(5)?,
        task_id: r.get(6)?,
        tarefa: r.get(7)?,
        time_entry_id: r.get(8)?,
        revisar_em: r.get(9)?,
        revisada_em: r.get(10)?,
        disponivel_para_ia: r.get::<_, i64>(11)? != 0,
        fixada: r.get::<_, i64>(12)? != 0,
        created_at: r.get(13)?,
        updated_at: r.get(14)?,
        tags: Vec::new(),
    })
}

/// `busca` casa título e conteúdo; `tag`, `curso` e `revisar_ate` filtram.
/// Tudo opcional — sem filtro nenhum devolve as mais recentes.
#[tauri::command]
pub fn listar_notas(
    db: tauri::State<Db>,
    busca: Option<String>,
    tag: Option<String>,
    curso_id: Option<String>,
    revisar_ate: Option<String>,
) -> Result<Vec<Nota>, String> {
    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;

    let mut sql = String::from(SELECT);
    let mut args: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(b) = busca.as_ref().filter(|b| !b.trim().is_empty()) {
        sql.push_str(
            " AND (lower(n.conteudo) LIKE ?1 OR lower(COALESCE(n.titulo,'')) LIKE ?1)",
        );
        args.push(Box::new(format!("%{}%", b.trim().to_lowercase())));
    }
    if let Some(t) = tag.as_ref().filter(|t| !t.is_empty()) {
        sql.push_str(&format!(
            " AND EXISTS (SELECT 1 FROM note_tags g WHERE g.note_id = n.id AND g.tag = ?{})",
            args.len() + 1
        ));
        args.push(Box::new(t.clone()));
    }
    if let Some(c) = curso_id.as_ref().filter(|c| !c.is_empty()) {
        sql.push_str(&format!(" AND n.course_id = ?{}", args.len() + 1));
        args.push(Box::new(c.clone()));
    }
    if let Some(d) = revisar_ate.as_ref().filter(|d| !d.is_empty()) {
        sql.push_str(&format!(
            " AND n.revisar_em IS NOT NULL AND n.revisar_em <= ?{} AND n.revisada_em IS NULL",
            args.len() + 1
        ));
        args.push(Box::new(d.clone()));
    }

    // Fixadas primeiro, depois as mais recentemente mexidas.
    sql.push_str(" ORDER BY n.fixada DESC, n.updated_at DESC LIMIT 300");

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let refs: Vec<&dyn rusqlite::ToSql> = args.iter().map(|b| b.as_ref()).collect();
    let mut notas = stmt
        .query_map(refs.as_slice(), |r| ler(r))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    for n in &mut notas {
        n.tags = tags_de(&conn, &n.id);
    }
    Ok(notas)
}

#[tauri::command]
pub fn listar_tags(db: tauri::State<Db>) -> Result<Vec<String>, String> {
    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
    let mut stmt = conn
        .prepare(
            "SELECT g.tag FROM note_tags g
               JOIN notes n ON n.id = g.note_id AND n.deleted_at IS NULL
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

/// Tag normalizada: minúscula, sem espaço nas pontas, espaços internos viram
/// hífen. Sem isso "Renda Variável" e "renda variável" viram duas tags.
fn normalizar(t: &str) -> Option<String> {
    let s = t.trim().to_lowercase().replace(' ', "-");
    (!s.is_empty()).then_some(s)
}

fn gravar_tags(conn: &rusqlite::Connection, id: &str, tags: &[String]) -> Result<(), String> {
    conn.execute("DELETE FROM note_tags WHERE note_id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    for t in tags.iter().filter_map(|t| normalizar(t)) {
        conn.execute(
            "INSERT OR IGNORE INTO note_tags (note_id, tag) VALUES (?1, ?2)",
            params![id, t],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn salvar_nota(
    db: tauri::State<Db>,
    id: Option<String>,
    titulo: Option<String>,
    conteudo: String,
    modelo: String,
    curso_id: Option<String>,
    tarefa_id: Option<String>,
    time_entry_id: Option<String>,
    revisar_em: Option<String>,
    disponivel_para_ia: bool,
    tags: Vec<String>,
) -> Result<String, String> {
    if conteudo.trim().is_empty() && titulo.as_deref().unwrap_or("").trim().is_empty() {
        return Err("a nota está vazia".into());
    }

    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
    let agora = agora_ms();

    let id = match id {
        Some(id) => {
            conn.execute(
                "UPDATE notes
                    SET titulo = ?2, conteudo = ?3, modelo = ?4, course_id = ?5,
                        task_id = ?6, revisar_em = ?7, disponivel_para_ia = ?8,
                        updated_at = ?9, version = version + 1
                  WHERE id = ?1 AND deleted_at IS NULL",
                params![
                    id,
                    titulo,
                    conteudo,
                    modelo,
                    curso_id,
                    tarefa_id,
                    revisar_em,
                    disponivel_para_ia as i64,
                    agora
                ],
            )
            .map_err(|e| e.to_string())?;
            id
        }
        None => {
            let novo = uuid::Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO notes
                   (id, titulo, conteudo, modelo, course_id, task_id, time_entry_id,
                    revisar_em, disponivel_para_ia, device_id, version,
                    created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, 1, ?11, ?11)",
                params![
                    novo,
                    titulo,
                    conteudo,
                    modelo,
                    curso_id,
                    tarefa_id,
                    time_entry_id,
                    revisar_em,
                    disponivel_para_ia as i64,
                    db.device_id,
                    agora
                ],
            )
            .map_err(|e| e.to_string())?;
            novo
        }
    };

    gravar_tags(&conn, &id, &tags)?;
    Ok(id)
}

#[tauri::command]
pub fn excluir_nota(db: tauri::State<Db>, id: String) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
    conn.execute(
        "UPDATE notes SET deleted_at = ?2, updated_at = ?2, version = version + 1
          WHERE id = ?1",
        params![id, agora_ms()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn fixar_nota(db: tauri::State<Db>, id: String, fixada: bool) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
    conn.execute(
        "UPDATE notes SET fixada = ?2, updated_at = ?3, version = version + 1
          WHERE id = ?1 AND deleted_at IS NULL",
        params![id, fixada as i64, agora_ms()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Marca a revisão como feita. Não agenda a próxima sozinho: repetição
/// espaçada automática está fora do escopo (§18), e adivinhar o intervalo
/// seria pior que deixar o usuário escolher.
#[tauri::command]
pub fn revisar_nota(db: tauri::State<Db>, id: String, proxima: Option<String>) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
    conn.execute(
        "UPDATE notes SET revisada_em = ?2, revisar_em = ?3, updated_at = ?2,
                          version = version + 1
          WHERE id = ?1 AND deleted_at IS NULL",
        params![id, agora_ms(), proxima],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
