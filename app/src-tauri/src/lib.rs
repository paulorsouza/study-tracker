mod categorias;
mod db;
mod entries;
mod exportacao;
mod familia;
mod library;
mod notas;
mod notebooklm;
mod podcasts;
mod pomodoro;
mod rede;
mod rotinas;
mod supabase;
mod sync;
mod tasks;
mod tempo_real;
mod timer;

// Só no desktop, e não por falta de vontade de portar:
//
// - `bandeja`: o Android não tem bandeja do sistema.
// - `janela`: o modo compacto e a janela do curso são segundas janelas, e o
//   Android tem uma atividade só.
// - `git`: roda o binário `git` num processo externo, que lá não existe.
// - `bridge` e `permissoes`: a ponte HTTP serve a extensão do Chrome e o MCP,
//   ambos de desktop.
// - `obsidian`: grava numa pasta escolhida pelo usuário, e o armazenamento do
//   Android tem escopo.
#[cfg(desktop)]
mod bandeja;
#[cfg(desktop)]
mod bridge;
#[cfg(desktop)]
mod git;
#[cfg(desktop)]
mod janela;
#[cfg(desktop)]
mod obsidian;
#[cfg(desktop)]
mod permissoes;
#[cfg(desktop)]
mod sistema;

use std::sync::Mutex;
use tauri::Manager;

/// Registra os comandos numa lista só, com os de desktop entrando por fora.
///
/// Duplicar a lista em dois `generate_handler!` seria o caminho óbvio e o
/// errado: são mais de noventa comandos, e o primeiro acrescentado depois
/// entraria num dos dois e não no outro — falha que só aparece no celular,
/// como "comando desconhecido", meses depois. Aqui há uma fonte só, e o que
/// é exclusivo do desktop está listado uma vez, à vista.
macro_rules! registrar {
    ($construtor:expr, [$($extra:path),* $(,)?]) => {
        $construtor.invoke_handler(tauri::generate_handler![
            timer::timer_start,
            timer::timer_stop,
            timer::timer_pausar,
            timer::timer_retomar,
            timer::timer_editar,
            timer::timer_ajustar_inicio,
            timer::timer_continuar,
            timer::timer_favorito,
            entries::buscar_lancamentos,
            entries::salvar_detalhes,
            entries::listar_recentes,
            exportacao::exportar_dados,
            notebooklm::gerar_pacote,
            notebooklm::abrir_notebooklm,
            entries::listar_materias,
            entries::criar_materia,
            entries::editar_materia,
            entries::excluir_materia,
            entries::reclassificar_lancamento,
            entries::salvar_vinculos,
            entries::duplicar_lancamento,
            entries::dividir_lancamento,
            entries::unir_lancamentos,
            entries::listar_favoritos,
            entries::criar_favorito,
            entries::excluir_favorito,
            entries::atalhos_ler,
            entries::atalhos_salvar,
            pomodoro::pomodoro_pausar,
            pomodoro::pomodoro_retomar,
            timer::timer_status,
            timer::timer_recover,
            timer::timer_discard_recovery,
            library::listar_cursos,
            library::criar_curso,
            library::excluir_curso,
            library::favoritar_curso,
            library::abrir_no_navegador,
            library::curso_detalhe,
            library::salvar_curso,
            library::baixar_capa,
            library::listar_plataformas,
            library::criar_plataforma,
            library::listar_tags_curso,
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
            podcasts::listar_podcasts,
            podcasts::listar_episodios,
            podcasts::podcasts_importar_opml,
            podcasts::podcasts_atualizar,
            podcasts::podcast_categoria,
            podcasts::excluir_podcast,
            podcasts::episodio_estado,
            podcasts::planejar_episodio,
            rotinas::listar_rotinas,
            rotinas::salvar_rotina,
            rotinas::excluir_rotina,
            pomodoro::pomodoro_config,
            pomodoro::pomodoro_salvar_config,
            pomodoro::pomodoro_iniciar,
            pomodoro::pomodoro_avancar,
            pomodoro::pomodoro_encerrar,
            pomodoro::pomodoro_estado,
            pomodoro::pomodoro_ciclos,
            categorias::paleta,
            categorias::criar_tipo,
            categorias::editar_tipo,
            categorias::excluir_tipo,
            categorias::reordenar_tipos,
            categorias::listar_metas,
            categorias::salvar_meta,
            categorias::excluir_meta,
            notas::listar_notas,
            notas::listar_tags,
            notas::salvar_nota,
            notas::excluir_nota,
            notas::fixar_nota,
            notas::revisar_nota,
            supabase::supabase_salvar_config,
            supabase::supabase_entrar,
            supabase::supabase_sair,
            supabase::supabase_estado,
            supabase::supabase_sql,
            supabase::supabase_recuperar_senha,
            supabase::supabase_trocar_senha,
            supabase::supabase_maquinas,
            supabase::supabase_encerrar_outras,
            supabase::supabase_apagar_nuvem,
            sync::sync_agora,
            sync::sync_pendencias,
            sync::sync_conflitos,
            sync::sync_resolver,
            tempo_real::sync_tempo_real,
            familia::familia_configurar,
            familia::familia_estado,
            familia::familia_enviar_hoje,
            $($extra),*
        ])
    };
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let construtor = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // Banco e log do cronômetro ficam no diretório de dados do app,
            // fora do repositório e fora de qualquer pasta sincronizada.
            let dir = app.path().app_data_dir()?;

            let conn = db::abrir(&dir.join("estudos.sqlite3"))?;
            let device_id = db::device_id(&conn)?;
            db::semear(&conn, &device_id)?;
            // O token da extensão nasce aqui para já existir na tela de
            // configuração; a ponte o relê do banco a cada pedido.
            #[cfg(desktop)]
            bridge::token(&conn)?;
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
            familia::spawn_envio(app.handle().clone());
            tempo_real::iniciar(app.handle().clone());
            rotinas::spawn_materializacao(app.handle().clone());

            #[cfg(desktop)]
            {
                app.manage(bridge::Ponte { porta: bridge::PORTA_PADRAO });
                bridge::iniciar(app.handle().clone(), bridge::PORTA_PADRAO);

                // A bandeja depende do banco e do cronômetro já registrados:
                // ela monta o menu a partir dos dois.
                bandeja::montar(app.handle())?;
                bandeja::spawn_relogio(app.handle().clone());
                janela::vigiar_principal(app.handle());
                sistema::aplicar_salvo(app.handle());

                // Aberto pelo registro de inicialização do sistema: vai direto
                // para a bandeja em vez de aparecer na frente de quem acabou de
                // ligar a máquina.
                if std::env::args().any(|a| a == sistema::ARG_OCULTO) {
                    if let Some(j) = app.get_webview_window("main") {
                        let _ = j.hide();
                    }
                }
            }

            Ok(())
        })
        ;

    // Plugins de desktop: o Android não tem registro de inicialização nem
    // atalho global. Ver `sistema.rs`.
    #[cfg(desktop)]
    let construtor = construtor
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![sistema::ARG_OCULTO]),
        ))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build());

    // O celular é um companheiro: cronômetro, Pomodoro, o dia, cursos e
    // notas, sincronizando com o desktop pelo Supabase.
    #[cfg(desktop)]
    let construtor = registrar!(construtor, [
        bandeja::atualizar_bandeja,
        permissoes::mcp_info,
        permissoes::mcp_salvar_config,
        permissoes::mcp_revogar,
        permissoes::listar_auditoria,
        obsidian::obsidian_config,
        obsidian::obsidian_salvar_config,
        obsidian::obsidian_exportar,
        obsidian::obsidian_conflitos,
        obsidian::obsidian_aceitar_externo,
        git::git_estado,
        git::git_sincronizar,
        janela::abrir_mini,
        janela::fechar_mini,
        janela::expandir,
        janela::mini_no_topo,
        janela::mini_altura,
        bridge::ponte_info,
        bridge::ponte_revogar,
        sistema::sistema_estado,
        sistema::sistema_inicio_automatico,
        sistema::sistema_atalho,
    ]);
    #[cfg(mobile)]
    let construtor = registrar!(construtor, []);

    construtor
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
