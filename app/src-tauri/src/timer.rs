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

/// Tudo que o relógio precisa saber para gravar a linha certa ao parar.
///
/// O `entry_id` nasce no início, não no fim. É o que permite ao Pomodoro usar
/// o id da primeira fase de foco como identificador da sessão — inclusive na
/// própria linha, que aponta para si mesma (ver `docs/03-modelo-de-tempo.md`).
#[derive(Clone)]
pub struct Inicio {
    pub entry_id: String,
    pub description: String,
    pub curso_id: Option<String>,
    pub tarefa_id: Option<String>,
    /// Matéria e aula: §3.4 pede os quatro vínculos, não só curso e tarefa.
    pub materia_id: Option<String>,
    pub aula: Option<String>,
    pub activity_type_id: String,
    pub context: Option<String>,
    pub parent_id: Option<String>,
    pub planejado_ms: Option<i64>,
}

impl Inicio {
    /// Cronômetro livre: sem estrutura em volta, e estudo só por padrão.
    ///
    /// A categoria é parâmetro porque §3.5 põe caminhada e academia no mesmo
    /// cronômetro do estudo — se ela fosse fixa aqui, começar uma atividade
    /// pessoal exigiria corrigir o lançamento depois, toda vez.
    pub fn livre(
        description: String,
        curso_id: Option<String>,
        tarefa_id: Option<String>,
        activity_type_id: Option<String>,
    ) -> Self {
        Self {
            entry_id: uuid::Uuid::new_v4().to_string(),
            description,
            curso_id,
            tarefa_id,
            materia_id: None,
            aula: None,
            activity_type_id: activity_type_id
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| "at-estudo".into()),
            context: None,
            parent_id: None,
            planejado_ms: None,
        }
    }
}

pub struct Running {
    pub session: String,
    pub started_wall: i64,
    pub started_mono: Instant,
    pub inicio: Inicio,
    /// Segmentos anteriores desta mesma sessão, quando ela já foi pausada.
    pub acumulado_ms: i64,
}

/// Sessão pausada: o segmento anterior já virou linha no banco, e o que sobra
/// é o suficiente para abrir o próximo com a mesma identidade.
///
/// A pausa fecha o segmento em vez de deixar a linha aberta atravessando o
/// intervalo parado. `activity_type` é a verdade cronológica do dia
/// (`docs/03-modelo-de-tempo.md`) — uma linha que engolisse o almoço faria o
/// total do dia mentir. E segmento fechado é segmento que sobrevive a uma queda
/// de energia, que é a razão de este módulo existir.
pub struct Pausado {
    pub inicio: Inicio,
    /// Soma dos segmentos já gravados nesta sessão.
    pub acumulado_ms: i64,
}

pub struct TimerState {
    pub running: Mutex<Option<Running>>,
    pub pausado: Mutex<Option<Pausado>>,
    pub log_path: Mutex<PathBuf>,
}

impl TimerState {
    pub fn new(log_path: PathBuf) -> Self {
        Self {
            running: Mutex::new(None),
            pausado: Mutex::new(None),
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
    /// Entrada que está sendo gravada agora. É o que permite à nota rápida
    /// amarrar no instante da sessão (§3.10).
    pub entry_id: String,
    pub description: String,
    /// Tempo pelo relógio de parede — pode ter sido inflado por suspensão.
    pub wall_ms: i64,
    /// Tempo pelo relógio monotônico — não conta suspensão.
    pub mono_ms: i64,
    /// wall - mono. Acima da tolerância = máquina dormiu ou o relógio do
    /// sistema foi alterado. O app não decide qual: pergunta.
    pub drift_ms: i64,
    /// Segmentos anteriores da mesma sessão, já gravados. O total que o usuário
    /// espera ver é `acumulado_ms + wall_ms`.
    pub acumulado_ms: i64,
    pub pausado: bool,
    pub curso_id: Option<String>,
    pub tarefa_id: Option<String>,
    pub materia_id: Option<String>,
    pub aula: Option<String>,
    pub activity_type_id: String,
    pub inicio_wall: i64,
}

#[derive(Serialize)]
pub struct StopResult {
    pub session: String,
    pub entry_id: String,
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
pub fn iniciar(state: &TimerState, inicio: Inicio) -> Result<Status, String> {
    iniciar_com(state, inicio, 0)
}

fn iniciar_com(state: &TimerState, inicio: Inicio, acumulado: i64) -> Result<Status, String> {
    let mut running = state.running.lock().unwrap();
    if running.is_some() {
        // §3.5 do plano: impedir dois cronômetros ativos no mesmo dispositivo.
        // Vale entre Pomodoro e cronômetro livre também — são o mesmo relógio.
        return Err("já existe um cronômetro ativo neste dispositivo".into());
    }
    if state.pausado.lock().unwrap().is_some() {
        // Sem isto a sessão pausada ficaria órfã: ninguém a retomaria e ninguém
        // a encerraria, e o usuário só descobriria pelo total do dia.
        return Err("há uma sessão pausada. Retome ou encerre antes de começar outra".into());
    }

    let session = format!("s{}", now_ms());
    let wall = now_ms();
    let description = inicio.description.clone();
    let entry_id = inicio.entry_id.clone();
    let curso_id = inicio.curso_id.clone();
    let tarefa_id = inicio.tarefa_id.clone();
    let materia_id = inicio.materia_id.clone();
    let aula = inicio.aula.clone();
    let tipo = inicio.activity_type_id.clone();
    let acumulado_ms = acumulado;
    state.append(&Event::Start {
        session: session.clone(),
        wall,
        description: description.clone(),
    });

    *running = Some(Running {
        session: session.clone(),
        started_wall: wall,
        started_mono: Instant::now(),
        inicio,
        acumulado_ms: acumulado,
    });

    Ok(Status {
        session,
        entry_id,
        description,
        wall_ms: 0,
        mono_ms: 0,
        drift_ms: 0,
        acumulado_ms,
        pausado: false,
        curso_id,
        tarefa_id,
        materia_id,
        aula,
        activity_type_id: tipo,
        inicio_wall: wall,
    })
}

#[tauri::command]
pub fn timer_start(
    state: tauri::State<TimerState>,
    description: String,
    curso_id: Option<String>,
    tarefa_id: Option<String>,
    activity_type_id: Option<String>,
) -> Result<Status, String> {
    iniciar(
        &state,
        Inicio::livre(description, curso_id, tarefa_id, activity_type_id),
    )
}

#[tauri::command]
pub fn timer_status(state: tauri::State<TimerState>) -> Option<Status> {
    status_de(&state)
}

pub fn status_de(state: &TimerState) -> Option<Status> {
    let running = state.running.lock().unwrap();
    let Some(r) = running.as_ref() else {
        // Pausado é um estado do cronômetro, não a ausência dele: a interface
        // precisa continuar mostrando a sessão e o total já acumulado.
        let p = state.pausado.lock().unwrap();
        let p = p.as_ref()?;
        return Some(Status {
            session: String::new(),
            entry_id: p.inicio.entry_id.clone(),
            description: p.inicio.description.clone(),
            wall_ms: 0,
            mono_ms: 0,
            drift_ms: 0,
            acumulado_ms: p.acumulado_ms,
            pausado: true,
            curso_id: p.inicio.curso_id.clone(),
            tarefa_id: p.inicio.tarefa_id.clone(),
            materia_id: p.inicio.materia_id.clone(),
            aula: p.inicio.aula.clone(),
            activity_type_id: p.inicio.activity_type_id.clone(),
            inicio_wall: 0,
        });
    };
    let wall_ms = now_ms() - r.started_wall;
    let mono_ms = r.started_mono.elapsed().as_millis() as i64;
    Some(Status {
        session: r.session.clone(),
        entry_id: r.inicio.entry_id.clone(),
        description: r.inicio.description.clone(),
        wall_ms,
        mono_ms,
        drift_ms: wall_ms - mono_ms,
        acumulado_ms: r.acumulado_ms,
        pausado: false,
        curso_id: r.inicio.curso_id.clone(),
        tarefa_id: r.inicio.tarefa_id.clone(),
        materia_id: r.inicio.materia_id.clone(),
        aula: r.inicio.aula.clone(),
        activity_type_id: r.inicio.activity_type_id.clone(),
        inicio_wall: r.started_wall,
    })
}

/// Parada do cronômetro. Grava nos dois lugares, e cada um tem um papel:
/// o log append-only é o que sobrevive a queda de energia; a linha em
/// `time_entries` é o que os relatórios conseguem consultar.
pub fn parar(state: &TimerState, db: &crate::db::Db) -> Result<StopResult, String> {
    let mut running = state.running.lock().unwrap();
    let Some(r) = running.take() else {
        // Encerrar de dentro da pausa: o último segmento já virou linha, então
        // não há nada a gravar — só a sessão a fechar.
        let p = state
            .pausado
            .lock()
            .unwrap()
            .take()
            .ok_or("nenhum cronômetro ativo")?;
        return Ok(StopResult {
            session: String::new(),
            entry_id: p.inicio.entry_id,
            wall_ms: p.acumulado_ms,
            mono_ms: p.acumulado_ms,
            drift_ms: 0,
        });
    };
    let fim = now_ms();
    let wall_ms = fim - r.started_wall;
    let mono_ms = r.started_mono.elapsed().as_millis() as i64;

    // A linha é gravada antes de o log receber o `stop`. Se a gravação falha,
    // o relógio volta a correr e o erro chega a quem pediu: tempo estudado que
    // sumisse em silêncio seria o pior defeito deste módulo.
    let gravacao = {
        let i = &r.inicio;
        db.conn
            .lock()
            .map_err(|_| "banco ocupado".to_string())
            .and_then(|conn| {
                conn.execute(
                    "INSERT INTO time_entries
                       (id, started_at, ended_at, activity_type_id, description, course_id,
                        task_id, subject_id, aula, context, parent_id, planejado_ms, source,
                        device_id, version, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, 'timer', ?13, 1, ?3, ?3)",
                    rusqlite::params![
                        i.entry_id,
                        r.started_wall,
                        fim,
                        i.activity_type_id,
                        if i.description.is_empty() { None } else { Some(&i.description) },
                        i.curso_id,
                        i.tarefa_id,
                        i.materia_id,
                        i.aula,
                        i.context,
                        i.parent_id,
                        i.planejado_ms,
                        db.device_id,
                    ],
                )
                .map(|_| ())
                .map_err(|e| format!("não consegui gravar o lançamento: {e}"))
            })
    };
    if let Err(e) = gravacao {
        *running = Some(r);
        return Err(e);
    }

    state.append(&Event::Stop {
        session: r.session.clone(),
        wall: fim,
        mono_ms,
    });

    Ok(StopResult {
        session: r.session.clone(),
        entry_id: r.inicio.entry_id.clone(),
        wall_ms,
        mono_ms,
        drift_ms: wall_ms - mono_ms,
    })
}

/// Pausa: fecha o segmento corrente e guarda a identidade da sessão.
///
/// Retomar abre um segmento novo com o mesmo `parent_id`, então a sessão
/// inteira continua consultável como uma coisa só — a mesma convenção que o
/// Pomodoro usa para amarrar foco e pausa.
pub fn pausar(state: &TimerState, db: &crate::db::Db) -> Result<i64, String> {
    let (inicio, acumulado) = {
        let mut running = state.running.lock().unwrap();
        let r = running.as_mut().ok_or("nenhum cronômetro ativo")?;
        // A âncora é a primeira entrada da sessão, apontando para si mesma.
        if r.inicio.parent_id.is_none() {
            r.inicio.parent_id = Some(r.inicio.entry_id.clone());
        }
        (r.inicio.clone(), r.acumulado_ms)
    };

    let parada = parar(state, db)?;
    let total = acumulado + parada.wall_ms;

    *state.pausado.lock().unwrap() = Some(Pausado {
        inicio,
        acumulado_ms: total,
    });

    Ok(total)
}

#[tauri::command]
pub fn timer_pausar(
    state: tauri::State<TimerState>,
    db: tauri::State<crate::db::Db>,
) -> Result<Status, String> {
    pausar(&state, &db)?;
    status_de(&state).ok_or_else(|| "estado inconsistente após pausar".into())
}

#[tauri::command]
pub fn timer_retomar(state: tauri::State<TimerState>) -> Result<Status, String> {
    let p = state
        .pausado
        .lock()
        .unwrap()
        .take()
        .ok_or("nenhuma sessão pausada")?;
    let acumulado = p.acumulado_ms;
    // Entrada nova, identidade igual: o `parent_id` já aponta para a âncora.
    let inicio = Inicio {
        entry_id: uuid::Uuid::new_v4().to_string(),
        ..p.inicio
    };
    iniciar_com(&state, inicio, acumulado)
}

/// Troca descrição, curso e tarefa sem parar o relógio.
///
/// A linha só é gravada no fim do segmento, então isto não é uma edição de
/// histórico — é corrigir o rótulo antes de ele existir. Vale também com a
/// sessão pausada.
#[tauri::command]
pub fn timer_editar(
    state: tauri::State<TimerState>,
    descricao: String,
    curso_id: Option<String>,
    tarefa_id: Option<String>,
    materia_id: Option<String>,
    aula: Option<String>,
    activity_type_id: Option<String>,
) -> Result<Status, String> {
    let aplicar = |i: &mut Inicio| {
        i.description = descricao.trim().to_string();
        i.curso_id = curso_id.clone();
        i.tarefa_id = tarefa_id.clone();
        i.materia_id = materia_id.clone().filter(|s| !s.is_empty());
        i.aula = aula.clone().map(|a| a.trim().to_string()).filter(|a| !a.is_empty());
        // A linha ainda não existe no banco: trocar a categoria aqui é
        // reclassificar antes de gravar, e é o que resolve "caminhei durante a
        // pausa" no instante em que acontece, e não depois.
        if let Some(t) = activity_type_id.clone().filter(|s| !s.is_empty()) {
            i.activity_type_id = t;
        }
    };

    let mut running = state.running.lock().unwrap();
    if let Some(r) = running.as_mut() {
        aplicar(&mut r.inicio);
    } else {
        let mut p = state.pausado.lock().unwrap();
        let p = p.as_mut().ok_or("nenhum cronômetro ativo")?;
        aplicar(&mut p.inicio);
    }
    drop(running);
    status_de(&state).ok_or_else(|| "estado inconsistente".into())
}

/// Corrige a hora de início sem parar o relógio.
///
/// Os dois relógios andam juntos: mover só o de parede inventaria uma
/// divergência que a máquina não teve, e é justamente a divergência que este
/// módulo usa para detectar suspensão. O ajuste desloca os dois.
#[tauri::command]
pub fn timer_ajustar_inicio(
    state: tauri::State<TimerState>,
    inicio: i64,
) -> Result<Status, String> {
    let agora = now_ms();
    if inicio > agora {
        return Err("o início não pode estar no futuro".into());
    }
    if agora - inicio > 24 * 3_600_000 {
        return Err("mais de 24 horas atrás. Lance manualmente em vez de ajustar".into());
    }

    {
        let mut running = state.running.lock().unwrap();
        let r = running.as_mut().ok_or("nenhum cronômetro ativo")?;
        let delta = r.started_wall - inicio;
        r.started_wall = inicio;
        r.started_mono = if delta >= 0 {
            r.started_mono
                .checked_sub(Duration::from_millis(delta as u64))
                .ok_or("ajuste grande demais para o relógio monotônico")?
        } else {
            r.started_mono
                .checked_add(Duration::from_millis((-delta) as u64))
                .ok_or("ajuste inválido")?
        };
    }
    status_de(&state).ok_or_else(|| "estado inconsistente".into())
}

/// Recomeça um lançamento anterior: mesma descrição, curso, tarefa e categoria.
#[tauri::command]
pub fn timer_continuar(
    state: tauri::State<TimerState>,
    db: tauri::State<crate::db::Db>,
    entry_id: String,
) -> Result<Status, String> {
    type Anterior = (
        Option<String>,
        Option<String>,
        Option<String>,
        String,
        Option<String>,
        Option<String>,
    );
    let (descricao, curso, tarefa, tipo, materia, aula): Anterior = {
        let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
        conn.query_row(
            "SELECT description, course_id, task_id, activity_type_id, subject_id, aula
               FROM time_entries WHERE id = ?1 AND deleted_at IS NULL",
            rusqlite::params![entry_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?, r.get(5)?)),
        )
        .map_err(|_| "lançamento não encontrado".to_string())?
    };

    iniciar(
        &state,
        Inicio {
            entry_id: uuid::Uuid::new_v4().to_string(),
            description: descricao.unwrap_or_default(),
            curso_id: curso,
            tarefa_id: tarefa,
            materia_id: materia,
            aula,
            activity_type_id: tipo,
            context: None,
            parent_id: None,
            planejado_ms: None,
        },
    )
}

/// Começa a partir de uma combinação favorita.
///
/// O contador de uso sobe aqui e não na interface: é o acionamento que
/// interessa para ordenar a lista, e a interface não é o único caminho — a
/// extensão e o MCP entram pelo mesmo lugar.
#[tauri::command]
pub fn timer_favorito(
    state: tauri::State<TimerState>,
    db: tauri::State<crate::db::Db>,
    id: String,
) -> Result<Status, String> {
    let (descricao, tipo, curso, tarefa): (Option<String>, String, Option<String>, Option<String>) = {
        let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
        conn.query_row(
            "SELECT COALESCE(descricao, rotulo), activity_type_id, course_id, task_id
               FROM time_favorites WHERE id = ?1 AND deleted_at IS NULL",
            rusqlite::params![id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )
        .map_err(|_| "favorito não encontrado".to_string())?
    };

    let st = iniciar(
        &state,
        Inicio {
            entry_id: uuid::Uuid::new_v4().to_string(),
            description: descricao.unwrap_or_default(),
            curso_id: curso,
            tarefa_id: tarefa,
            materia_id: None,
            aula: None,
            activity_type_id: tipo,
            context: None,
            parent_id: None,
            planejado_ms: None,
        },
    )?;
    crate::entries::contar_uso(&db, &id);
    Ok(st)
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
