//! Janela compacta (§3.5: "timer compacto sempre acessível").
//!
//! Com o estudo acontecendo no Chrome (D-007), a janela principal passa a maior
//! parte do tempo escondida. A compacta é a que faz sentido ficar por cima: só
//! relógio e Pomodoro, sem decoração do sistema, arrastável pela própria barra.
//!
//! Os comandos são `async` pelo mesmo motivo de A-003: Tauri roda comando
//! síncrono na thread principal e `build()` bloqueia esperando essa mesma
//! thread — a janela nasceria em branco e sem responder ao fechamento.

use crate::db::Db;
use tauri::{LogicalPosition, LogicalSize, Manager, WebviewUrl, WebviewWindowBuilder};

pub const ROTULO: &str = "mini";

/// Onde a janela compacta estava da última vez. Sem isto ela reaparece no
/// meio da tela toda vez, e o usuário a arrasta de novo para o mesmo canto —
/// que é o tipo de atrito que faz um acessório deixar de ser usado.
fn posicao_salva(db: &Db) -> Option<(f64, f64)> {
    let conn = db.conn.lock().ok()?;
    let v: String = conn
        .query_row(
            "SELECT valor FROM settings WHERE chave = 'mini_posicao'",
            [],
            |r| r.get(0),
        )
        .ok()?;
    let p: Vec<f64> = serde_json::from_str(&v).ok()?;
    (p.len() == 2).then(|| (p[0], p[1]))
}

fn salvar_posicao(db: &Db, x: f64, y: f64) {
    if let Ok(conn) = db.conn.lock() {
        let _ = conn.execute(
            "INSERT INTO settings (chave, valor) VALUES ('mini_posicao', ?1)
             ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor",
            rusqlite::params![format!("[{x},{y}]")],
        );
    }
}

/// Guarda onde a janela está agora. Chamado antes de fechar — com a decoração
/// desligada, os botões da barra própria são o único caminho de saída, então
/// dá para gravar sem depender de evento do sistema.
fn lembrar_posicao(app: &tauri::AppHandle) {
    let (Some(j), Some(db)) = (app.get_webview_window(ROTULO), app.try_state::<Db>()) else {
        return;
    };
    if let Ok(pos) = j.outer_position() {
        let escala = j.scale_factor().unwrap_or(1.0);
        salvar_posicao(&db, pos.x as f64 / escala, pos.y as f64 / escala);
    }
}

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

    let mini = app.get_webview_window(ROTULO).ok_or("janela não criada")?;

    // Onde ela estava, ou o canto inferior direito. Canto, e não centro: uma
    // janela que fica sempre por cima no meio da tela atrapalha o que está
    // atrás dela, que é justamente o navegador onde o estudo acontece.
    match app.try_state::<Db>().and_then(|db| posicao_salva(&db)) {
        Some((x, y)) => {
            let _ = mini.set_position(LogicalPosition::new(x, y));
        }
        None => {
            if let Ok(Some(mon)) = mini.primary_monitor() {
                let escala = mon.scale_factor();
                let t = mon.size().to_logical::<f64>(escala);
                let p = mon.position().to_logical::<f64>(escala);
                let _ = mini.set_position(LogicalPosition::new(
                    p.x + t.width - 390.0 - 24.0,
                    p.y + t.height - 112.0 - 72.0,
                ));
            }
        }
    }

    // Troca de modo, não segunda janela: a principal some enquanto a compacta
    // está aberta. Duas janelas do mesmo app disputando a barra de tarefas é
    // confusão, não recurso.
    if let Some(principal) = app.get_webview_window("main") {
        let _ = principal.hide();
    }

    Ok(())
}

/// Altura da janela compacta. O menu de cursos precisa de espaço e não pode
/// transbordar: janela sem decoração recorta o que passa da borda.
#[tauri::command]
pub async fn mini_altura(app: tauri::AppHandle, altura: f64) -> Result<(), String> {
    if let Some(j) = app.get_webview_window(ROTULO) {
        let largura = j
            .inner_size()
            .ok()
            .map(|s| s.to_logical::<f64>(j.scale_factor().unwrap_or(1.0)).width)
            .unwrap_or(390.0);
        j.set_size(LogicalSize::new(largura, altura.clamp(96.0, 520.0)))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn fechar_mini(app: tauri::AppHandle) -> Result<(), String> {
    lembrar_posicao(&app);
    if let Some(j) = app.get_webview_window(ROTULO) {
        j.close().map_err(|e| e.to_string())?;
    }
    // Fechar a compacta sem trazer a principal de volta deixaria o app sem
    // janela nenhuma e sem ícone na barra de tarefas — some da vista sem ter
    // encerrado.
    if let Some(p) = app.get_webview_window("main") {
        let _ = p.show();
        let _ = p.set_focus();
    }
    Ok(())
}

/// Traz a principal de volta e fecha a compacta — o caminho de volta precisa
/// existir, senão a janela sem decoração vira um beco sem saída.
#[tauri::command]
pub async fn expandir(app: tauri::AppHandle) -> Result<(), String> {
    lembrar_posicao(&app);
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
