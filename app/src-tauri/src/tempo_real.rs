//! Sincronização em tempo real (D-043).
//!
//! A arquitetura de D-024 não muda: o SQLite continua sendo a verdade, a fila
//! continua preenchida por gatilho e a troca continua sendo `sync::rodar` —
//! recebe, depois envia. O que muda é **quem decide rodar**. Antes, só o botão.
//! Agora, duas tarefas assíncronas que vivem enquanto o app estiver aberto:
//!
//! * **`conexao`** mantém um WebSocket com o Supabase Realtime, inscrito nas
//!   linhas novas de `sync_operations` vindas de *outras* máquinas. Não aplica
//!   nada: o aviso só acorda o sincronizador. O conteúdo continua vindo pelo
//!   caminho de sempre, com cursor, páginas e regras de conflito — um aviso
//!   perdido atrasa, nunca corrompe.
//! * **`sincronizador`** roda uma rodada quando (a) chega um aviso, (b) a fila
//!   local tem operação pendente — qualquer escrita, de qualquer módulo, porque
//!   o gatilho enfileira sem ninguém precisar lembrar de avisar — ou (c) passou
//!   tempo demais desde a última, a rede de segurança para aviso perdido e
//!   conexão caída.
//!
//! Sem login, sem projeto ou sem rede, as duas ficam esperando em silêncio: o
//! app funciona inteiro offline, e a sincronização alcança quando der.

use crate::db::{agora_ms, Db};
use futures_util::{SinkExt, StreamExt};
use reqwest_websocket::{Message, Upgrade};
use serde::Serialize;
use serde_json::{json, Value};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::Notify;

/// De quanto em quanto tempo o sincronizador olha a fila local. É o atraso
/// máximo entre uma escrita e o envio dela.
const OLHAR_FILA: Duration = Duration::from_millis(1500);
/// Rede de segurança com o tempo real ligado: só para aviso perdido.
const RODADA_CONECTADO_MS: i64 = 5 * 60_000;
/// Sem tempo real (conexão caída, projeto sem a publicação), vira a forma
/// principal de receber — então bem mais frequente.
const RODADA_DESCONECTADO_MS: i64 = 60_000;
/// Depois de uma rodada com erro, a fila pendente não dispara outra antes
/// disto. Sem rede, olhar a fila a cada 1,5 s viraria uma tentativa por ciclo.
const ESPERA_APOS_ERRO_MS: i64 = 30_000;
/// O Phoenix, que serve o Realtime, derruba conexão sem batida em 60 s.
const BATIDA: Duration = Duration::from_secs(25);
const SILENCIO_MAXIMO: Duration = Duration::from_secs(60);
/// A conexão é refeita antes de o token de acesso vencer. Reabrir com um
/// token novo é mais simples, e mais fácil de provar, que renovar o token de
/// um canal aberto.
const RENOVAR_ANTES_MS: i64 = 3 * 60_000;
const TOPICO: &str = "realtime:estudos-sync";

#[derive(Serialize, Clone, Default)]
pub struct Estado {
    /// Inscrição aceita pelo Supabase: avisos chegam em segundos.
    pub conectado: bool,
    pub ultima_rodada: Option<i64>,
    pub erro_rodada: Option<String>,
    pub erro_conexao: Option<String>,
}

fn estado() -> &'static Mutex<Estado> {
    static E: OnceLock<Mutex<Estado>> = OnceLock::new();
    E.get_or_init(|| Mutex::new(Estado::default()))
}

fn marcar(f: impl FnOnce(&mut Estado)) {
    if let Ok(mut e) = estado().lock() {
        f(&mut e);
    }
}

#[tauri::command]
pub fn sync_tempo_real() -> Estado {
    estado().lock().map(|e| e.clone()).unwrap_or_default()
}

/// Projeto configurado e alguém conectado. Não prova que a sessão é válida —
/// isso só a troca de token diz, e o erro dela aparece na tela.
fn pronto(db: &Db) -> Option<crate::supabase::Config> {
    let cfg = crate::supabase::config_de(db);
    let tem = |v: &Option<String>| v.as_deref().is_some_and(|s| !s.is_empty());
    (tem(&cfg.url) && tem(&cfg.anon_key) && tem(&cfg.email)).then_some(cfg)
}

pub fn iniciar(app: AppHandle) {
    let aviso = Arc::new(Notify::new());
    tauri::async_runtime::spawn(sincronizador(app.clone(), aviso.clone()));
    tauri::async_runtime::spawn(conexao(app, aviso));
}

// --- sincronizador -----------------------------------------------------------

async fn sincronizador(app: AppHandle, aviso: Arc<Notify>) {
    // Zero faz a primeira rodada acontecer logo na abertura: é quando mais
    // coisa da outra máquina está esperando.
    let mut ultima: i64 = 0;
    let mut erro_em: Option<i64> = None;

    loop {
        // `notified` guarda o aviso que chegar durante uma rodada: ele acorda
        // a espera seguinte em vez de se perder.
        let avisado = tokio::select! {
            _ = aviso.notified() => true,
            _ = tokio::time::sleep(OLHAR_FILA) => false,
        };

        let Some(db) = app.try_state::<Db>() else { continue };
        if pronto(&db).is_none() {
            continue;
        }

        let agora = agora_ms();
        let conectado = estado().lock().map(|e| e.conectado).unwrap_or(false);
        let intervalo = if conectado { RODADA_CONECTADO_MS } else { RODADA_DESCONECTADO_MS };
        let tem_fila = crate::sync::na_fila(&db) > 0;

        if !(avisado || tem_fila || agora - ultima >= intervalo) {
            continue;
        }
        // Aviso do servidor passa na frente da espera: se ele chegou, a rede
        // voltou.
        if !avisado && erro_em.is_some_and(|t| agora - t < ESPERA_APOS_ERRO_MS) {
            continue;
        }

        let r = crate::sync::rodar(&db).await;
        ultima = agora_ms();
        match r.erro {
            Some(e) => {
                if erro_em.is_none() {
                    eprintln!("[sync] {e}");
                }
                erro_em = Some(ultima);
                marcar(|s| s.erro_rodada = Some(e));
            }
            None => {
                erro_em = None;
                marcar(|s| {
                    s.erro_rodada = None;
                    s.ultima_rodada = Some(ultima);
                });
            }
        }

        // As telas recarregam só quando entrou dado de fora. Avisar também a
        // cada envio recarregaria a tela embaixo de quem acabou de digitar.
        if r.enviadas > 0 || r.recebimento.aplicadas > 0 || r.recebimento.conflitos > 0 {
            eprintln!(
                "[sync] {} enviada(s), {} aplicada(s), {} em conflito",
                r.enviadas, r.recebimento.aplicadas, r.recebimento.conflitos
            );
        }
        if r.recebimento.aplicadas > 0 {
            let _ = app.emit("sync:mudou", ());
        }
    }
}

// --- conexão -----------------------------------------------------------------

async fn conexao(app: AppHandle, aviso: Arc<Notify>) {
    let mut espera = Duration::from_secs(2);
    loop {
        let cfg = match app.try_state::<Db>() {
            Some(db) => pronto(&db).map(|c| (c, db.device_id.clone())),
            None => None,
        };
        let Some((cfg, device)) = cfg else {
            marcar(|s| s.conectado = false);
            tokio::time::sleep(Duration::from_secs(5)).await;
            continue;
        };

        let resultado = sessao(&cfg, &device, &aviso).await;
        // Conexão que chegou a ser aceita e caiu depois é queda comum de rede,
        // não servidor recusando: a espera recomeça curta.
        if estado().lock().map(|e| e.conectado).unwrap_or(false) {
            espera = Duration::from_secs(2);
        }
        marcar(|s| s.conectado = false);
        match resultado {
            // Saída planejada: o token está para vencer. Reabre na hora.
            Ok(()) => espera = Duration::from_secs(2),
            Err(e) => {
                eprintln!("[tempo real] {e}");
                marcar(|s| s.erro_conexao = Some(e));
                tokio::time::sleep(espera).await;
                espera = (espera * 2).min(Duration::from_secs(60));
            }
        }
    }
}

/// Uma conexão, do handshake até cair ou até a hora de renovar o token.
async fn sessao(
    cfg: &crate::supabase::Config,
    device: &str,
    aviso: &Notify,
) -> Result<(), String> {
    let (token, expira_ms) = crate::supabase::acesso(cfg).await?;
    let url = cfg.url.as_deref().unwrap_or_default().trim_end_matches('/');
    let key = cfg.anon_key.as_deref().unwrap_or_default();
    let base = url
        .replacen("https://", "wss://", 1)
        .replacen("http://", "ws://", 1);

    let mut ws = crate::rede::cliente_ws()
        // A chave vai crua: tanto a anon (JWT) quanto a publicável só usam
        // letras, dígitos, `.`, `-` e `_`, que não precisam de escape.
        .get(format!("{base}/realtime/v1/websocket?apikey={key}&vsn=1.0.0"))
        .upgrade()
        .send()
        .await
        .map_err(|e| format!("tempo real: não consegui conectar: {e}"))?
        .into_websocket()
        .await
        .map_err(|e| format!("tempo real: handshake recusado: {e}"))?;

    // O filtro por máquina é do servidor, como em `receber_ops`: sem ele, cada
    // envio desta máquina voltaria como aviso para ela mesma.
    let entrar = json!({
        "topic": TOPICO,
        "event": "phx_join",
        "ref": "1",
        "join_ref": "1",
        "payload": {
            "config": {
                "broadcast": { "ack": false, "self": false },
                "presence": { "enabled": false },
                "postgres_changes": [{
                    "event": "INSERT",
                    "schema": "public",
                    "table": "sync_operations",
                    "filter": format!("device_id=neq.{device}"),
                }],
                "private": false,
            },
            "access_token": token,
        },
    });
    enviar(&mut ws, &entrar).await?;

    let mut batida = tokio::time::interval(BATIDA);
    batida.tick().await;
    let mut numero: u64 = 1;
    let mut ouvido = Instant::now();

    let renovar_em = (expira_ms - agora_ms() - RENOVAR_ANTES_MS).max(60_000) as u64;
    let prazo = tokio::time::sleep(Duration::from_millis(renovar_em));
    tokio::pin!(prazo);

    loop {
        tokio::select! {
            msg = ws.next() => {
                let msg = msg
                    .ok_or("tempo real: o servidor fechou a conexão")?
                    .map_err(|e| format!("tempo real: conexão caiu: {e}"))?;
                ouvido = Instant::now();
                match msg {
                    Message::Text(t) => tratar(&t, aviso)?,
                    Message::Close { .. } => {
                        return Err("tempo real: o servidor fechou a conexão".into())
                    }
                    _ => {}
                }
            }
            _ = batida.tick() => {
                if ouvido.elapsed() > SILENCIO_MAXIMO {
                    return Err("tempo real: servidor parou de responder".into());
                }
                numero += 1;
                let b = json!({
                    "topic": "phoenix",
                    "event": "heartbeat",
                    "payload": {},
                    "ref": numero.to_string(),
                });
                enviar(&mut ws, &b).await?;
            }
            _ = &mut prazo => return Ok(()),
        }
    }
}

async fn enviar(ws: &mut reqwest_websocket::WebSocket, v: &Value) -> Result<(), String> {
    ws.send(Message::Text(v.to_string()))
        .await
        .map_err(|e| format!("tempo real: envio falhou: {e}"))
}

/// Interpreta uma mensagem do Phoenix. Erro aqui derruba a conexão, e o laço
/// de fora reconecta com espera crescente.
fn tratar(texto: &str, aviso: &Notify) -> Result<(), String> {
    let Ok(v) = serde_json::from_str::<Value>(texto) else {
        return Ok(());
    };
    let evento = v["event"].as_str().unwrap_or_default();
    let topico = v["topic"].as_str().unwrap_or_default();
    let status = v["payload"]["status"].as_str().unwrap_or_default();

    match evento {
        "postgres_changes" => aviso.notify_one(),

        // O canal aceito ainda não é a inscrição aceita: a recusa do banco
        // ("tabela fora da publicação") chega depois, como mensagem `system`.
        // Só ela liga o estado — senão cada recusa contaria como conexão boa,
        // e a espera entre tentativas nunca cresceria.
        "phx_reply" if topico == TOPICO && status != "ok" => {
            return Err(format!(
                "tempo real: inscrição recusada: {}",
                v["payload"]["response"]
            ));
        }

        "system" if topico == TOPICO && status == "ok" => {
            if !estado().lock().map(|e| e.conectado).unwrap_or(false) {
                eprintln!("[tempo real] inscrito em sync_operations");
            }
            marcar(|s| {
                s.conectado = true;
                s.erro_conexao = None;
            });
            // O que outra máquina mandou enquanto esta estava desconectada
            // não gera aviso: uma rodada agora alcança.
            aviso.notify_one();
        }

        // É por aqui que chega "a tabela não está na publicação", o erro mais
        // provável de quem rodou o SQL antigo.
        "system" if topico == TOPICO && status == "error" => {
            return Err(format!(
                "tempo real: {} — rode de novo o SQL da tela de Sincronização",
                v["payload"]["message"].as_str().unwrap_or("o Supabase recusou a inscrição")
            ));
        }

        "phx_error" | "phx_close" if topico == TOPICO => {
            return Err("tempo real: o canal foi encerrado pelo servidor".into());
        }

        _ => {}
    }
    Ok(())
}
