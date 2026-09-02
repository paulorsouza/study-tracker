//! Bandeja do sistema (§3.5).
//!
//! "Atividades recentes e favoritas disponíveis no dashboard e na bandeja do
//! sistema." A bandeja existe porque o caso real é o app minimizado atrás do
//! Chrome: sair para caminhar com os dogs não deveria exigir achar a janela,
//! trazê-la para a frente e só então clicar em começar.
//!
//! O menu é remontado a pedido, não a cada segundo. Um menu que se reconstrói
//! sozinho pisca e fecha na mão do usuário — remontar quando algo mudou é o
//! comportamento que não atrapalha.

use crate::db::Db;
use crate::entries::{self, Recente};
use crate::timer::{self, Inicio, TimerState};
use std::sync::Mutex;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{TrayIcon, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager};

/// A bandeja viva e o que cada item dela dispara.
///
/// O mapa é necessário porque o id do item é uma string opaca: sem ele, o
/// tratador teria de reencontrar a atividade a partir do rótulo — e rótulo é
/// texto do usuário, que pode repetir.
#[derive(Default)]
pub struct Bandeja {
    pub icone: Mutex<Option<TrayIcon>>,
    pub acoes: Mutex<Vec<(String, Recente)>>,
}

const ABRIR: &str = "bandeja-abrir";
const PARAR: &str = "bandeja-parar";
const SAIR: &str = "bandeja-sair";

pub fn montar(app: &AppHandle) -> tauri::Result<()> {
    app.manage(Bandeja::default());

    let icone = TrayIconBuilder::with_id("principal")
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("Estudos")
        .menu(&menu_de(app)?)
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, evento| {
            // Clique com o botão esquerdo traz a janela. O menu fica no botão
            // direito, que é onde o Windows ensina a procurá-lo.
            if let TrayIconEvent::Click { button, .. } = evento {
                if button == tauri::tray::MouseButton::Left {
                    mostrar_janela(tray.app_handle());
                }
            }
        })
        .on_menu_event(|app, evento| {
            let id = evento.id().as_ref().to_string();
            match id.as_str() {
                ABRIR => mostrar_janela(app),
                PARAR => {
                    if let (Some(t), Some(db)) =
                        (app.try_state::<TimerState>(), app.try_state::<Db>())
                    {
                        let _ = timer::parar(&t, &db);
                    }
                    atualizar(app);
                }
                SAIR => app.exit(0),
                _ => {
                    iniciar_de(app, &id);
                    atualizar(app);
                }
            }
        })
        .build(app)?;

    if let Some(b) = app.try_state::<Bandeja>() {
        *b.icone.lock().unwrap() = Some(icone);
    }
    Ok(())
}

fn mostrar_janela(app: &AppHandle) {
    if let Some(j) = app.get_webview_window("main") {
        let _ = j.unminimize();
        let _ = j.show();
        let _ = j.set_focus();
    }
}

/// Começa a contar a atividade escolhida no menu.
fn iniciar_de(app: &AppHandle, id: &str) {
    let (Some(b), Some(t)) = (app.try_state::<Bandeja>(), app.try_state::<TimerState>()) else {
        return;
    };
    let alvo = {
        let acoes = b.acoes.lock().unwrap();
        acoes.iter().find(|(k, _)| k == id).map(|(_, r)| r.clone())
    };
    let Some(r) = alvo else { return };

    let _ = timer::iniciar(
        &t,
        Inicio {
            entry_id: uuid::Uuid::new_v4().to_string(),
            description: r.descricao.unwrap_or_default(),
            curso_id: r.course_id,
            tarefa_id: None,
            activity_type_id: r.activity_type_id,
            context: None,
            parent_id: None,
            planejado_ms: None,
        },
    );
}

/// Corta o rótulo para caber no menu. Descrição longa vira menu largo demais,
/// e um menu de bandeja largo cobre a tela inteira ao abrir.
fn curto(s: &str) -> String {
    let s = s.trim();
    if s.is_empty() {
        return "sem descrição".into();
    }
    if s.chars().count() <= 34 {
        return s.to_string();
    }
    format!("{}…", s.chars().take(33).collect::<String>().trim_end())
}

fn menu_de(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let menu = Menu::new(app)?;

    let rodando = app
        .try_state::<TimerState>()
        .and_then(|t| timer::status_de(&t));

    if let Some(st) = rodando {
        let rotulo = if st.pausado {
            format!("Pausado — {}", curto(&st.description))
        } else {
            format!("Parar — {}", curto(&st.description))
        };
        menu.append(&MenuItem::with_id(app, PARAR, rotulo, true, None::<&str>)?)?;
        menu.append(&PredefinedMenuItem::separator(app)?)?;
    } else if let Some(db) = app.try_state::<Db>() {
        let recentes = entries::recentes_de(&db, 6);
        if !recentes.is_empty() {
            let mut acoes = Vec::new();
            for (i, r) in recentes.iter().enumerate() {
                let id = format!("bandeja-rec-{i}");
                let rotulo = match r.descricao.as_deref().filter(|d| !d.is_empty()) {
                    Some(d) => format!("{} · {}", r.atividade, curto(d)),
                    None => r.atividade.clone(),
                };
                menu.append(&MenuItem::with_id(app, &id, rotulo, true, None::<&str>)?)?;
                acoes.push((id, r.clone()));
            }
            if let Some(b) = app.try_state::<Bandeja>() {
                *b.acoes.lock().unwrap() = acoes;
            }
            menu.append(&PredefinedMenuItem::separator(app)?)?;
        }
    }

    menu.append(&MenuItem::with_id(app, ABRIR, "Abrir Estudos", true, None::<&str>)?)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&MenuItem::with_id(app, SAIR, "Sair", true, None::<&str>)?)?;
    Ok(menu)
}

/// Remonta o menu. Chamado quando o cronômetro muda de estado ou a interface
/// avisa que algo mexeu no histórico.
pub fn atualizar(app: &AppHandle) {
    let Ok(m) = menu_de(app) else { return };
    if let Some(b) = app.try_state::<Bandeja>() {
        if let Some(icone) = b.icone.lock().unwrap().as_ref() {
            let _ = icone.set_menu(Some(m));
        }
    }
}

#[tauri::command]
pub fn atualizar_bandeja(app: AppHandle) {
    atualizar(&app);
}
