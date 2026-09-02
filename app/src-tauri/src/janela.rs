//! Janela compacta (§3.5: "timer compacto sempre acessível").
//!
//! Com o estudo acontecendo no Chrome (D-007), a janela principal passa a maior
//! parte do tempo escondida. A compacta é a que faz sentido ficar por cima: só
//! relógio e Pomodoro, sem decoração do sistema, arrastável pela própria barra.
//!
//! Os comandos são `async` pelo mesmo motivo de A-003: Tauri roda comando
//! síncrono na thread principal e `build()` bloqueia esperando essa mesma
//! thread — a janela nasceria em branco e sem responder ao fechamento.

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

pub const ROTULO: &str = "mini";

#[tauri::command]
pub async fn abrir_mini(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(j) = app.get_webview_window(ROTULO) {
        let _ = j.unminimize();
        let _ = j.set_focus();
        return Ok(());
    }

    WebviewWindowBuilder::new(&app, ROTULO, WebviewUrl::App("index.html".into()))
        .title("Estudos")
        .inner_size(390.0, 112.0)
        .min_inner_size(330.0, 96.0)
        .resizable(true)
        // Sem decoração do sistema: a barra de título própria cabe melhor numa
        // janela desta altura, e é ela que serve de área de arrasto.
        .decorations(false)
        .transparent(false)
        .always_on_top(true)
        // Fora da barra de tarefas: é um acessório da janela principal, não uma
        // segunda instância do aplicativo.
        .skip_taskbar(true)
        .build()
        .map_err(|e| format!("falha ao abrir a janela compacta: {e}"))?;

    Ok(())
}

#[tauri::command]
pub async fn fechar_mini(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(j) = app.get_webview_window(ROTULO) {
        j.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Traz a principal de volta e fecha a compacta — o caminho de volta precisa
/// existir, senão a janela sem decoração vira um beco sem saída.
#[tauri::command]
pub async fn expandir(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(p) = app.get_webview_window("main") {
        let _ = p.unminimize();
        let _ = p.show();
        let _ = p.set_focus();
    }
    if let Some(j) = app.get_webview_window(ROTULO) {
        let _ = j.close();
    }
    Ok(())
}

#[tauri::command]
pub fn mini_no_topo(app: tauri::AppHandle, fixar: bool) -> Result<(), String> {
    if let Some(j) = app.get_webview_window(ROTULO) {
        j.set_always_on_top(fixar).map_err(|e| e.to_string())?;
    }
    Ok(())
}
