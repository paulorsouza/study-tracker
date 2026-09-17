//! Sincronização entre máquinas (§7 do plano).
//!
//! A arquitetura é a planejada: toda alteração vira uma operação na mesma
//! transação da escrita (por gatilho, ver `migrations/008_sync.sql`); as
//! operações são idempotentes; cada máquina guarda um cursor por origem; o que
//! não pode ser aplicado vai para uma área de recuperação em vez de sumir.
//!
//! **O transporte é o Supabase**, um projeto por pessoa (ver `supabase.rs`).
//! Ele aparece só nas funções `enviar` e `receber` — a fila, o versionamento e
//! as regras de conflito abaixo não sabem quem carrega os dados, e é por isso
//! que trocar o transporte foi uma mudança local.
//!
//! O cursor é a sequência atribuída **pelo servidor**, não a local: é ela que
//! ordena o que veio de várias máquinas, e é o "retorna mudanças remotas desde
//! o último cursor" de §7.
//!
//! ## Idempotência sai de graça
//!
//! Aplicar a mesma operação duas vezes não faz nada na segunda: a versão local
//! já é igual à remota e o conteúdo é idêntico, então a função sai antes de
//! escrever. Não é preciso guardar quais operações já foram vistas.

use crate::db::{agora_ms, Db};
use rusqlite::params;
use serde::{Deserialize, Serialize};

/// Entidades sincronizadas. Lista fechada, e é ela que autoriza o nome da
/// tabela a entrar numa consulta — nome de tabela não é parâmetro em SQL, então
/// sem esta lista o upsert genérico seria injeção esperando acontecer.
const ENTIDADES: &[&str] = &[
    "time_entries",
    "tasks",
    "courses",
    "notes",
    "activity_types",
    "activity_goals",
    "subjects",
    "time_favorites",
];

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Operacao {
    pub seq: i64,
    pub id: String,
    pub entidade: String,
    pub registro_id: String,
    pub version: i64,
    pub device_id: String,
    pub payload: serde_json::Value,
    pub criada_em: i64,
}

// --- envio -------------------------------------------------------------------

/// Manda as operações pendentes e só então as marca como enviadas.
///
/// A ordem importa: se o envio falhar no meio, elas continuam pendentes e vão
/// de novo. Reenviar é inofensivo — a chave primária no servidor é o id da
/// operação — enquanto perder não é.
pub async fn enviar(db: &Db, cfg: &crate::supabase::Config, token: &str) -> Result<usize, String> {
    let (ops, ultima) = {
        let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
        let mut stmt = conn
            .prepare(
                "SELECT seq, id, entidade, registro_id, version, device_id, payload, criada_em
                   FROM sync_operations WHERE enviada_em IS NULL ORDER BY seq LIMIT 500",
            )
            .map_err(|e| e.to_string())?;
        let linhas = stmt
            .query_map([], |r| {
                let payload: String = r.get(6)?;
                Ok((
                    r.get::<_, i64>(0)?,
                    serde_json::json!({
                        "id": r.get::<_, String>(1)?,
                        "entidade": r.get::<_, String>(2)?,
                        "registro_id": r.get::<_, String>(3)?,
                        "version": r.get::<_, i64>(4)?,
                        "device_id": r.get::<_, String>(5)?,
                        "payload": serde_json::from_str::<serde_json::Value>(&payload)
                            .unwrap_or(serde_json::Value::Null),
                        "criada_em": r.get::<_, i64>(7)?,
                    }),
                ))
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        let ultima = linhas.last().map(|(n, _)| *n).unwrap_or(0);
        (linhas.into_iter().map(|(_, v)| v).collect::<Vec<_>>(), ultima)
    };

    if ops.is_empty() {
        return Ok(0);
    }

    crate::supabase::enviar_ops(cfg, token, &ops).await?;

    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
    conn.execute(
        "UPDATE sync_operations SET enviada_em = ?1 WHERE enviada_em IS NULL AND seq <= ?2",
        params![agora_ms(), ultima],
    )
    .map_err(|e| e.to_string())?;

    Ok(ops.len())
}

// --- recepção ----------------------------------------------------------------

#[derive(Serialize, Default, Debug)]
pub struct Recebimento {
    pub aplicadas: usize,
    pub ignoradas: usize,
    pub conflitos: usize,
}

/// Cursor único, guardado sob a origem `servidor`: a sequência do Supabase já
/// ordena o que veio de todas as máquinas, então um cursor por origem aqui não
/// acrescentaria nada.
const ORIGEM: &str = "servidor";

fn cursor_de(conn: &rusqlite::Connection) -> i64 {
    conn.query_row(
        "SELECT ate_seq FROM sync_cursores WHERE origem = ?1",
        params![ORIGEM],
        |r| r.get(0),
    )
    .unwrap_or(0)
}

/// Busca em páginas até esgotar. Fila grande acumulada é um dos casos que §12
/// manda cobrir, e baixar tudo de uma vez seria o jeito de ele falhar.
pub async fn receber(
    db: &Db,
    cfg: &crate::supabase::Config,
    token: &str,
) -> Result<Recebimento, String> {
    let mut r = Recebimento::default();
    let device = db.device_id.clone();
    const PAGINA: usize = 200;

    loop {
        let desde = {
            let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
            cursor_de(&conn)
        };

        let pagina = crate::supabase::receber_ops(cfg, token, &device, desde, PAGINA).await?;
        if pagina.is_empty() {
            break;
        }

        let mut maior = desde;
        for bruto in &pagina {
            let Ok(op) = serde_json::from_value::<Operacao>(bruto.clone()) else {
                continue;
            };
            maior = maior.max(op.seq);
            match aplicar(db, &op, &op.device_id) {
                Ok(Aplicacao::Aplicada) => r.aplicadas += 1,
                Ok(Aplicacao::Ignorada) => r.ignoradas += 1,
                Ok(Aplicacao::Conflito) => r.conflitos += 1,
                // Operação que não aplica — coluna que esta versão não tem,
                // chave estrangeira para registro que ainda não chegou — vai
                // para a área de recuperação, e a leitura segue. Antes o erro
                // subia antes de o cursor avançar, e a mesma página voltava a
                // cada sincronização, para sempre.
                Err(e) => {
                    quarentena(db, &op, &format!("não aplicável: {e}"))?;
                    r.conflitos += 1;
                }
            }
        }

        // O cursor avança por página, não no fim de tudo: se a rede cair no
        // meio, o que já foi aplicado não é reprocessado.
        {
            let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
            conn.execute(
                "INSERT INTO sync_cursores (origem, ate_seq, lido_em) VALUES (?1, ?2, ?3)
                 ON CONFLICT(origem) DO UPDATE SET ate_seq = excluded.ate_seq,
                                                   lido_em = excluded.lido_em",
                params![ORIGEM, maior, agora_ms()],
            )
            .map_err(|e| e.to_string())?;
        }

        if pagina.len() < PAGINA {
            break;
        }
    }

    reaplicar_quarentena(db, &mut r)?;
    Ok(r)
}

/// Tenta de novo o que ficou na quarentena por não aplicar.
///
/// O caso que motivou: a ordem do servidor é a ordem de **envio**, não a de
/// dependência. Registros criados antes da fila existir só entram nela depois
/// (migração 014), então uma máquina nova recebe as tarefas antes do curso a
/// que elas apontam — a chave estrangeira recusa, e a tarefa vai para a
/// quarentena. Quando o curso chega, na mesma rodada ou numa seguinte, ela
/// passa a aplicar.
///
/// A regra de versões continua valendo: a operação passa por `aplicar`, não
/// por `escrever_registro`. O que ainda não aplica fica onde estava, com o
/// motivo original — sem conflito novo a cada rodada.
fn reaplicar_quarentena(db: &Db, r: &mut Recebimento) -> Result<(), String> {
    let pendentes: Vec<(String, String, String, String, String)> = {
        let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
        let mut stmt = conn
            .prepare(
                "SELECT id, entidade, registro_id, payload_remoto, origem
                   FROM sync_conflitos
                  WHERE resolvido_em IS NULL AND motivo LIKE 'não aplicável:%'
                  ORDER BY criado_em",
            )
            .map_err(|e| e.to_string())?;
        let v = stmt
            .query_map([], |l| Ok((l.get(0)?, l.get(1)?, l.get(2)?, l.get(3)?, l.get(4)?)))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        v
    };

    for (conflito_id, entidade, registro_id, payload, origem) in pendentes {
        let Ok(payload) = serde_json::from_str::<serde_json::Value>(&payload) else {
            continue;
        };
        let op = Operacao {
            seq: 0,
            id: String::new(),
            version: payload.get("version").and_then(|v| v.as_i64()).unwrap_or(0),
            entidade,
            registro_id,
            device_id: origem.clone(),
            payload,
            criada_em: 0,
        };
        let resolucao = match aplicar(db, &op, &origem) {
            Ok(Aplicacao::Aplicada) => {
                r.aplicadas += 1;
                r.conflitos = r.conflitos.saturating_sub(1);
                "reaplicada"
            }
            Ok(Aplicacao::Ignorada) => "superada",
            // Virou conflito de verdade: `aplicar` já registrou um novo, com o
            // motivo certo. Este sai para não aparecer duas vezes.
            Ok(Aplicacao::Conflito) => "substituida",
            Err(_) => continue,
        };
        let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
        conn.execute(
            "UPDATE sync_conflitos SET resolvido_em = ?2, resolucao = ?3 WHERE id = ?1",
            params![conflito_id, agora_ms(), resolucao],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Guarda na área de recuperação uma operação que não pôde ser aplicada, com o
/// erro como motivo. Resolver com "usar a de lá" tenta aplicar de novo — e
/// falha de novo enquanto a causa existir, agora com o erro na tela.
fn quarentena(db: &Db, op: &Operacao, motivo: &str) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
    registrar_conflito(&conn, op, &op.device_id, motivo)
}

enum Aplicacao {
    Aplicada,
    Ignorada,
    Conflito,
}

/// Regras de conflito da §7, em um lugar só.
fn aplicar(db: &Db, op: &Operacao, origem: &str) -> Result<Aplicacao, String> {
    if !ENTIDADES.contains(&op.entidade.as_str()) {
        return Ok(Aplicacao::Ignorada);
    }

    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;

    let local: Option<(i64, i64, Option<i64>)> = conn
        .query_row(
            &format!(
                "SELECT version, updated_at, deleted_at FROM {} WHERE id = ?1",
                op.entidade
            ),
            params![op.registro_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .ok();

    let remoto_apaga = op
        .payload
        .get("deleted_at")
        .map(|v| !v.is_null())
        .unwrap_or(false);
    let remoto_atualizado: i64 = op
        .payload
        .get("updated_at")
        .and_then(|v| v.as_i64())
        .unwrap_or(0);

    match local {
        // Registro que ainda não existe aqui: entra direto. É o caso comum.
        None => {
            escrever_registro(&conn, op)?;
            Ok(Aplicacao::Aplicada)
        }

        Some((v_local, atualizado_local, apagado_local)) => {
            if op.version < v_local {
                // Estamos à frente: a operação é eco de algo já superado.
                return Ok(Aplicacao::Ignorada);
            }

            if op.version == v_local {
                // Mesma versão: ou é a mesma coisa (reenvio, e aí não fazemos
                // nada), ou as duas máquinas editaram a partir da mesma base —
                // que é a "edição concorrente real" que §7 manda não resolver
                // sozinho.
                let igual = registro_igual(&conn, op)?;
                if igual {
                    return Ok(Aplicacao::Ignorada);
                }
                // Registro que nunca entrou na fila daqui não tem edição local
                // a proteger: é linha semeada, igual em toda máquina a menos de
                // device_id e datas. Tratar como edição concorrente punha cada
                // categoria padrão em conflito no primeiro login de uma máquina
                // nova (D-043). A de fora vale.
                let editado_aqui: bool = conn
                    .query_row(
                        "SELECT EXISTS (SELECT 1 FROM sync_operations
                                         WHERE entidade = ?1 AND registro_id = ?2)",
                        params![op.entidade, op.registro_id],
                        |r| r.get(0),
                    )
                    .unwrap_or(true);
                if !editado_aqui {
                    escrever_registro(&conn, op)?;
                    return Ok(Aplicacao::Aplicada);
                }
                registrar_conflito(&conn, op, origem, "edição concorrente")?;
                return Ok(Aplicacao::Conflito);
            }

            // Versão remota maior. Antes de aplicar, o caso que §7 destaca:
            // exclusão contra edição. Apagar aqui um registro que foi editado
            // depois, do lado de cá, perderia trabalho — então vira conflito e
            // a edição local fica de pé.
            if remoto_apaga && apagado_local.is_none() && atualizado_local > remoto_atualizado {
                registrar_conflito(&conn, op, origem, "exclusão remota contra edição local")?;
                return Ok(Aplicacao::Conflito);
            }

            // Nota é texto: sobrescrever perde escrita. Mesmo com versão maior,
            // se o conteúdo local divergiu, as duas versões são preservadas.
            if op.entidade == "notes" && !registro_igual(&conn, op)? && atualizado_local > remoto_atualizado
            {
                registrar_conflito(&conn, op, origem, "nota editada nos dois lados")?;
                return Ok(Aplicacao::Conflito);
            }

            escrever_registro(&conn, op)?;
            Ok(Aplicacao::Aplicada)
        }
    }
}

/// Onde ficam as tags de cada entidade que as tem.
fn tabela_de_tags(entidade: &str) -> Option<(&'static str, &'static str)> {
    match entidade {
        "notes" => Some(("note_tags", "note_id")),
        "courses" => Some(("course_tags", "course_id")),
        _ => None,
    }
}

/// Compara o registro local com o payload remoto campo a campo.
fn registro_igual(conn: &rusqlite::Connection, op: &Operacao) -> Result<bool, String> {
    let Some(obj) = op.payload.as_object() else {
        return Ok(false);
    };
    let campos: Vec<&String> = obj.keys().filter(|k| *k != "tags").collect();
    let lista = campos
        .iter()
        .map(|c| format!("'{c}', \"{c}\""))
        .collect::<Vec<_>>()
        .join(", ");

    let atual: Option<String> = conn
        .query_row(
            &format!(
                "SELECT json_object({lista}) FROM {} WHERE id = ?1",
                op.entidade
            ),
            params![op.registro_id],
            |r| r.get(0),
        )
        .ok();

    let Some(atual) = atual else { return Ok(false) };
    let atual: serde_json::Value = serde_json::from_str(&atual).unwrap_or_default();

    for c in campos {
        if atual.get(c) != obj.get(c) {
            return Ok(false);
        }
    }
    Ok(true)
}

/// Grava o registro vindo de fora, com os gatilhos desligados.
///
/// Sem o interruptor, a escrita viraria operação nova, voltaria para a outra
/// máquina e as duas ficariam trocando a mesma mudança para sempre.
fn escrever_registro(conn: &rusqlite::Connection, op: &Operacao) -> Result<(), String> {
    let Some(obj) = op.payload.as_object() else {
        return Err("operação sem corpo".into());
    };

    conn.execute("UPDATE sync_estado SET aplicando = 1 WHERE unico = 1", [])
        .map_err(|e| e.to_string())?;

    let resultado = (|| -> Result<(), String> {
        let campos: Vec<&String> = obj.keys().filter(|k| *k != "tags").collect();
        let colunas = campos
            .iter()
            .map(|c| format!("\"{c}\""))
            .collect::<Vec<_>>()
            .join(", ");
        let marcas = (1..=campos.len())
            .map(|i| format!("?{i}"))
            .collect::<Vec<_>>()
            .join(", ");

        let valores: Vec<rusqlite::types::Value> = campos
            .iter()
            .map(|c| match obj.get(*c) {
                Some(serde_json::Value::Null) | None => rusqlite::types::Value::Null,
                Some(serde_json::Value::Bool(b)) => rusqlite::types::Value::Integer(*b as i64),
                Some(serde_json::Value::Number(n)) => n
                    .as_i64()
                    .map(rusqlite::types::Value::Integer)
                    .or_else(|| n.as_f64().map(rusqlite::types::Value::Real))
                    .unwrap_or(rusqlite::types::Value::Null),
                Some(serde_json::Value::String(s)) => rusqlite::types::Value::Text(s.clone()),
                Some(outro) => rusqlite::types::Value::Text(outro.to_string()),
            })
            .collect();

        // `ON CONFLICT DO UPDATE` e não `INSERT OR REPLACE`.
        //
        // REPLACE apaga a linha e insere outra, o que zera qualquer coluna que
        // não esteja no payload — e existem colunas locais de propósito, como
        // a capa do curso, que não viaja para não arrastar centenas de
        // kilobytes por operação. Com DO UPDATE, só as colunas que vieram são
        // tocadas.
        let atribuicoes = campos
            .iter()
            .filter(|c| **c != "id")
            .map(|c| format!("\"{c}\" = excluded.\"{c}\""))
            .collect::<Vec<_>>()
            .join(", ");

        conn.execute(
            &format!(
                "INSERT INTO {} ({colunas}) VALUES ({marcas})
                 ON CONFLICT(id) DO UPDATE SET {atribuicoes}",
                op.entidade
            ),
            rusqlite::params_from_iter(valores.iter()),
        )
        .map_err(|e| e.to_string())?;

        // Tags moram em tabela filha e viajam dentro do payload. A lista fica
        // aqui e não espalhada em ifs: quem criar a próxima entidade com tags
        // acrescenta uma linha, em vez de descobrir semanas depois que elas
        // saíam desta máquina e não entravam na outra.
        if let Some((filha, chave)) = tabela_de_tags(&op.entidade) {
            if let Some(tags) = op.payload.get("tags").and_then(|t| t.as_array()) {
                conn.execute(
                    &format!("DELETE FROM {filha} WHERE {chave} = ?1"),
                    params![op.registro_id],
                )
                .map_err(|e| e.to_string())?;
                for t in tags.iter().filter_map(|t| t.as_str()) {
                    conn.execute(
                        &format!("INSERT OR IGNORE INTO {filha} ({chave}, tag) VALUES (?1, ?2)"),
                        params![op.registro_id, t],
                    )
                    .map_err(|e| e.to_string())?;
                }
            }
        }
        Ok(())
    })();

    // O interruptor volta mesmo se a escrita falhar: deixá-lo ligado faria a
    // próxima alteração do usuário não entrar na fila, e isso é pior que o erro
    // que causou a falha.
    let _ = conn.execute("UPDATE sync_estado SET aplicando = 0 WHERE unico = 1", []);
    resultado
}

fn registrar_conflito(
    conn: &rusqlite::Connection,
    op: &Operacao,
    origem: &str,
    motivo: &str,
) -> Result<(), String> {
    let local: String = conn
        .query_row(
            &format!(
                "SELECT json_object('id', id, 'version', version, 'updated_at', updated_at)
                   FROM {} WHERE id = ?1",
                op.entidade
            ),
            params![op.registro_id],
            |r| r.get(0),
        )
        .unwrap_or_else(|_| "{}".into());

    conn.execute(
        "INSERT INTO sync_conflitos
           (id, entidade, registro_id, motivo, payload_remoto, payload_local, origem, criado_em)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            uuid::Uuid::new_v4().to_string(),
            op.entidade,
            op.registro_id,
            motivo,
            op.payload.to_string(),
            local,
            origem,
            agora_ms()
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// --- comandos ----------------------------------------------------------------

#[derive(Serialize, Debug)]
pub struct ResultadoSync {
    pub enviadas: usize,
    pub recebimento: Recebimento,
    pub erro: Option<String>,
}

/// Uma rodada completa: recebe, depois envia.
///
/// Uma de cada vez. O motor do tempo real e o botão podem pedir juntos, e duas
/// rodadas simultâneas leriam o mesmo cursor e enviariam a mesma fila — o
/// resultado seria correto (tudo é idempotente), mas em dobro. A trava é
/// assíncrona porque a rodada espera a rede segurando-a.
pub async fn rodar(db: &Db) -> ResultadoSync {
    static TRAVA: std::sync::OnceLock<tokio::sync::Mutex<()>> = std::sync::OnceLock::new();
    let _vez = TRAVA.get_or_init(|| tokio::sync::Mutex::new(())).lock().await;

    let mut r = ResultadoSync {
        enviadas: 0,
        recebimento: Recebimento::default(),
        erro: None,
    };

    let cfg = crate::supabase::config_de(db);
    let token = match crate::supabase::token_de_acesso(&cfg).await {
        Ok(t) => t,
        Err(e) => {
            r.erro = Some(e);
            return r;
        }
    };

    // Recebe antes de enviar: aplicar o que veio primeiro reduz a chance de
    // mandar uma versão que já nasceu superada.
    match receber(db, &cfg, &token).await {
        Ok(rec) => r.recebimento = rec,
        Err(e) => {
            r.erro = Some(e);
            return r;
        }
    }
    match enviar(db, &cfg, &token).await {
        Ok(n) => r.enviadas = n,
        Err(e) => r.erro = Some(e),
    }
    r
}

#[tauri::command]
pub async fn sync_agora(db: tauri::State<'_, Db>) -> Result<ResultadoSync, String> {
    Ok(rodar(&db).await)
}

/// Operações locais esperando envio. É o que o motor do tempo real olha para
/// saber que houve escrita — a fila é preenchida por gatilho, então este
/// número muda com qualquer escrita, de qualquer módulo, sem aviso explícito.
pub fn na_fila(db: &Db) -> i64 {
    db.conn
        .lock()
        .ok()
        .and_then(|c| {
            c.query_row(
                "SELECT count(*) FROM sync_operations WHERE enviada_em IS NULL",
                [],
                |r| r.get(0),
            )
            .ok()
        })
        .unwrap_or(0)
}

#[derive(Serialize)]
pub struct Pendencias {
    pub na_fila: i64,
    pub conflitos: i64,
    pub ultima_leitura: Option<i64>,
}

#[tauri::command]
pub fn sync_pendencias(db: tauri::State<Db>) -> Result<Pendencias, String> {
    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
    Ok(Pendencias {
        na_fila: conn
            .query_row(
                "SELECT count(*) FROM sync_operations WHERE enviada_em IS NULL",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0),
        conflitos: conn
            .query_row(
                "SELECT count(*) FROM sync_conflitos WHERE resolvido_em IS NULL",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0),
        ultima_leitura: conn
            .query_row("SELECT max(lido_em) FROM sync_cursores", [], |r| r.get(0))
            .ok()
            .flatten(),
    })
}

#[derive(Serialize)]
pub struct ConflitoView {
    pub id: String,
    pub entidade: String,
    pub registro_id: String,
    pub motivo: String,
    pub origem: String,
    pub criado_em: i64,
    pub payload_remoto: String,
}

#[tauri::command]
pub fn sync_conflitos(db: tauri::State<Db>) -> Result<Vec<ConflitoView>, String> {
    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
    let mut stmt = conn
        .prepare(
            "SELECT id, entidade, registro_id, motivo, origem, criado_em, payload_remoto
               FROM sync_conflitos WHERE resolvido_em IS NULL
              ORDER BY criado_em DESC LIMIT 100",
        )
        .map_err(|e| e.to_string())?;
    let v = stmt
        .query_map([], |r| {
            Ok(ConflitoView {
                id: r.get(0)?,
                entidade: r.get(1)?,
                registro_id: r.get(2)?,
                motivo: r.get(3)?,
                origem: r.get(4)?,
                criado_em: r.get(5)?,
                payload_remoto: r.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(v)
}

/// `manter_local` descarta a versão remota; `usar_remoto` aplica o que veio.
/// Em nenhum dos dois o dado some: o payload remoto continua no conflito
/// resolvido, que é a área de recuperação de §7.
#[tauri::command]
pub fn sync_resolver(db: tauri::State<Db>, id: String, escolha: String) -> Result<(), String> {
    if !matches!(escolha.as_str(), "manter_local" | "usar_remoto") {
        return Err("escolha inválida".into());
    }
    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;

    if escolha == "usar_remoto" {
        let (entidade, registro_id, payload): (String, String, String) = conn
            .query_row(
                "SELECT entidade, registro_id, payload_remoto FROM sync_conflitos WHERE id = ?1",
                params![id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .map_err(|e| e.to_string())?;

        let op = Operacao {
            seq: 0,
            id: String::new(),
            entidade,
            registro_id,
            version: 0,
            device_id: String::new(),
            payload: serde_json::from_str(&payload).map_err(|e| e.to_string())?,
            criada_em: 0,
        };
        escrever_registro(&conn, &op)?;
    }

    conn.execute(
        "UPDATE sync_conflitos SET resolvido_em = ?2, resolucao = ?3 WHERE id = ?1",
        params![id, agora_ms(), escolha],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
