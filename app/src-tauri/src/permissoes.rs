//! Quem pode o quê pela ponte, e o registro do que foi feito (§4.2).
//!
//! Dois tokens distintos, não um. Não é preciosismo: eles são revogáveis
//! separadamente e têm alcances diferentes. Se o token da extensão vazar num
//! backup do perfil do Chrome, revogá-lo não pode derrubar a integração com o
//! Claude Desktop — e vice-versa.
//!
//! Leitura e escrita também são permissões separadas, como o plano exige, e a
//! escrita **nasce desligada**. Um servidor MCP recém-instalado que já pode
//! criar e apagar coisas é a configuração errada por padrão.

use crate::db::{agora_ms, Db};
use rusqlite::params;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Debug)]
pub enum Origem {
    Extensao,
    Mcp,
}

impl Origem {
    pub fn nome(self) -> &'static str {
        match self {
            Origem::Extensao => "extensao",
            Origem::Mcp => "mcp",
        }
    }
}

/// Ferramentas de escrita, cada uma desligável sozinha — §4.2 pede que "o
/// usuário possa desativar ferramentas individualmente".
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Ferramentas {
    pub criar_tarefa: bool,
    pub concluir_tarefa: bool,
    pub criar_nota: bool,
    pub controlar_cronometro: bool,
}

impl Default for Ferramentas {
    fn default() -> Self {
        // Todas verdadeiras, mas isso só importa se `escrita` estiver ligada:
        // a permissão geral é a que manda, e ela nasce falsa.
        Self {
            criar_tarefa: true,
            concluir_tarefa: true,
            criar_nota: true,
            controlar_cronometro: true,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ConfigMcp {
    pub habilitado: bool,
    pub leitura: bool,
    pub escrita: bool,
    pub ferramentas: Ferramentas,
}

impl Default for ConfigMcp {
    fn default() -> Self {
        Self {
            habilitado: false,
            leitura: true,
            escrita: false,
            ferramentas: Ferramentas::default(),
        }
    }
}

pub fn config_mcp(db: &Db) -> ConfigMcp {
    db.conn
        .lock()
        .ok()
        .and_then(|c| {
            c.query_row(
                "SELECT valor FROM settings WHERE chave = 'mcp_config'",
                [],
                |r| r.get::<_, String>(0),
            )
            .ok()
        })
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

/// Token dedicado ao MCP. Gerado sob demanda e trocável sem tocar no da
/// extensão — é o "revogar imediatamente a integração" de §12.
pub fn token_mcp(conn: &rusqlite::Connection) -> rusqlite::Result<String> {
    if let Ok(v) = conn.query_row(
        "SELECT valor FROM settings WHERE chave = 'mcp_token'",
        [],
        |r| r.get::<_, String>(0),
    ) {
        return Ok(v);
    }
    let novo = uuid::Uuid::new_v4().to_string().replace('-', "");
    conn.execute(
        "INSERT INTO settings (chave, valor) VALUES ('mcp_token', ?1)",
        params![novo],
    )?;
    Ok(novo)
}

/// Registra o que passou pela ponte. Chamado depois da decisão, com o
/// resultado real — inclusive quando foi recusado, que é justamente o caso que
/// interessa investigar depois.
pub fn auditar(db: &Db, origem: Origem, acao: &str, detalhe: &serde_json::Value, resultado: &str) {
    let Ok(conn) = db.conn.lock() else { return };
    // Corta o corpo: auditoria é rastro, não cópia do conteúdo. Uma nota
    // inteira no log de auditoria seria vazamento por outro caminho.
    let texto = serde_json::to_string(detalhe).unwrap_or_default();
    let curto: String = texto.chars().take(400).collect();
    let _ = conn.execute(
        "INSERT INTO audit_events (id, origem, acao, detalhe, resultado, device_id, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            uuid::Uuid::new_v4().to_string(),
            origem.nome(),
            acao,
            curto,
            resultado,
            db.device_id,
            agora_ms()
        ],
    );
}

#[derive(Serialize)]
pub struct EventoAuditoria {
    pub id: String,
    pub origem: String,
    pub acao: String,
    pub detalhe: Option<String>,
    pub resultado: String,
    pub created_at: i64,
}

#[tauri::command]
pub fn listar_auditoria(db: tauri::State<Db>) -> Result<Vec<EventoAuditoria>, String> {
    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
    let mut stmt = conn
        .prepare(
            "SELECT id, origem, acao, detalhe, resultado, created_at
               FROM audit_events ORDER BY created_at DESC LIMIT 100",
        )
        .map_err(|e| e.to_string())?;
    let v = stmt
        .query_map([], |r| {
            Ok(EventoAuditoria {
                id: r.get(0)?,
                origem: r.get(1)?,
                acao: r.get(2)?,
                detalhe: r.get(3)?,
                resultado: r.get(4)?,
                created_at: r.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(v)
}

#[derive(Serialize)]
pub struct InfoMcp {
    pub porta: u16,
    pub token: String,
    pub config: ConfigMcp,
}

#[tauri::command]
pub fn mcp_info(db: tauri::State<Db>, ponte: tauri::State<crate::bridge::Ponte>) -> Result<InfoMcp, String> {
    let token = {
        let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
        token_mcp(&conn).map_err(|e| e.to_string())?
    };
    Ok(InfoMcp {
        porta: ponte.porta,
        token,
        config: config_mcp(&db),
    })
}

#[tauri::command]
pub fn mcp_salvar_config(db: tauri::State<Db>, config: ConfigMcp) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
    let s = serde_json::to_string(&config).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO settings (chave, valor) VALUES ('mcp_config', ?1)
         ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor",
        params![s],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Troca o token. É a revogação: o servidor MCP para de ser aceito na hora.
#[tauri::command]
pub fn mcp_revogar(db: tauri::State<Db>) -> Result<String, String> {
    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
    let novo = uuid::Uuid::new_v4().to_string().replace('-', "");
    conn.execute(
        "INSERT INTO settings (chave, valor) VALUES ('mcp_token', ?1)
         ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor",
        params![novo],
    )
    .map_err(|e| e.to_string())?;
    Ok(novo)
}
