//! Ponte local: a única porta de entrada de fora do app (D-008).
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
//!  * **dois tokens distintos**, um para a extensão do Chrome e outro para o
//!    MCP. Eles são revogáveis separadamente e têm alcances diferentes;
//!  * o MCP passa ainda por permissões (leitura, escrita, e cada ferramenta),
//!    e toda escrita — aceita ou recusada — vai para a auditoria;
//!  * nenhuma rota aceita caminho de arquivo, comando, ou URL para abrir. Quem
//!    chama manda dado; não pede ação sobre o sistema.

use crate::db::Db;
use crate::permissoes::{self, ConfigMcp, Origem};
use crate::timer::TimerState;
use crate::{entries, library, notas, tasks, timer};
use serde_json::{json, Value};
use std::io::Read;
use tauri::Manager;
use tiny_http::{Header, Request, Response, Server};

pub const PORTA_PADRAO: u16 = 47823;

pub struct Ponte {
    pub porta: u16,
    pub token: String,
}

/// Token de pareamento da extensão. Vive no banco: sobrevive a reinício, e
/// trocá-lo invalida a extensão na hora — que é o "revogar" de §8 do plano.
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
    let mut resp = Response::from_string(corpo.to_string())
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
    // do app. 64 KB é folgado para o que a extensão e o MCP mandam.
    let mut limitado = req.as_reader().take(64 * 1024);
    if limitado.read_to_string(&mut texto).is_err() {
        return Value::Null;
    }
    serde_json::from_str(&texto).unwrap_or(Value::Null)
}

fn param(req: &Request, nome: &str) -> Option<String> {
    let url = req.url();
    let q = url.split_once('?')?.1;
    q.split('&').find_map(|p| {
        let (k, v) = p.split_once('=')?;
        (k == nome).then(|| v.replace("%20", " ").replace('+', " "))
    })
}

/// Decide se a chamada pode seguir. Restrições valem só para o MCP: a extensão
/// tem token próprio e escopo próprio, e misturar os dois faria uma permissão
/// pensada para a IA derrubar o cronômetro do navegador sem aviso.
fn pode(
    origem: Origem,
    cfg: &ConfigMcp,
    escrita: bool,
    ferramenta: Option<bool>,
) -> Result<(), String> {
    if origem == Origem::Extensao {
        return Ok(());
    }
    if !cfg.habilitado {
        return Err("integração MCP desligada no app".into());
    }
    if !escrita && !cfg.leitura {
        return Err("leitura não autorizada".into());
    }
    if escrita && !cfg.escrita {
        return Err("escrita não autorizada — ligue em Configurações".into());
    }
    if escrita && ferramenta == Some(false) {
        return Err("esta ferramenta está desativada".into());
    }
    Ok(())
}

pub fn iniciar(app: tauri::AppHandle, porta: u16, token_extensao: String) {
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

            let Some(db) = app.try_state::<Db>() else {
                responder(req, 503, json!({ "erro": "banco indisponível" }));
                continue;
            };

            // O token do MCP é relido a cada pedido de propósito: revogar tem
            // que valer na hora, não no próximo reinício do app.
            let token_mcp = db
                .conn
                .lock()
                .ok()
                .and_then(|c| permissoes::token_mcp(&c).ok())
                .unwrap_or_default();

            let apresentado = valor_do_header(&req, "Authorization")
                .and_then(|v| v.strip_prefix("Bearer ").map(str::to_string));

            let origem = match apresentado.as_deref() {
                Some(t) if t == token_extensao => Some(Origem::Extensao),
                Some(t) if !t.is_empty() && t == token_mcp => Some(Origem::Mcp),
                _ => None,
            };

            let Some(origem) = origem else {
                responder(req, 401, json!({ "erro": "token inválido ou ausente" }));
                continue;
            };

            let cfg = permissoes::config_mcp(&db);

            // Fecha a permissão e, quando for escrita, registra o que passou.
            macro_rules! guardar {
                ($escrita:expr, $ferramenta:expr, $acao:expr, $detalhe:expr) => {
                    match pode(origem, &cfg, $escrita, $ferramenta) {
                        Ok(()) => {
                            if $escrita {
                                permissoes::auditar(&db, origem, $acao, &$detalhe, "ok");
                            }
                        }
                        Err(e) => {
                            permissoes::auditar(&db, origem, $acao, &$detalhe, "recusado");
                            responder(req, 403, json!({ "erro": e }));
                            continue;
                        }
                    }
                };
            }

            match (metodo.as_str(), rota.as_str()) {
                // --- leitura -------------------------------------------------
                ("GET", "/estado") => {
                    guardar!(false, None, "ler_estado", json!({}));
                    let cursos = library::cursos_json(&db);
                    let t = app
                        .try_state::<TimerState>()
                        .and_then(|s| timer::status_de(&s))
                        .map(|s| json!({ "descricao": s.description, "wall_ms": s.wall_ms }));
                    responder(req, 200, json!({ "timer": t, "cursos": cursos }));
                }

                ("GET", "/planejamento") => {
                    guardar!(false, None, "ler_planejamento", json!({}));
                    let dia = param(&req, "dia");
                    let ate = param(&req, "ate");
                    let v = tasks::planejamento_json(&db, dia.as_deref(), ate.as_deref());
                    responder(req, 200, v);
                }

                ("GET", "/resumo") => {
                    guardar!(false, None, "ler_resumo", json!({}));
                    let dias: i64 = param(&req, "dias")
                        .and_then(|d| d.parse().ok())
                        .unwrap_or(7)
                        .clamp(1, 365);
                    let ate = crate::db::agora_ms();
                    let desde = ate - dias * 86_400_000;
                    responder(req, 200, entries::resumo_json(&db, desde, ate));
                }

                ("GET", "/notas") => {
                    guardar!(false, None, "ler_notas", json!({}));
                    let busca = param(&req, "busca");
                    responder(req, 200, notas::listar_para_ia(&db, busca.as_deref()));
                }

                // --- escrita -------------------------------------------------
                ("POST", "/cursos") => {
                    let corpo = corpo_json(&mut req);
                    guardar!(true, None, "criar_curso", corpo);
                    let titulo = corpo["titulo"].as_str().unwrap_or("").to_string();
                    let url = corpo["url"].as_str().map(str::to_string);
                    match library::criar(&db, titulo, url) {
                        Ok(id) => responder(req, 200, json!({ "id": id })),
                        Err(e) => responder(req, 400, json!({ "erro": e })),
                    }
                }

                ("POST", "/cursos/rota") => {
                    let corpo = corpo_json(&mut req);
                    guardar!(true, None, "atualizar_rota", corpo);
                    let id = corpo["curso_id"].as_str().unwrap_or("").to_string();
                    let url = corpo["url"].as_str().unwrap_or("").to_string();
                    if id.is_empty() || url.is_empty() {
                        responder(req, 400, json!({ "erro": "curso_id e url são obrigatórios" }));
                    } else {
                        library::registrar_ultima_url(&db, &id, &url);
                        responder(req, 200, json!({ "ok": true }));
                    }
                }

                ("POST", "/tarefas") => {
                    let corpo = corpo_json(&mut req);
                    guardar!(true, Some(cfg.ferramentas.criar_tarefa), "criar_tarefa", corpo);
                    let r = tasks::criar_simples(
                        &db,
                        corpo["titulo"].as_str().unwrap_or("").to_string(),
                        corpo["dia"].as_str().map(str::to_string),
                        corpo["curso_id"].as_str().map(str::to_string),
                        corpo["duracao_min"].as_i64(),
                    );
                    match r {
                        Ok(id) => responder(req, 200, json!({ "id": id })),
                        Err(e) => responder(req, 400, json!({ "erro": e })),
                    }
                }

                ("POST", "/tarefas/concluir") => {
                    let corpo = corpo_json(&mut req);
                    guardar!(true, Some(cfg.ferramentas.concluir_tarefa), "concluir_tarefa", corpo);
                    match tasks::concluir_simples(&db, corpo["id"].as_str().unwrap_or("")) {
                        Ok(()) => responder(req, 200, json!({ "ok": true })),
                        Err(e) => responder(req, 400, json!({ "erro": e })),
                    }
                }

                ("POST", "/notas") => {
                    let corpo = corpo_json(&mut req);
                    guardar!(true, Some(cfg.ferramentas.criar_nota), "criar_nota", json!({
                        "titulo": corpo["titulo"], "curso_id": corpo["curso_id"]
                    }));
                    let tags = corpo["tags"]
                        .as_array()
                        .map(|a| {
                            a.iter()
                                .filter_map(|t| t.as_str().map(str::to_string))
                                .collect()
                        })
                        .unwrap_or_default();
                    let r = notas::criar_simples(
                        &db,
                        corpo["titulo"].as_str().map(str::to_string),
                        corpo["conteudo"].as_str().unwrap_or("").to_string(),
                        corpo["curso_id"].as_str().map(str::to_string),
                        tags,
                    );
                    match r {
                        Ok(id) => responder(req, 200, json!({ "id": id })),
                        Err(e) => responder(req, 400, json!({ "erro": e })),
                    }
                }

                ("POST", "/timer/iniciar") => {
                    let corpo = corpo_json(&mut req);
                    guardar!(
                        true,
                        Some(cfg.ferramentas.controlar_cronometro),
                        "iniciar_cronometro",
                        corpo
                    );
                    let desc = corpo["descricao"].as_str().unwrap_or("").to_string();
                    let curso = corpo["curso_id"].as_str().map(str::to_string);
                    let r = match app.try_state::<TimerState>() {
                        Some(s) => timer::iniciar(&s, timer::Inicio::livre(desc, curso, None, None))
                            .map(|_| ()),
                        None => Err("cronômetro indisponível".into()),
                    };
                    // A bandeja mostra o que está correndo. Sem isto, começar
                    // pela extensão deixaria o menu mentindo até a próxima vez
                    // que a janela mexesse em alguma coisa.
                    crate::bandeja::atualizar(&app);
                    match r {
                        Ok(()) => responder(req, 200, json!({ "ok": true })),
                        Err(e) => responder(req, 409, json!({ "erro": e })),
                    }
                }

                ("POST", "/timer/parar") => {
                    guardar!(
                        true,
                        Some(cfg.ferramentas.controlar_cronometro),
                        "parar_cronometro",
                        json!({})
                    );
                    let r = match app.try_state::<TimerState>() {
                        Some(s) => timer::parar(&s, &db).map(|res| res.wall_ms),
                        None => Err("cronômetro indisponível".into()),
                    };
                    crate::bandeja::atualizar(&app);
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

/// Dados de pareamento da extensão, para a tela de configuração.
#[tauri::command]
pub fn ponte_info(ponte: tauri::State<Ponte>) -> Value {
    json!({ "porta": ponte.porta, "token": ponte.token })
}
