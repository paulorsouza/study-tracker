use serde::{Serialize, Deserialize};
use chrono::{DateTime, Utc};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Project {
    pub id: Option<i64>,
    pub name: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StudySession {
    pub id: Option<i64>,
    pub project_id: i64,
    pub start_time: DateTime<Utc>,
    pub end_time: Option<DateTime<Utc>>,
    pub description: Option<String>,
}

// Potentially a struct for creating/updating projects
#[derive(Debug, Deserialize)]
pub struct CreateProject {
    pub name: String,
}

// Potentially a struct for creating study sessions
#[derive(Debug, Deserialize)]
pub struct CreateStudySession {
    pub project_id: i64,
    pub description: Option<String>,
}

// Potentially a struct for manually adding/updating study sessions
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ManualStudySession {
    pub project_id: i64,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub description: Option<String>,
}

