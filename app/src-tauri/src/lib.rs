mod courses;
mod timer;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // O log de eventos do cronômetro fica no diretório de dados do app,
            // fora do repositório e fora de qualquer pasta sincronizada.
            let dir = app.path().app_data_dir()?;
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
