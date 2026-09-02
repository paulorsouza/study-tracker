//! Cronômetro do spike (P4).
//!
//! Nem o relógio de parede nem o monotônico resolvem sozinhos: o de parede pode
//! ser alterado pelo usuário, e o monotônico não avança durante suspensão. O
//! desenho aqui grava os dois num log append-only e usa a divergência entre eles
//! para detectar tempo não observado — que vira pergunta, nunca total silencioso.

use serde::{Deserialize, Serialize};
use std::fs::OpenOptions;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

/// Intervalo entre heartbeats. Quanto menor, menor a lacuna herdada de um
/// encerramento forçado — e maior a escrita em disco.
pub const BEAT_INTERVAL: Duration = Duration::from_secs(5);

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(tag = "t")]
pub enum Event {
    #[serde(rename = "start")]
    Start {
        session: String,
        wall: i64,
        description: String,
    },
    #[serde(rename = "beat")]
    Beat {
        session: String,
        wall: i64,
        mono_ms: i64,
    },
    #[serde(rename = "stop")]
    Stop {
        session: String,
        wall: i64,
        mono_ms: i64,
    },
}

pub struct Running {
    pub session: String,
    pub started_wall: i64,
    pub started_mono: Instant,
    pub description: String,
    pub curso_id: Option<String>,
    pub tarefa_id: Option<String>,
}

pub struct TimerState {
    pub running: Mutex<Option<Running>>,
    pub log_path: Mutex<PathBuf>,
}

impl TimerState {
    pub fn new(log_path: PathBuf) -> Self {
        Self {
            running: Mutex::new(None),
            log_path: Mutex::new(log_path),
        }
    }

    /// Grava e força flush no disco. Um evento que só existe no buffer não
    /// sobrevive a queda de energia, que é justamente o caso que P4 testa.
    pub fn append(&self, ev: &Event) {
        let path = self.log_path.lock().unwrap().clone();
        if let Some(dir) = path.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(&path) {
            if let Ok(line) = serde_json::to_string(ev) {
                let _ = writeln!(f, "{}", line);
                let _ = f.flush();
                let _ = f.sync_data();
            }
        }
    }

    pub fn read_events(&self) -> Vec<Event> {
        let path = self.log_path.lock().unwrap().clone();
        let Ok(f) = std::fs::File::open(&path) else {
            return Vec::new();
        };
        BufReader::new(f)
            .lines()
            .map_while(Result::ok)
            .filter_map(|l| serde_json::from_str::<Event>(&l).ok())
            .collect()
    }
}

#[derive(Serialize)]
pub struct Status {
    pub session: String,
    pub description: String,
    /// Tempo pelo relógio de parede — pode ter sido inflado por suspensão.
    pub wall_ms: i64,
    /// Tempo pelo relógio monotônico — não conta suspensão.
    pub mono_ms: i64,
    /// wall - mono. Acima da tolerância = máquina dormiu ou o relógio do
    /// sistema foi alterado. O app não decide qual: pergunta.
    pub drift_ms: i64,
}

#[derive(Serialize)]
pub struct StopResult {
    pub session: String,
    pub wall_ms: i64,
    pub mono_ms: i64,
    pub drift_ms: i64,
}

/// Sessão encontrada aberta no log ao subir o app: o processo morreu antes do
/// stop. O tempo até o último heartbeat é observado; o resto é lacuna.
#[derive(Serialize)]
pub struct Recovery {
    pub session: String,
    pub description: String,
    pub started_wall: i64,
    pub last_beat_wall: i64,
    /// Tempo que o app efetivamente observou.
    pub observed_ms: i64,
    /// Do último heartbeat até agora. Ninguém sabe o que aconteceu aqui.
    pub gap_ms: i64,
}

/// Início do cronômetro, independente de quem pediu. A interface e a extensão
/// do Chrome chamam daqui — se cada uma tivesse a própria lógica, elas
/// divergiriam na primeira correção.
pub fn iniciar(
    state: &TimerState,
    description: String,
    curso_id: Option<String>,
    tarefa_id: Option<String>,
) -> Result<Status, String> {
    let mut running = state.running.lock().unwrap();
    if running.is_some() {
        // §3.5 do plano: impedir dois cronômetros ativos no mesmo dispositivo.
        return Err("já existe um cronômetro ativo neste dispositivo".into());
    }

    let session = format!("s{}", now_ms());
    let wall = now_ms();
    state.append(&Event::Start {
        session: session.clone(),
        wall,
        description: description.clone(),
    });

    *running = Some(Running {
        session: session.clone(),
        started_wall: wall,
        started_mono: Instant::now(),
        description: description.clone(),
        curso_id,
        tarefa_id,
    });

    Ok(Status {
        session,
        description,
        wall_ms: 0,
        mono_ms: 0,
        drift_ms: 0,
    })
}

#[tauri::command]
pub fn timer_start(
    state: tauri::State<TimerState>,
    description: String,
    curso_id: Option<String>,
    tarefa_id: Option<String>,
) -> Result<Status, String> {
    iniciar(&state, description, curso_id, tarefa_id)
}

#[tauri::command]
pub fn timer_status(state: tauri::State<TimerState>) -> Option<Status> {
    status_de(&state)
}

pub fn status_de(state: &TimerState) -> Option<Status> {
    let running = state.running.lock().unwrap();
    let r = running.as_ref()?;
    let wall_ms = now_ms() - r.started_wall;
    let mono_ms = r.started_mono.elapsed().as_millis() as i64;
    Some(Status {
        session: r.session.clone(),
        description: r.description.clone(),
        wall_ms,
        mono_ms,
        drift_ms: wall_ms - mono_ms,
    })
}

/// Parada do cronômetro. Grava nos dois lugares, e cada um tem um papel:
/// o log append-only é o que sobrevive a queda de energia; a linha em
/// `time_entries` é o que os relatórios conseguem consultar.
pub fn parar(state: &TimerState, db: &crate::db::Db) -> Result<StopResult, String> {
    let mut running = state.running.lock().unwrap();
    let r = running.take().ok_or("nenhum cronômetro ativo")?;
    let fim = now_ms();
    let wall_ms = fim - r.started_wall;
    let mono_ms = r.started_mono.elapsed().as_millis() as i64;

    state.append(&Event::Stop {
        session: r.session.clone(),
        wall: fim,
        mono_ms,
    });

    if let Ok(conn) = db.conn.lock() {
        let _ = conn.execute(
            "INSERT INTO time_entries
               (id, started_at, ended_at, activity_type_id, description, course_id,
                task_id, source, device_id, version, created_at, updated_at)
             VALUES (?1, ?2, ?3, 'at-estudo', ?4, ?5, ?6, 'timer', ?7, 1, ?3, ?3)",
            rusqlite::params![
                uuid::Uuid::new_v4().to_string(),
                r.started_wall,
                fim,
                if r.description.is_empty() { None } else { Some(&r.description) },
                r.curso_id,
                r.tarefa_id,
                db.device_id,
            ],
        );
    }

    Ok(StopResult {
        session: r.session,
        wall_ms,
        mono_ms,
        drift_ms: wall_ms - mono_ms,
    })
}

#[tauri::command]
pub fn timer_stop(
    state: tauri::State<TimerState>,
    db: tauri::State<crate::db::Db>,
) -> Result<StopResult, String> {
    parar(&state, &db)
}

/// Varre o log procurando uma sessão que começou e nunca parou.
#[tauri::command]
pub fn timer_recover(state: tauri::State<TimerState>) -> Option<Recovery> {
    let events = state.read_events();

    let mut open: Option<(String, i64, String)> = None; // session, wall, desc
    let mut last_beat: i64 = 0;

    for ev in &events {
        match ev {
            Event::Start {
                session,
                wall,
                description,
            } => {
                open = Some((session.clone(), *wall, description.clone()));
                last_beat = *wall;
            }
            Event::Beat { session, wall, .. } => {
                if open.as_ref().is_some_and(|(s, _, _)| s == session) {
                    last_beat = *wall;
                }
            }
            Event::Stop { session, .. } => {
                if open.as_ref().is_some_and(|(s, _, _)| s == session) {
                    open = None;
                }
            }
        }
    }

    let (session, started_wall, description) = open?;
    let now = now_ms();
    Some(Recovery {
        session,
        description,
        started_wall,
        last_beat_wall: last_beat,
        observed_ms: (last_beat - started_wall).max(0),
        gap_ms: (now - last_beat).max(0),
    })
}

/// Fecha no log uma sessão recuperada sem inventar tempo: só o que foi
/// observado até o último heartbeat entra.
#[tauri::command]
pub fn timer_discard_recovery(state: tauri::State<TimerState>, session: String) {
    let events = state.read_events();
    let mono = events
        .iter()
        .filter_map(|e| match e {
            Event::Beat {
                session: s, mono_ms, ..
            } if *s == session => Some(*mono_ms),
            _ => None,
        })
        .last()
        .unwrap_or(0);
    state.append(&Event::Stop {
        session,
        wall: now_ms(),
        mono_ms: mono,
    });
}

/// Thread de heartbeat. Roda enquanto o app viver.
pub fn spawn_heartbeat(app: tauri::AppHandle) {
    use tauri::Manager;
    std::thread::spawn(move || loop {
        std::thread::sleep(BEAT_INTERVAL);
        let state = app.state::<TimerState>();
        // O lock é solto antes de escrever em disco: I/O segurando o mutex
        // travaria start/stop pelo tempo do flush.
        let ev = {
            let guard = state.running.lock().unwrap();
            guard.as_ref().map(|r| Event::Beat {
                session: r.session.clone(),
                wall: now_ms(),
                mono_ms: r.started_mono.elapsed().as_millis() as i64,
            })
        };
        if let Some(ev) = ev {
            state.append(&ev);
        }
    });
}
