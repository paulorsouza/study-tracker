mod bridge;
mod db;
mod entries;
mod library;
mod pomodoro;
mod tasks;
mod timer;

use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            // Banco e log do cronômetro ficam no diretório de dados do app,
            // fora do repositório e fora de qualquer pasta sincronizada.
            let dir = app.path().app_data_dir()?;

            let conn = db::abrir(&dir.join("estudos.sqlite3"))?;
            let device_id = db::device_id(&conn)?;
            db::semear(&conn, &device_id)?;
            let token = bridge::token(&conn)?;
            app.manage(db::Db {
                conn: Mutex::new(conn),
                device_id,
            });

            let state = timer::TimerState::new(dir.join("timer-eventos.jsonl"));
            app.manage(state);
            timer::spawn_heartbeat(app.handle().clone());

            // A sessão de Pomodoro é restaurada do banco: fechar o app no meio
            // de um ciclo não pode zerar a contagem de focos, senão a pausa
            // longa nunca chega na hora certa.
            let sessao = pomodoro::restaurar(app.state::<db::Db>().inner());
            app.manage(pomodoro::PomodoroState(Mutex::new(sessao)));
            pomodoro::spawn_relogio(app.handle().clone());

            app.manage(bridge::Ponte {
                porta: bridge::PORTA_PADRAO,
                token: token.clone(),
            });
            bridge::iniciar(app.handle().clone(), bridge::PORTA_PADRAO, token);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            timer::timer_start,
            timer::timer_stop,
            timer::timer_status,
            timer::timer_recover,
            timer::timer_discard_recovery,
            library::listar_cursos,
            library::criar_curso,
            library::excluir_curso,
            library::favoritar_curso,
            library::abrir_no_navegador,
            entries::listar_tipos,
            entries::listar_periodo,
            entries::criar_lancamento,
            entries::editar_lancamento,
            entries::excluir_lancamento,
            entries::restaurar_lancamento,
            tasks::listar_tarefas,
            tasks::criar_tarefa,
            tasks::editar_tarefa,
            tasks::mover_tarefa,
            tasks::reordenar_tarefas,
            tasks::mudar_estado_tarefa,
            tasks::excluir_tarefa,
            tasks::replanejar_atrasadas,
            pomodoro::pomodoro_config,
            pomodoro::pomodoro_salvar_config,
            pomodoro::pomodoro_iniciar,
            pomodoro::pomodoro_avancar,
            pomodoro::pomodoro_encerrar,
            pomodoro::pomodoro_estado,
            pomodoro::pomodoro_ciclos,
            bridge::ponte_info,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
