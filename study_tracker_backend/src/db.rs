use rusqlite::{Connection, Result, params};
use crate::models::{Project, StudySession, CreateProject, ManualStudySession};
use chrono::{Utc, DateTime};

const DB_PATH: &str = "./study_tracker.db";

pub fn initialize_db() -> Result<Connection> {
    let conn = Connection::open(DB_PATH)?;
    conn.execute(
        "CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE
        )",
        [],
    )?;
    conn.execute(
        "CREATE TABLE IF NOT EXISTS study_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL,
            start_time TEXT NOT NULL,
            end_time TEXT,
            description TEXT,
            FOREIGN KEY (project_id) REFERENCES projects (id) ON DELETE CASCADE
        )",
        [],
    )?;
    Ok(conn)
}

// Project CRUD operations
pub fn create_project(conn: &Connection, project_data: &CreateProject) -> Result<Project> {
    conn.execute(
        "INSERT INTO projects (name) VALUES (?1)",
        params![project_data.name],
    )?;
    let id = conn.last_insert_rowid();
    Ok(Project { id: Some(id), name: project_data.name.clone() })
}

pub fn get_project(conn: &Connection, project_id: i64) -> Result<Option<Project>> {
    let mut stmt = conn.prepare("SELECT id, name FROM projects WHERE id = ?1")?;
    let mut project_iter = stmt.query_map(params![project_id], |row| {
        Ok(Project {
            id: row.get(0)?,
            name: row.get(1)?,
        })
    })?;
    project_iter.next().transpose()
}

pub fn get_all_projects(conn: &Connection) -> Result<Vec<Project>> {
    let mut stmt = conn.prepare("SELECT id, name FROM projects ORDER BY name")?;
    let project_iter = stmt.query_map([], |row| {
        Ok(Project {
            id: row.get(0)?,
            name: row.get(1)?,
        })
    })?;
    project_iter.collect()
}

pub fn update_project(conn: &Connection, project_id: i64, project_data: &CreateProject) -> Result<usize> {
    conn.execute(
        "UPDATE projects SET name = ?1 WHERE id = ?2",
        params![project_data.name, project_id],
    )
}

pub fn delete_project(conn: &Connection, project_id: i64) -> Result<usize> {
    conn.execute("DELETE FROM projects WHERE id = ?1", params![project_id])
}

// Study Session CRUD operations
pub fn create_study_session(conn: &Connection, project_id: i64, description: Option<String>) -> Result<StudySession> {
    let start_time = Utc::now();
    conn.execute(
        "INSERT INTO study_sessions (project_id, start_time, description) VALUES (?1, ?2, ?3)",
        params![project_id, start_time.to_rfc3339(), description],
    )?;
    let id = conn.last_insert_rowid();
    Ok(StudySession {
        id: Some(id),
        project_id,
        start_time,
        end_time: None,
        description,
    })
}

pub fn clock_out_study_session(conn: &Connection, session_id: i64) -> Result<usize> {
    let end_time = Utc::now();
    conn.execute(
        "UPDATE study_sessions SET end_time = ?1 WHERE id = ?2 AND end_time IS NULL",
        params![end_time.to_rfc3339(), session_id],
    )
}

pub fn add_manual_study_session(conn: &Connection, session_data: &ManualStudySession) -> Result<StudySession> {
    conn.execute(
        "INSERT INTO study_sessions (project_id, start_time, end_time, description) VALUES (?1, ?2, ?3, ?4)",
        params![
            session_data.project_id,
            session_data.start_time.to_rfc3339(),
            session_data.end_time.to_rfc3339(),
            session_data.description
        ],
    )?;
    let id = conn.last_insert_rowid();
    Ok(StudySession {
        id: Some(id),
        project_id: session_data.project_id,
        start_time: session_data.start_time,
        end_time: Some(session_data.end_time),
        description: session_data.description.clone(),
    })
}

pub fn get_study_session(conn: &Connection, session_id: i64) -> Result<Option<StudySession>> {
    let mut stmt = conn.prepare("SELECT id, project_id, start_time, end_time, description FROM study_sessions WHERE id = ?1")?;
    let mut session_iter = stmt.query_map(params![session_id], |row| {
        let start_time_str: String = row.get(2)?;
        let end_time_str: Option<String> = row.get(3)?;
        Ok(StudySession {
            id: row.get(0)?,
            project_id: row.get(1)?,
            start_time: DateTime::parse_from_rfc3339(&start_time_str).unwrap().with_timezone(&Utc),
            end_time: end_time_str.map(|s| DateTime::parse_from_rfc3339(&s).unwrap().with_timezone(&Utc)),
            description: row.get(4)?,
        })
    })?;
    session_iter.next().transpose()
}

pub fn get_study_sessions_for_project(conn: &Connection, project_id: i64) -> Result<Vec<StudySession>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, start_time, end_time, description FROM study_sessions WHERE project_id = ?1 ORDER BY start_time DESC"
    )?;
    let session_iter = stmt.query_map(params![project_id], |row| {
        let start_time_str: String = row.get(2)?;
        let end_time_str: Option<String> = row.get(3)?;
        Ok(StudySession {
            id: row.get(0)?,
            project_id: row.get(1)?,
            start_time: DateTime::parse_from_rfc3339(&start_time_str).unwrap().with_timezone(&Utc),
            end_time: end_time_str.map(|s| DateTime::parse_from_rfc3339(&s).unwrap().with_timezone(&Utc)),
            description: row.get(4)?,
        })
    })?;
    session_iter.collect()
}

pub fn get_all_study_sessions(conn: &Connection) -> Result<Vec<StudySession>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, start_time, end_time, description FROM study_sessions ORDER BY start_time DESC"
    )?;
    let session_iter = stmt.query_map([], |row| {
        let start_time_str: String = row.get(2)?;
        let end_time_str: Option<String> = row.get(3)?;
        Ok(StudySession {
            id: row.get(0)?,
            project_id: row.get(1)?,
            start_time: DateTime::parse_from_rfc3339(&start_time_str).unwrap().with_timezone(&Utc),
            end_time: end_time_str.map(|s| DateTime::parse_from_rfc3339(&s).unwrap().with_timezone(&Utc)),
            description: row.get(4)?,
        })
    })?;
    session_iter.collect()
}

pub fn update_study_session(conn: &Connection, session_id: i64, session_data: &ManualStudySession) -> Result<usize> {
    conn.execute(
        "UPDATE study_sessions SET project_id = ?1, start_time = ?2, end_time = ?3, description = ?4 WHERE id = ?5",
        params![
            session_data.project_id,
            session_data.start_time.to_rfc3339(),
            session_data.end_time.to_rfc3339(),
            session_data.description,
            session_id
        ],
    )
}

pub fn delete_study_session(conn: &Connection, session_id: i64) -> Result<usize> {
    conn.execute("DELETE FROM study_sessions WHERE id = ?1", params![session_id])
}

pub fn get_active_study_session(conn: &Connection) -> Result<Option<StudySession>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, start_time, end_time, description FROM study_sessions WHERE end_time IS NULL ORDER BY start_time DESC LIMIT 1"
    )?;
    let mut session_iter = stmt.query_map([], |row| {
        let start_time_str: String = row.get(2)?;
        let end_time_str: Option<String> = row.get(3)?;
        Ok(StudySession {
            id: row.get(0)?,
            project_id: row.get(1)?,
            start_time: DateTime::parse_from_rfc3339(&start_time_str).unwrap().with_timezone(&Utc),
            end_time: end_time_str.map(|s| DateTime::parse_from_rfc3339(&s).unwrap().with_timezone(&Utc)),
            description: row.get(4)?,
        })
    })?;
    session_iter.next().transpose()
}

