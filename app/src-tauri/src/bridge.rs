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
        (k == nome).then(|| decodificar(v))
    })
}

/// Desfaz o percent-encoding de um valor da query: `+` é espaço, como em
/// formulário, e `%C3%A9` vira `é`. Sem isto, qualquer busca com acento vinda
/// do servidor MCP — que codifica com `encodeURIComponent` — não casava nada.
fn decodificar(v: &str) -> String {
    percent_encoding::percent_decode_str(&v.replace('+', " "))
        .decode_utf8_lossy()
        .into_owned()
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

pub fn iniciar(app: tauri::AppHandle, porta: u16) {
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

            // Os dois tokens são relidos a cada pedido de propósito: revogar
            // tem que valer na hora, não no próximo reinício do app.
            let (token_extensao, token_mcp) = match db.conn.lock() {
                Ok(c) => (
                    token(&c).unwrap_or_default(),
                    permissoes::token_mcp(&c).unwrap_or_default(),
                ),
                Err(_) => (String::new(), String::new()),
            };

            let apresentado = valor_do_header(&req, "Authorization")
                .and_then(|v| v.strip_prefix("Bearer ").map(str::to_string));

            let origem = match apresentado.as_deref() {
                Some(t) if !t.is_empty() && t == token_extensao => Some(Origem::Extensao),
                Some(t) if !t.is_empty() && t == token_mcp => Some(Origem::Mcp),
                _ => None,
            };

            let Some(origem) = origem else {
                responder(req, 401, json!({ "erro": "token inválido ou ausente" }));
                continue;
            };

            let cfg = permissoes::config_mcp(&db);

            // Fecha a permissão. A recusa é auditada aqui; o que passou só é
            // auditado depois, com o resultado real — um pedido que a permissão
            // aceitou e o cronômetro recusou não é "ok".
            macro_rules! guardar {
                ($escrita:expr, $ferramenta:expr, $acao:expr, $detalhe:expr) => {
                    if let Err(e) = pode(origem, &cfg, $escrita, $ferramenta) {
                        permissoes::auditar(&db, origem, $acao, &$detalhe, "recusado");
                        responder(req, 403, json!({ "erro": e }));
                        continue;
                    }
                };
            }

            // Responde uma escrita e a audita com o que de fato aconteceu.
            macro_rules! escrita {
                ($acao:expr, $detalhe:expr, $resultado:expr) => {
                    match $resultado {
                        Ok(corpo) => {
                            permissoes::auditar(&db, origem, $acao, &$detalhe, "ok");
                            responder(req, 200, corpo);
                        }
                        Err((status, e)) => {
                            permissoes::auditar(&db, origem, $acao, &$detalhe, "erro");
                            responder(req, status, json!({ "erro": e }));
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
                        // O total da sessão, e não só o segmento corrente: depois
                        // de pausar e retomar, a extensão mostrava o tempo desde a
                        // retomada.
                        .map(|s| json!({
                            "descricao": s.description,
                            "wall_ms": s.acumulado_ms + s.wall_ms,
                            "segmento_ms": s.wall_ms,
                            "pausado": s.pausado,
                        }));
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
                    let r = library::criar(&db, titulo, url)
                        .map(|id| json!({ "id": id }))
                        .map_err(|e| (400u16, e));
                    escrita!("criar_curso", corpo, r);
                }

                ("POST", "/cursos/rota") => {
                    let corpo = corpo_json(&mut req);
                    guardar!(true, None, "atualizar_rota", corpo);
                    let id = corpo["curso_id"].as_str().unwrap_or("").to_string();
                    let url = corpo["url"].as_str().unwrap_or("").to_string();
                    let r: Result<Value, (u16, String)> = if id.is_empty() || url.is_empty() {
                        Err((400, "curso_id e url são obrigatórios".into()))
                    } else {
                        library::registrar_ultima_url(&db, &id, &url);
                        Ok(json!({ "ok": true }))
                    };
                    escrita!("atualizar_rota", corpo, r);
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
                    let r = r.map(|id| json!({ "id": id })).map_err(|e| (400u16, e));
                    escrita!("criar_tarefa", corpo, r);
                }

                ("POST", "/tarefas/concluir") => {
                    let corpo = corpo_json(&mut req);
                    guardar!(true, Some(cfg.ferramentas.concluir_tarefa), "concluir_tarefa", corpo);
                    let r = tasks::concluir_simples(&db, corpo["id"].as_str().unwrap_or(""))
                        .map(|()| json!({ "ok": true }))
                        .map_err(|e| (400u16, e));
                    escrita!("concluir_tarefa", corpo, r);
                }

                ("POST", "/notas") => {
                    let corpo = corpo_json(&mut req);
                    // Só título e curso no rastro: a auditoria não é cópia da nota.
                    let detalhe = json!({ "titulo": corpo["titulo"], "curso_id": corpo["curso_id"] });
                    guardar!(true, Some(cfg.ferramentas.criar_nota), "criar_nota", detalhe);
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
                    let r = r.map(|id| json!({ "id": id })).map_err(|e| (400u16, e));
                    escrita!("criar_nota", detalhe, r);
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
                    let r = r.map(|()| json!({ "ok": true })).map_err(|e| (409u16, e));
                    escrita!("iniciar_cronometro", corpo, r);
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
                    let r = r
                        .map(|ms| json!({ "ok": true, "wall_ms": ms }))
                        .map_err(|e| (409u16, e));
                    escrita!("parar_cronometro", json!({}), r);
                }

                _ => responder(req, 404, json!({ "erro": "rota desconhecida" })),
            }
        }
    });
}

/// Dados de pareamento da extensão, para a tela de configuração. O token sai
/// do banco, que é de onde a ponte também o lê.
#[tauri::command]
pub fn ponte_info(db: tauri::State<Db>, ponte: tauri::State<Ponte>) -> Result<Value, String> {
    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
    let t = token(&conn).map_err(|e| e.to_string())?;
    Ok(json!({ "porta": ponte.porta, "token": t }))
}

/// Troca o token da extensão. Vale no pedido seguinte: a ponte relê o token a
/// cada requisição, então a extensão antiga para de ser aceita na hora — é a
/// revogação separada que D-020 promete para cada um dos dois tokens.
#[tauri::command]
pub fn ponte_revogar(db: tauri::State<Db>) -> Result<String, String> {
    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
    let novo = uuid::Uuid::new_v4().to_string().replace('-', "");
    conn.execute(
        "INSERT INTO settings (chave, valor) VALUES ('bridge_token', ?1)
         ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor",
        rusqlite::params![novo],
    )
    .map_err(|e| e.to_string())?;
    Ok(novo)
}

#[cfg(test)]
mod testes {
    use super::decodificar;

    #[test]
    fn desfaz_percent_encoding() {
        assert_eq!(decodificar("caf%C3%A9"), "café");
        assert_eq!(decodificar("a+b%20c"), "a b c");
        assert_eq!(decodificar("2026-09-05"), "2026-09-05");
        assert_eq!(decodificar("mais%2Bmais"), "mais+mais", "o + codificado continua +");
    }
}
