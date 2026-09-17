//! Integração com o sistema operacional: abrir junto com ele e um atalho que
//! funciona com o app atrás de tudo. Só desktop.
//!
//! O atalho global contraria o que foi decidido em D-031, e de propósito:
//! atalho global tira a tecla de dentro do Chrome, que é onde o estudo
//! acontece. Por isso ele **nasce desligado** e a combinação é escolhida pelo
//! usuário — quem liga aceita o preço, e quem nunca abrir esta tela não paga
//! nada.

use crate::db::Db;
use crate::timer::{self, Inicio, TimerState};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::GlobalShortcutExt;

/// Passada pelo registro de inicialização do sistema: o app sobe direto para a
/// bandeja, sem roubar a tela de quem acabou de ligar o computador.
pub const ARG_OCULTO: &str = "--oculto";

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct Atalho {
    pub ativo: bool,
    /// No formato do plugin: "CommandOrControl+Alt+S".
    pub combo: Option<String>,
}

pub fn atalho_de(db: &Db) -> Atalho {
    db.conn
        .lock()
        .ok()
        .and_then(|c| {
            c.query_row(
                "SELECT valor FROM settings WHERE chave = 'atalho_global'",
                [],
                |r| r.get::<_, String>(0),
            )
            .ok()
        })
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn gravar(db: &Db, a: &Atalho) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
    conn.execute(
        "INSERT INTO settings (chave, valor) VALUES ('atalho_global', ?1)
         ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor",
        rusqlite::params![serde_json::to_string(a).map_err(|e| e.to_string())?],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Liga ou desliga o cronômetro. É a única coisa que o atalho faz: com a
/// janela escondida não há como escolher curso ou descrição, e um atalho que
/// abrisse a janela para perguntar não serviria ao caso que o justifica.
fn alternar(app: &AppHandle) {
    let (Some(t), Some(db)) = (app.try_state::<TimerState>(), app.try_state::<Db>()) else {
        return;
    };
    if timer::status_de(&t).is_some() {
        let _ = timer::parar(&t, &db);
    } else {
        // Sem descrição: quem para no meio do corredor descreve depois, pela
        // janela compacta ou pelo histórico.
        let _ = timer::iniciar(&t, Inicio::livre(String::new(), None, None, None));
    }
    crate::bandeja::atualizar(app);
}

fn registrar(app: &AppHandle, a: &Atalho) -> Result<(), String> {
    let g = app.global_shortcut();
    let _ = g.unregister_all();
    if !a.ativo {
        return Ok(());
    }
    let combo = a.combo.clone().unwrap_or_default();
    if combo.trim().is_empty() {
        return Err("escolha a combinação de teclas".into());
    }
    let app2 = app.clone();
    g.on_shortcut(combo.as_str(), move |_, _, evento| {
        // Só na descida: o plugin avisa nas duas bordas, e sem isto um toque
        // iniciaria e pararia o cronômetro.
        if evento.state() == tauri_plugin_global_shortcut::ShortcutState::Pressed {
            alternar(&app2);
        }
    })
    .map_err(|e| format!("não consegui registrar {combo}: {e}"))
}

/// Registra na abertura o que estiver guardado. Falha aqui não impede o app de
/// abrir: a combinação pode ter sido tomada por outro programa desde ontem, e
/// isso aparece na tela de configuração, não num erro de inicialização.
pub fn aplicar_salvo(app: &AppHandle) {
    let Some(db) = app.try_state::<Db>() else { return };
    let a = atalho_de(&db);
    if let Err(e) = registrar(app, &a) {
        eprintln!("[atalho global] {e}");
    }
}

#[derive(Serialize)]
pub struct EstadoSistema {
    pub inicio_automatico: bool,
    pub atalho: Atalho,
}

#[tauri::command]
pub fn sistema_estado(app: AppHandle, db: tauri::State<Db>) -> EstadoSistema {
    use tauri_plugin_autostart::ManagerExt;
    EstadoSistema {
        inicio_automatico: app.autolaunch().is_enabled().unwrap_or(false),
        atalho: atalho_de(&db),
    }
}

#[tauri::command]
pub fn sistema_inicio_automatico(app: AppHandle, ligado: bool) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    let a = app.autolaunch();
    if ligado {
        a.enable().map_err(|e| e.to_string())
    } else {
        a.disable().map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn sistema_atalho(
    app: AppHandle,
    db: tauri::State<Db>,
    ativo: bool,
    combo: Option<String>,
) -> Result<(), String> {
    let a = Atalho {
        ativo,
        combo: combo.filter(|c| !c.trim().is_empty()),
    };
    // Registra antes de gravar: combinação que o sistema recusa não deve virar
    // configuração salva que falha em silêncio na próxima abertura.
    registrar(&app, &a)?;
    gravar(&db, &a)
}
