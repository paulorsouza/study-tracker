use actix_web::{web, App, HttpResponse, HttpServer, Responder, HttpRequest};
use actix_cors::Cors;
use crate::db;
use crate::models::{CreateProject, ManualStudySession, Project, StudySession};
use rusqlite::Connection;
use std::sync::Mutex;

pub struct AppState {
    db: Mutex<Connection>,
}

// Project Handlers
async fn create_project_handler(project_data: web::Json<CreateProject>, data: web::Data<AppState>) -> impl Responder {
    let conn = data.db.lock().unwrap();
    match db::create_project(&conn, &project_data.into_inner()) {
        Ok(project) => HttpResponse::Created().json(project),
        Err(e) => HttpResponse::InternalServerError().body(format!("Error creating project: {}", e)),
    }
}

async fn get_projects_handler(data: web::Data<AppState>) -> impl Responder {
    let conn = data.db.lock().unwrap();
    match db::get_all_projects(&conn) {
        Ok(projects) => HttpResponse::Ok().json(projects),
        Err(e) => HttpResponse::InternalServerError().body(format!("Error fetching projects: {}", e)),
    }
}

async fn get_project_handler(path: web::Path<i64>, data: web::Data<AppState>) -> impl Responder {
    let project_id = path.into_inner();
    let conn = data.db.lock().unwrap();
    match db::get_project(&conn, project_id) {
        Ok(Some(project)) => HttpResponse::Ok().json(project),
        Ok(None) => HttpResponse::NotFound().body("Project not found"),
        Err(e) => HttpResponse::InternalServerError().body(format!("Error fetching project: {}", e)),
    }
}

async fn update_project_handler(path: web::Path<i64>, project_data: web::Json<CreateProject>, data: web::Data<AppState>) -> impl Responder {
    let project_id = path.into_inner();
    let conn = data.db.lock().unwrap();
    match db::update_project(&conn, project_id, &project_data.into_inner()) {
        Ok(0) => HttpResponse::NotFound().body("Project not found"),
        Ok(_) => HttpResponse::Ok().json(Project{id: Some(project_id), name: "dummy".to_string()}), // Placeholder, ideally fetch updated
        Err(e) => HttpResponse::InternalServerError().body(format!("Error updating project: {}", e)),
    }
}

async fn delete_project_handler(path: web::Path<i64>, data: web::Data<AppState>) -> impl Responder {
    let project_id = path.into_inner();
    let conn = data.db.lock().unwrap();
    match db::delete_project(&conn, project_id) {
        Ok(0) => HttpResponse::NotFound().body("Project not found"),
        Ok(_) => HttpResponse::Ok().finish(),
        Err(e) => HttpResponse::InternalServerError().body(format!("Error deleting project: {}", e)),
    }
}

// Study Session Handlers
async fn start_session_handler(req: HttpRequest, data: web::Data<AppState>) -> impl Responder {
    let project_id_str = req.match_info().get("project_id").unwrap_or_default();
    let project_id: i64 = match project_id_str.parse() {
        Ok(id) => id,
        Err(_) => return HttpResponse::BadRequest().body("Invalid project_id"),
    };
    let conn = data.db.lock().unwrap();
    // Check if there is an active session
    match db::get_active_study_session(&conn) {
        Ok(Some(_)) => return HttpResponse::Conflict().body("An active session already exists. Clock out first."),
        Ok(None) => {},
        Err(e) => return HttpResponse::InternalServerError().body(format!("Error checking active session: {}", e)),
    }

    match db::create_study_session(&conn, project_id, None) { // Assuming no description on start
        Ok(session) => HttpResponse::Created().json(session),
        Err(e) => HttpResponse::InternalServerError().body(format!("Error starting session: {}", e)),
    }
}

async fn clock_out_session_handler(path: web::Path<i64>, data: web::Data<AppState>) -> impl Responder {
    let session_id = path.into_inner();
    let conn = data.db.lock().unwrap();
    match db::clock_out_study_session(&conn, session_id) {
        Ok(0) => HttpResponse::NotFound().body("Active session not found or already clocked out"),
        Ok(_) => HttpResponse::Ok().finish(),
        Err(e) => HttpResponse::InternalServerError().body(format!("Error clocking out session: {}", e)),
    }
}

async fn add_manual_session_handler(session_data: web::Json<ManualStudySession>, data: web::Data<AppState>) -> impl Responder {
    let conn = data.db.lock().unwrap();
    match db::add_manual_study_session(&conn, &session_data.into_inner()) {
        Ok(session) => HttpResponse::Created().json(session),
        Err(e) => HttpResponse::InternalServerError().body(format!("Error adding manual session: {}", e)),
    }
}

async fn get_sessions_for_project_handler(path: web::Path<i64>, data: web::Data<AppState>) -> impl Responder {
    let project_id = path.into_inner();
    let conn = data.db.lock().unwrap();
    match db::get_study_sessions_for_project(&conn, project_id) {
        Ok(sessions) => HttpResponse::Ok().json(sessions),
        Err(e) => HttpResponse::InternalServerError().body(format!("Error fetching sessions for project: {}", e)),
    }
}

async fn get_all_sessions_handler(data: web::Data<AppState>) -> impl Responder {
    let conn = data.db.lock().unwrap();
    match db::get_all_study_sessions(&conn) {
        Ok(sessions) => HttpResponse::Ok().json(sessions),
        Err(e) => HttpResponse::InternalServerError().body(format!("Error fetching all sessions: {}", e)),
    }
}

async fn get_session_handler(path: web::Path<i64>, data: web::Data<AppState>) -> impl Responder {
    let session_id = path.into_inner();
    let conn = data.db.lock().unwrap();
    match db::get_study_session(&conn, session_id) {
        Ok(Some(session)) => HttpResponse::Ok().json(session),
        Ok(None) => HttpResponse::NotFound().body("Session not found"),
        Err(e) => HttpResponse::InternalServerError().body(format!("Error fetching session: {}", e)),
    }
}

async fn update_session_handler(path: web::Path<i64>, session_data_json: web::Json<ManualStudySession>, data: web::Data<AppState>) -> impl Responder {
    let session_id = path.into_inner();
    let session_data = session_data_json.into_inner(); // Call into_inner() once
    let conn = data.db.lock().unwrap();
    match db::update_study_session(&conn, session_id, &session_data) { // Use the owned data
        Ok(0) => HttpResponse::NotFound().body("Session not found"),
        Ok(_) => HttpResponse::Ok().json(session_data), // Use the owned data for the response
        Err(e) => HttpResponse::InternalServerError().body(format!("Error updating session: {}", e)),
    }
}

async fn delete_session_handler(path: web::Path<i64>, data: web::Data<AppState>) -> impl Responder {
    let session_id = path.into_inner();
    let conn = data.db.lock().unwrap();
    match db::delete_study_session(&conn, session_id) {
        Ok(0) => HttpResponse::NotFound().body("Session not found"),
        Ok(_) => HttpResponse::Ok().finish(),
        Err(e) => HttpResponse::InternalServerError().body(format!("Error deleting session: {}", e)),
    }
}

async fn get_active_session_handler(data: web::Data<AppState>) -> impl Responder {
    let conn = data.db.lock().unwrap();
    match db::get_active_study_session(&conn) {
        Ok(Some(session)) => HttpResponse::Ok().json(session),
        Ok(None) => HttpResponse::Ok().json(Option::<StudySession>::None), // Return null or empty if no active session
        Err(e) => HttpResponse::InternalServerError().body(format!("Error fetching active session: {}", e)),
    }
}

pub async fn run_server(host: String, port: u16) -> std::io::Result<()> {
    let db_connection = db::initialize_db().expect("Failed to initialize database");
    let app_state = web::Data::new(AppState {
        db: Mutex::new(db_connection),
    });

    HttpServer::new(move || {
        let cors = Cors::default()
            .allow_any_origin()
            .allow_any_method()
            .allow_any_header()
            .max_age(3600);

        App::new()
            .app_data(app_state.clone())
            .wrap(cors)
            .service(
                web::scope("/api")
                    // Project routes
                    .route("/projects", web::post().to(create_project_handler))
                    .route("/projects", web::get().to(get_projects_handler))
                    .route("/projects/{project_id}", web::get().to(get_project_handler))
                    .route("/projects/{project_id}", web::put().to(update_project_handler))
                    .route("/projects/{project_id}", web::delete().to(delete_project_handler))
                    // Session routes
                    .route("/sessions/start/{project_id}", web::post().to(start_session_handler))
                    .route("/sessions/clockout/{session_id}", web::post().to(clock_out_session_handler))
                    .route("/sessions/manual", web::post().to(add_manual_session_handler))
                    .route("/sessions", web::get().to(get_all_sessions_handler))
                    .route("/sessions/project/{project_id}", web::get().to(get_sessions_for_project_handler))
                    .route("/sessions/active", web::get().to(get_active_session_handler))
                    .route("/sessions/{session_id}", web::get().to(get_session_handler))
                    .route("/sessions/{session_id}", web::put().to(update_session_handler))
                    .route("/sessions/{session_id}", web::delete().to(delete_session_handler))
            )
    })
    .bind((host, port))?
    .run()
    .await
}

