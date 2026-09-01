mod courses;
mod db;
mod library;
mod timer;

use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Banco e log do cronômetro ficam no diretório de dados do app,
            // fora do repositório e fora de qualquer pasta sincronizada.
            let dir = app.path().app_data_dir()?;

            let conn = db::abrir(&dir.join("estudos.sqlite3"))?;
            let device_id = db::device_id(&conn)?;
            db::semear(&conn, &device_id)?;
            app.manage(db::Db {
                conn: Mutex::new(conn),
                device_id,
            });

            app.manage(courses::UltimasUrls::default());

            let state = timer::TimerState::new(dir.join("spike-timer.jsonl"));
            app.manage(state);
            timer::spawn_heartbeat(app.handle().clone());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            timer::timer_start,
            timer::timer_stop,
            timer::timer_status,
            timer::timer_recover,
            timer::timer_discard_recovery,
            courses::abrir_curso,
            courses::abrir_no_navegador,
            courses::janelas_curso,
            courses::fechar_curso,
            courses::sair_tela_cheia,
            courses::url_atual,
            library::listar_cursos,
            library::criar_curso,
            library::excluir_curso,
            library::favoritar_curso,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
