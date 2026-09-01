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

#[tauri::command]
pub fn criar_curso(
    db: tauri::State<Db>,
    titulo: String,
    url: Option<String>,
) -> Result<String, String> {
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
