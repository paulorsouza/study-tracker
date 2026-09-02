//! Pomodoro (§3.4).
//!
//! O ciclo é conduzido **no Rust**, não na interface. A razão é o cenário real
//! deste app: o usuário estuda no Chrome, com a janela do Estudos minimizada ou
//! atrás de tudo. Um temporizador em `setInterval` no frontend é estrangulado
//! pelo navegador quando a janela perde o foco, e o ciclo atrasaria justamente
//! nas horas em que ele precisa funcionar.
//!
//! Cada fase é uma linha de `time_entries` — foco e pausa, ambas. Nenhuma
//! tabela nova; ver `docs/03-modelo-de-tempo.md`.

use crate::db::{agora_ms, Db};
use crate::timer::{self, Inicio, TimerState};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{Emitter, Manager};

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Debug)]
#[serde(rename_all = "snake_case")]
pub enum Fase {
    Foco,
    PausaCurta,
    PausaLonga,
}

impl Fase {
    fn contexto(self) -> &'static str {
        match self {
            Fase::Foco => "pomodoro_focus",
            _ => "pomodoro_break",
        }
    }
    fn rotulo(self) -> &'static str {
        match self {
            Fase::Foco => "Foco",
            Fase::PausaCurta => "Pausa curta",
            Fase::PausaLonga => "Pausa longa",
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Config {
    pub foco_min: i64,
    pub curta_min: i64,
    pub longa_min: i64,
    pub ciclos_ate_longa: i64,
    /// §3.4: "nunca ativada por padrão". Encadear pausa sozinho tira do usuário
    /// a decisão de parar, que é o oposto do que a pausa serve.
    pub auto_pausa: bool,
    pub auto_foco: bool,
    pub som: bool,
    /// Categoria usada nas pausas. Trocar aqui não desfaz o vínculo com o
    /// ciclo — `context` e `parent_id` continuam.
    pub tipo_pausa: String,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            foco_min: 25,
            curta_min: 5,
            longa_min: 15,
            ciclos_ate_longa: 4,
            auto_pausa: false,
            auto_foco: false,
            som: true,
            tipo_pausa: "at-pausa".into(),
        }
    }
}

impl Config {
    fn minutos(&self, f: Fase) -> i64 {
        match f {
            Fase::Foco => self.foco_min,
            Fase::PausaCurta => self.curta_min,
            Fase::PausaLonga => self.longa_min,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Default)]
pub struct Sessao {
    pub sessao_id: Option<String>,
    pub fase: Option<Fase>,
    /// Focos concluídos nesta sessão — é o que decide quando vem a pausa longa.
    pub focos: i64,
    /// Fase pronta para começar, esperando o usuário. Existe porque a
    /// transição automática é opcional e desligada por padrão.
    pub aguardando: Option<Fase>,
    pub curso_id: Option<String>,
    pub tarefa_id: Option<String>,
    pub descricao: String,
}

pub struct PomodoroState(pub Mutex<Sessao>);

#[derive(Serialize)]
pub struct Estado {
    pub ativo: bool,
    pub fase: Option<Fase>,
    pub rotulo: Option<String>,
    pub aguardando: Option<Fase>,
    pub rotulo_aguardando: Option<String>,
    pub focos: i64,
    pub ciclos_ate_longa: i64,
    pub decorrido_ms: i64,
    pub planejado_ms: i64,
    pub descricao: String,
}

// --- persistência da configuração e da sessão -------------------------------

fn ler_json<T: for<'a> Deserialize<'a>>(conn: &rusqlite::Connection, chave: &str) -> Option<T> {
    conn.query_row(
        "SELECT valor FROM settings WHERE chave = ?1",
        rusqlite::params![chave],
        |r| r.get::<_, String>(0),
    )
    .ok()
    .and_then(|s| serde_json::from_str(&s).ok())
}

fn gravar_json<T: Serialize>(conn: &rusqlite::Connection, chave: &str, v: &T) {
    if let Ok(s) = serde_json::to_string(v) {
        let _ = conn.execute(
            "INSERT INTO settings (chave, valor) VALUES (?1, ?2)
             ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor",
            rusqlite::params![chave, s],
        );
    }
}

pub fn config_de(db: &Db) -> Config {
    db.conn
        .lock()
        .ok()
        .and_then(|c| ler_json::<Config>(&c, "pomodoro_config"))
        .unwrap_or_default()
}

/// A sessão vive no banco além da memória: sem isso, fechar o app no meio de um
/// ciclo faria a contagem de focos recomeçar do zero e a pausa longa nunca
/// chegaria no momento certo.
fn salvar_sessao(db: &Db, s: &Sessao) {
    if let Ok(c) = db.conn.lock() {
        gravar_json(&c, "pomodoro_sessao", s);
    }
}

pub fn restaurar(db: &Db) -> Sessao {
    db.conn
        .lock()
        .ok()
        .and_then(|c| ler_json::<Sessao>(&c, "pomodoro_sessao"))
        .unwrap_or_default()
}

// --- comandos ---------------------------------------------------------------

#[tauri::command]
pub fn pomodoro_config(db: tauri::State<Db>) -> Config {
    config_de(&db)
}

#[tauri::command]
pub fn pomodoro_salvar_config(db: tauri::State<Db>, config: Config) -> Result<(), String> {
    if config.foco_min < 1 || config.curta_min < 1 || config.longa_min < 1 {
        return Err("as durações precisam ser de pelo menos 1 minuto".into());
    }
    if config.ciclos_ate_longa < 1 {
        return Err("é preciso ao menos 1 ciclo até a pausa longa".into());
    }
    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
    gravar_json(&conn, "pomodoro_config", &config);
    Ok(())
}

/// Começa uma fase e devolve o id da entrada criada.
fn abrir_fase(
    timer: &TimerState,
    cfg: &Config,
    sess: &mut Sessao,
    fase: Fase,
) -> Result<String, String> {
    let entry_id = uuid::Uuid::new_v4().to_string();
    // A primeira fase de foco é a âncora: ela aponta para si mesma, e todas as
    // outras da sessão apontam para ela.
    let sessao_id = sess.sessao_id.clone().unwrap_or_else(|| entry_id.clone());

    let planejado = cfg.minutos(fase) * 60_000;
    timer::iniciar(
        timer,
        Inicio {
            entry_id: entry_id.clone(),
            description: if fase == Fase::Foco {
                sess.descricao.clone()
            } else {
                fase.rotulo().to_string()
            },
            curso_id: if fase == Fase::Foco { sess.curso_id.clone() } else { None },
            tarefa_id: if fase == Fase::Foco { sess.tarefa_id.clone() } else { None },
            activity_type_id: if fase == Fase::Foco {
                "at-estudo".into()
            } else {
                cfg.tipo_pausa.clone()
            },
            context: Some(fase.contexto().to_string()),
            parent_id: Some(sessao_id.clone()),
            planejado_ms: Some(planejado),
        },
    )?;

    sess.sessao_id = Some(sessao_id);
    sess.fase = Some(fase);
    sess.aguardando = None;
    Ok(entry_id)
}

#[tauri::command]
pub fn pomodoro_iniciar(
    db: tauri::State<Db>,
    timer: tauri::State<TimerState>,
    pomo: tauri::State<PomodoroState>,
    descricao: String,
    curso_id: Option<String>,
    tarefa_id: Option<String>,
) -> Result<(), String> {
    let cfg = config_de(&db);
    let mut sess = pomo.0.lock().map_err(|_| "estado ocupado")?;
    if sess.fase.is_some() {
        return Err("já existe um Pomodoro em andamento".into());
    }
    *sess = Sessao {
        descricao,
        curso_id,
        tarefa_id,
        ..Default::default()
    };
    abrir_fase(&timer, &cfg, &mut sess, Fase::Foco)?;
    salvar_sessao(&db, &sess);
    Ok(())
}

/// Qual fase vem depois da que acabou.
fn proxima(cfg: &Config, sess: &Sessao) -> Fase {
    match sess.fase {
        Some(Fase::Foco) => {
            if sess.focos % cfg.ciclos_ate_longa == 0 {
                Fase::PausaLonga
            } else {
                Fase::PausaCurta
            }
        }
        _ => Fase::Foco,
    }
}

/// Fecha a fase corrente e deixa a próxima pronta — começando sozinha só se o
/// usuário pediu isso na configuração.
fn encerrar_fase(
    app: &tauri::AppHandle,
    db: &Db,
    timer: &TimerState,
    sess: &mut Sessao,
    cfg: &Config,
) {
    let era_foco = sess.fase == Some(Fase::Foco);
    let _ = timer::parar(timer, db);
    if era_foco {
        sess.focos += 1;
    }

    let seguinte = proxima(cfg, sess);
    sess.fase = None;

    let automatico = match seguinte {
        Fase::Foco => cfg.auto_foco,
        _ => cfg.auto_pausa,
    };

    if automatico {
        let _ = abrir_fase(timer, cfg, sess, seguinte);
    } else {
        sess.aguardando = Some(seguinte);
    }

    salvar_sessao(db, sess);

    // A notificação sai do Rust, não do frontend: com a janela minimizada atrás
    // do Chrome, a interface pode nem estar renderizando. Notificar de dentro do
    // processo é o que garante o aviso chegar — que é o ponto inteiro do
    // Pomodoro para quem estuda fora do app.
    if cfg.som {
        use tauri_plugin_notification::NotificationExt;
        let (titulo, corpo) = if era_foco {
            ("Fim do foco", format!("Hora da {}.", seguinte.rotulo().to_lowercase()))
        } else {
            ("Fim da pausa", "Pronto para voltar ao foco.".to_string())
        };
        let _ = app.notification().builder().title(titulo).body(corpo).show();
    }

    let _ = app.emit(
        "pomodoro:fase",
        serde_json::json!({
            "terminou": if era_foco { "foco" } else { "pausa" },
            "proxima": seguinte.rotulo(),
            "automatico": automatico,
        }),
    );
}

#[tauri::command]
pub fn pomodoro_avancar(
    app: tauri::AppHandle,
    db: tauri::State<Db>,
    timer: tauri::State<TimerState>,
    pomo: tauri::State<PomodoroState>,
) -> Result<(), String> {
    let cfg = config_de(&db);
    let mut sess = pomo.0.lock().map_err(|_| "estado ocupado")?;

    if let Some(f) = sess.aguardando {
        abrir_fase(&timer, &cfg, &mut sess, f)?;
        salvar_sessao(&db, &sess);
        return Ok(());
    }
    if sess.fase.is_none() {
        return Err("nenhum Pomodoro em andamento".into());
    }
    encerrar_fase(&app, &db, &timer, &mut sess, &cfg);
    Ok(())
}

#[tauri::command]
pub fn pomodoro_encerrar(
    db: tauri::State<Db>,
    timer: tauri::State<TimerState>,
    pomo: tauri::State<PomodoroState>,
) -> Result<(), String> {
    let mut sess = pomo.0.lock().map_err(|_| "estado ocupado")?;
    if sess.fase.is_some() {
        // Encerrar antes do fim grava o tempo real, não o planejado: o que
        // aconteceu vale mais que o que estava previsto.
        let _ = timer::parar(&timer, &db);
    }
    *sess = Sessao::default();
    salvar_sessao(&db, &sess);
    Ok(())
}

#[tauri::command]
pub fn pomodoro_estado(
    db: tauri::State<Db>,
    timer: tauri::State<TimerState>,
    pomo: tauri::State<PomodoroState>,
) -> Estado {
    let cfg = config_de(&db);
    let sess = pomo.0.lock().map(|s| s.clone()).unwrap_or_default();
    let st = timer::status_de(&timer);

    Estado {
        ativo: sess.fase.is_some() || sess.aguardando.is_some(),
        fase: sess.fase,
        rotulo: sess.fase.map(|f| f.rotulo().to_string()),
        aguardando: sess.aguardando,
        rotulo_aguardando: sess.aguardando.map(|f| f.rotulo().to_string()),
        focos: sess.focos,
        ciclos_ate_longa: cfg.ciclos_ate_longa,
        decorrido_ms: st.as_ref().map(|s| s.wall_ms).unwrap_or(0),
        planejado_ms: sess.fase.map(|f| cfg.minutos(f) * 60_000).unwrap_or(0),
        descricao: sess.descricao,
    }
}

/// Vigia o fim da fase. Roda a cada segundo no Rust porque é o único lugar que
/// continua contando com a janela minimizada.
pub fn spawn_relogio(app: tauri::AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(std::time::Duration::from_secs(1));

        let (Some(db), Some(timer), Some(pomo)) = (
            app.try_state::<Db>(),
            app.try_state::<TimerState>(),
            app.try_state::<PomodoroState>(),
        ) else {
            continue;
        };

        let cfg = config_de(&db);
        let Ok(mut sess) = pomo.0.lock() else { continue };
        let Some(fase) = sess.fase else { continue };

        let Some(st) = timer::status_de(&timer) else {
            // Fase marcada como ativa sem relógio rodando: o app caiu no meio.
            // Deixa a próxima em espera em vez de contar tempo que ninguém viu.
            sess.fase = None;
            sess.aguardando = Some(proxima(&cfg, &sess));
            salvar_sessao(&db, &sess);
            continue;
        };

        if st.wall_ms >= cfg.minutos(fase) * 60_000 {
            encerrar_fase(&app, &db, &timer, &mut sess, &cfg);
        }
    });
}

/// Última sessão do dia, para a interface mostrar os ciclos e o efetivo contra
/// o planejado (§3.4).
#[derive(Serialize)]
pub struct Ciclo {
    pub rotulo: String,
    pub atividade: String,
    pub cor: String,
    pub cor_escura: Option<String>,
    pub inicio: i64,
    pub fim: Option<i64>,
    pub efetivo_ms: i64,
    pub planejado_ms: Option<i64>,
}

#[tauri::command]
pub fn pomodoro_ciclos(
    db: tauri::State<Db>,
    pomo: tauri::State<PomodoroState>,
) -> Result<Vec<Ciclo>, String> {
    let Some(sid) = pomo.0.lock().ok().and_then(|s| s.sessao_id.clone()) else {
        return Ok(vec![]);
    };
    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
    let mut stmt = conn
        .prepare(
            "SELECT e.context, a.nome, a.cor, a.cor_escura, e.started_at, e.ended_at,
                    e.planejado_ms
               FROM time_entries e
               JOIN activity_types a ON a.id = e.activity_type_id
              WHERE e.parent_id = ?1 AND e.deleted_at IS NULL
              ORDER BY e.started_at",
        )
        .map_err(|e| e.to_string())?;

    let v = stmt
        .query_map(rusqlite::params![sid], |r| {
            let ctx: String = r.get(0)?;
            let inicio: i64 = r.get(4)?;
            let fim: Option<i64> = r.get(5)?;
            Ok(Ciclo {
                rotulo: if ctx == "pomodoro_focus" { "Foco" } else { "Pausa" }.into(),
                atividade: r.get(1)?,
                cor: r.get(2)?,
                cor_escura: r.get(3)?,
                inicio,
                fim,
                efetivo_ms: fim.unwrap_or_else(agora_ms) - inicio,
                planejado_ms: r.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(v)
}
