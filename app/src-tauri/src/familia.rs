//! Modo família (D-042): resumo agregado de minutos por categoria e dia,
//! enviado a um hub Supabase separado do projeto pessoal de cada um.
//!
//! Só isto sai da máquina: `membro_id`, dia local, nome da categoria e
//! minutos totais do dia. Nome de curso, tarefa, nota e descrição nunca
//! passam por aqui — continuam só no banco pessoal (D-024). Esquema do hub
//! em `docs/08-modo-familia.md`.
//!
//! Sem fila e sem histórico de operações como em `sync.rs`: cada envio
//! sobrescreve o total do dia inteiro (upsert pela chave primária do hub), e
//! não há conflito possível em "qual é o total de hoje".

use crate::db::Db;
use chrono::{Local, NaiveTime, TimeZone};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct Config {
    pub hub_url: Option<String>,
    /// Chave anon do projeto do hub. Não é a mesma do projeto pessoal
    /// (`supabase.rs::Config::anon_key`) — são dois projetos Supabase
    /// diferentes, de propósito (D-042).
    pub hub_anon_key: Option<String>,
    /// Nome curto que identifica esta pessoa nas linhas do hub. Não é login:
    /// não há conta por pessoa no hub, só a chave anon compartilhada.
    pub membro_id: Option<String>,
}

pub fn config_de(db: &Db) -> Config {
    db.conn
        .lock()
        .ok()
        .and_then(|c| {
            c.query_row(
                "SELECT valor FROM settings WHERE chave = 'familia_config'",
                [],
                |r| r.get::<_, String>(0),
            )
            .ok()
        })
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn gravar_config(db: &Db, c: &Config) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
    conn.execute(
        "INSERT INTO settings (chave, valor) VALUES ('familia_config', ?1)
         ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor",
        params![serde_json::to_string(c).map_err(|e| e.to_string())?],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn familia_configurar(
    db: tauri::State<Db>,
    hub_url: String,
    hub_anon_key: String,
    membro_id: String,
) -> Result<(), String> {
    let hub_url = hub_url.trim().trim_end_matches('/').to_string();
    let hub_anon_key = hub_anon_key.trim().to_string();
    let membro_id = membro_id.trim().to_string();
    if hub_url.is_empty() || hub_anon_key.is_empty() {
        return Err("informe a URL e a chave do hub da família".into());
    }
    if membro_id.is_empty() {
        return Err("informe o nome deste membro".into());
    }
    gravar_config(
        &db,
        &Config {
            hub_url: Some(hub_url),
            hub_anon_key: Some(hub_anon_key),
            membro_id: Some(membro_id),
        },
    )
}

#[derive(Serialize)]
pub struct Estado {
    pub configurado: bool,
    pub membro_id: Option<String>,
}

/// Não devolve `hub_anon_key`: a tela não precisa reexibi-la, e menos texto
/// sensível cruzando a ponte é menos texto para vazar num log por engano.
#[tauri::command]
pub fn familia_estado(db: tauri::State<Db>) -> Estado {
    let cfg = config_de(&db);
    Estado {
        configurado: cfg.hub_url.is_some() && cfg.hub_anon_key.is_some() && cfg.membro_id.is_some(),
        membro_id: cfg.membro_id,
    }
}

/// Início (incluso) e fim (exclusivo) do dia local de hoje, em ms UTC desde a
/// época — para filtrar `time_entries.started_at`, que é sempre UTC (001).
/// Por início, não por fim: mesma convenção de D-033 para bucketizar o dia.
fn janela_do_dia_local() -> (i64, i64, String) {
    let hoje = Local::now().date_naive();
    let inicio = Local
        .from_local_datetime(&hoje.and_time(NaiveTime::MIN))
        .single()
        .unwrap_or_else(|| Local::now());
    let amanha = hoje.succ_opt().unwrap_or(hoje);
    let fim = Local
        .from_local_datetime(&amanha.and_time(NaiveTime::MIN))
        .single()
        .unwrap_or_else(|| Local::now());
    (
        inicio.timestamp_millis(),
        fim.timestamp_millis(),
        hoje.format("%Y-%m-%d").to_string(),
    )
}

#[derive(Serialize)]
struct LinhaHub {
    membro_id: String,
    dia: String,
    activity_type_nome: String,
    minutos: i64,
}

/// Soma os lançamentos encerrados de hoje por categoria, só das categorias
/// marcadas `compartilhar_familia`, e envia ao hub. Sessão em aberto não
/// entra: ela ainda não tem `ended_at`, e vai entrar no próximo envio depois
/// de encerrada.
pub fn enviar_hoje(db: &Db) -> Result<(), String> {
    let cfg = config_de(db);
    let (url, key, membro) = match (&cfg.hub_url, &cfg.hub_anon_key, &cfg.membro_id) {
        (Some(u), Some(k), Some(m)) if !u.is_empty() && !k.is_empty() && !m.is_empty() => {
            (u.clone(), k.clone(), m.clone())
        }
        _ => return Err("modo família não configurado".into()),
    };

    let (inicio, fim, dia) = janela_do_dia_local();

    let linhas: Vec<(String, i64)> = {
        let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
        let mut stmt = conn
            .prepare(
                "SELECT a.nome, SUM(e.ended_at - e.started_at)
                   FROM time_entries e
                   JOIN activity_types a ON a.id = e.activity_type_id
                  WHERE e.deleted_at IS NULL AND e.ended_at IS NOT NULL
                    AND e.started_at >= ?1 AND e.started_at < ?2
                    AND a.compartilhar_familia = 1 AND a.deleted_at IS NULL
                  GROUP BY a.nome",
            )
            .map_err(|e| e.to_string())?;
        let linhas = stmt
            .query_map(params![inicio, fim], |r| {
                let nome: String = r.get(0)?;
                let total_ms: i64 = r.get(1)?;
                Ok((nome, total_ms / 60_000))
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        linhas
    };

    // Nada compartilhável hoje ainda não é erro — é o estado normal de quem
    // não estudou nada, ou não marcou nenhuma categoria.
    if linhas.is_empty() {
        return Ok(());
    }

    let corpo: Vec<LinhaHub> = linhas
        .into_iter()
        .map(|(nome, minutos)| LinhaHub {
            membro_id: membro.clone(),
            dia: dia.clone(),
            activity_type_nome: nome,
            minutos,
        })
        .collect();

    // Tempo limite curto: isto roda sozinho atrás do fim de um cronômetro, e
    // uma rede ruim não pode segurar quem só queria parar de estudar.
    let cliente = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;

    let r = cliente
        .post(format!("{url}/rest/v1/family_daily_stats"))
        .header("apikey", &key)
        .header("Authorization", format!("Bearer {key}"))
        .header("Content-Type", "application/json")
        .header("Prefer", "resolution=merge-duplicates,return=minimal")
        .json(&corpo)
        .send()
        .map_err(|e| format!("não consegui falar com o hub da família: {e}"))?;

    if !r.status().is_success() {
        let status = r.status();
        let texto = r.text().unwrap_or_default();
        return Err(format!("hub da família respondeu {status}: {texto}"));
    }
    Ok(())
}

#[tauri::command]
pub fn familia_enviar_hoje(db: tauri::State<Db>) -> Result<(), String> {
    enviar_hoje(&db)
}

const INTERVALO: Duration = Duration::from_secs(15 * 60);

/// Envio periódico, mesmo padrão de `timer::spawn_heartbeat` e
/// `pomodoro::spawn_relogio`: uma thread simples, sem runtime assíncrono.
/// Erro (não configurado, hub fora do ar) é engolido de propósito — quem não
/// configurou o modo família não deve ver nada sobre ele, e uma falha de rede
/// aqui não é incidente: o próximo ciclo tenta de novo.
pub fn spawn_envio(app: tauri::AppHandle) {
    use tauri::Manager;
    std::thread::spawn(move || loop {
        std::thread::sleep(INTERVALO);
        if let Some(db) = app.try_state::<Db>() {
            let _ = enviar_hoje(&db);
        }
    });
}
