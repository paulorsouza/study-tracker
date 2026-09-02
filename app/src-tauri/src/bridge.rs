//! Ponte local entre a extensão do Chrome e o app (D-008).
//!
//! Um servidor HTTP em `127.0.0.1` é alcançável por qualquer processo da
//! máquina — e, o que costuma ser esquecido, **também por página web comum**:
//! o navegador permite que `https://qualquer-site.com` dispare requisição para
//! `localhost`. A política de mesma origem impede o site de *ler* a resposta,
//! mas não impede o pedido de chegar. Um endpoint de escrita sem proteção
//! seria acionável por qualquer aba aberta.
//!
//! Daí o desenho:
//!
//!  * escuta só em `127.0.0.1`, nunca em `0.0.0.0`;
//!  * toda rota exige `Authorization: Bearer <token>`. Exigir um cabeçalho
//!    fora da lista de "simples" força *preflight* CORS, e é o preflight que
//!    barra o site de terceiro — ele nunca chega a mandar o POST;
//!  * CORS respondido só para origem `chrome-extension://`;
//!  * nenhuma rota aceita caminho de arquivo, comando, ou URL para abrir. A
//!    extensão manda dado; ela não pede ação sobre o sistema.

use crate::db::Db;
use crate::timer::TimerState;
use crate::{library, timer};
use serde_json::{json, Value};
use std::io::Read;
use tauri::Manager;
use tiny_http::{Header, Request, Response, Server};

pub const PORTA_PADRAO: u16 = 47823;

pub struct Ponte {
    pub porta: u16,
    pub token: String,
}

/// Token de pareamento. Vive no banco: sobrevive a reinício, e trocá-lo
/// invalida a extensão na hora — que é o "revogar" de §8 do plano.
pub fn token(conn: &rusqlite::Connection) -> rusqlite::Result<String> {
    if let Ok(v) = conn.query_row(
        "SELECT valor FROM settings WHERE chave = 'bridge_token'",
        [],
        |r| r.get::<_, String>(0),
    ) {
        return Ok(v);
    }
    let novo = uuid::Uuid::new_v4().to_string().replace('-', "");
    conn.execute(
        "INSERT INTO settings (chave, valor) VALUES ('bridge_token', ?1)",
        rusqlite::params![novo],
    )?;
    Ok(novo)
}

fn header(nome: &str, valor: &str) -> Header {
    Header::from_bytes(nome.as_bytes(), valor.as_bytes())
        .expect("cabeçalho fixo, não pode falhar")
}

fn valor_do_header(req: &Request, nome: &'static str) -> Option<String> {
    req.headers()
        .iter()
        .find(|h| h.field.equiv(nome))
        .map(|h| h.value.as_str().to_string())
}

/// Só devolve CORS para a extensão. Site nenhum recebe permissão de leitura.
fn origem_permitida(req: &Request) -> Option<String> {
    let o = valor_do_header(req, "Origin")?;
    o.starts_with("chrome-extension://").then_some(o)
}

fn responder(req: Request, status: u16, corpo: Value) {
    let origem = origem_permitida(&req);
    let texto = corpo.to_string();
    let mut resp = Response::from_string(texto)
        .with_status_code(status)
        .with_header(header("Content-Type", "application/json; charset=utf-8"));

    if let Some(o) = origem {
        resp = resp
            .with_header(header("Access-Control-Allow-Origin", &o))
            .with_header(header("Access-Control-Allow-Headers", "authorization, content-type"))
            .with_header(header("Access-Control-Allow-Methods", "GET, POST, OPTIONS"))
            .with_header(header("Access-Control-Max-Age", "600"));
    }
    let _ = req.respond(resp);
}

fn corpo_json(req: &mut Request) -> Value {
    let mut texto = String::new();
    // Limite de leitura: um corpo gigante não deve conseguir consumir memória
    // do app. 64 KB é folgado para o que a extensão manda.
    let mut limitado = req.as_reader().take(64 * 1024);
    if limitado.read_to_string(&mut texto).is_err() {
        return Value::Null;
    }
    serde_json::from_str(&texto).unwrap_or(Value::Null)
}

pub fn iniciar(app: tauri::AppHandle, porta: u16, token: String) {
    std::thread::spawn(move || {
        let endereco = format!("127.0.0.1:{porta}");
        let server = match Server::http(&endereco) {
            Ok(s) => s,
            Err(e) => {
                eprintln!("[ponte] não subiu em {endereco}: {e}");
                return;
            }
        };
        eprintln!("[ponte] ouvindo em http://{endereco}");

        for mut req in server.incoming_requests() {
            let metodo = req.method().to_string();
            let rota = req.url().split('?').next().unwrap_or("").to_string();

            // Preflight: responde antes de exigir token, senão o navegador
            // nunca chega a mandar o pedido real.
            if metodo == "OPTIONS" {
                responder(req, 204, json!({}));
                continue;
            }

            let autorizado = valor_do_header(&req, "Authorization")
                .and_then(|v| v.strip_prefix("Bearer ").map(str::to_string))
                .is_some_and(|t| t == token);

            if !autorizado {
                responder(req, 401, json!({ "erro": "token inválido ou ausente" }));
                continue;
            }

            match (metodo.as_str(), rota.as_str()) {
                ("GET", "/estado") => {
                    let cursos = app
                        .try_state::<Db>()
                        .map(|db| library::cursos_json(&db))
                        .unwrap_or_else(|| json!([]));
                    let timer = app
                        .try_state::<TimerState>()
                        .and_then(|s| timer::status_de(&s))
                        .map(|s| json!({
                            "descricao": s.description,
                            "wall_ms": s.wall_ms,
                        }));
                    responder(req, 200, json!({ "timer": timer, "cursos": cursos }));
                }

                ("POST", "/cursos") => {
                    let corpo = corpo_json(&mut req);
                    let titulo = corpo["titulo"].as_str().unwrap_or("").to_string();
                    let url = corpo["url"].as_str().map(str::to_string);
                    let r = match app.try_state::<Db>() {
                        Some(db) => library::criar(&db, titulo, url),
                        None => Err("banco indisponível".into()),
                    };
                    match r {
                        Ok(id) => responder(req, 200, json!({ "id": id })),
                        Err(e) => responder(req, 400, json!({ "erro": e })),
                    }
                }

                // Atualiza a rota de um curso já existente: o usuário avançou
                // de aula e quer que o "continuar" aponte para a nova.
                ("POST", "/cursos/rota") => {
                    let corpo = corpo_json(&mut req);
                    let id = corpo["curso_id"].as_str().unwrap_or("").to_string();
                    let url = corpo["url"].as_str().unwrap_or("").to_string();
                    match app.try_state::<Db>() {
                        Some(db) if !id.is_empty() && !url.is_empty() => {
                            library::registrar_ultima_url(&db, &id, &url);
                            responder(req, 200, json!({ "ok": true }));
                        }
                        _ => responder(req, 400, json!({ "erro": "curso_id e url são obrigatórios" })),
                    }
                }

                ("POST", "/timer/iniciar") => {
                    let corpo = corpo_json(&mut req);
                    let desc = corpo["descricao"].as_str().unwrap_or("").to_string();
                    let curso = corpo["curso_id"].as_str().map(str::to_string);
                    let r = match app.try_state::<TimerState>() {
                        Some(s) => timer::iniciar(&s, timer::Inicio::livre(desc, curso, None)).map(|_| ()),
                        None => Err("cronômetro indisponível".into()),
                    };
                    match r {
                        Ok(()) => responder(req, 200, json!({ "ok": true })),
                        Err(e) => responder(req, 409, json!({ "erro": e })),
                    }
                }

                ("POST", "/timer/parar") => {
                    let r = match (app.try_state::<TimerState>(), app.try_state::<Db>()) {
                        (Some(s), Some(db)) => timer::parar(&s, &db).map(|res| res.wall_ms),
                        _ => Err("estado indisponível".into()),
                    };
                    match r {
                        Ok(ms) => responder(req, 200, json!({ "ok": true, "wall_ms": ms })),
                        Err(e) => responder(req, 409, json!({ "erro": e })),
                    }
                }

                _ => responder(req, 404, json!({ "erro": "rota desconhecida" })),
            }
        }
    });
}

/// Dados de pareamento, para a tela de configuração mostrar ao usuário.
#[tauri::command]
pub fn ponte_info(ponte: tauri::State<Ponte>) -> serde_json::Value {
    json!({ "porta": ponte.porta, "token": ponte.token })
}
