//! Transporte de sincronização: Supabase, um projeto por pessoa (D-024).
//!
//! Cada usuário cria o próprio projeto e cola aqui a URL e a chave `anon`.
//! Isso remove o problema mais caro de um serviço compartilhado — não existe
//! banco de terceiros com dados de estudo de várias pessoas, e não há nada meu
//! para invadir.
//!
//! ## Onde cada segredo mora, e por quê
//!
//! * **chave `anon`**: fica no banco local, em texto. É pública por desenho no
//!   Supabase — quem protege as linhas é a política de acesso por usuário, não
//!   o sigilo dessa chave. Escondê-la daria falsa sensação de segurança.
//! * **token de renovação**: vai para o **cofre de credenciais do sistema**
//!   (Gerenciador de Credenciais no Windows, keyring no Linux). §3.1 do plano
//!   exige exatamente isso, e é o que impede que uma cópia do arquivo do banco
//!   entregue a sessão junto.
//! * **senha**: nunca é guardada, em lugar nenhum. Ela vai uma vez para o
//!   Supabase e o app esquece.

use crate::db::Db;
use rusqlite::params;
use serde::{Deserialize, Serialize};

const SERVICO_COFRE: &str = "estudos-app";

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct Config {
    pub url: Option<String>,
    /// Pública por desenho: a proteção real é a política de acesso por linha.
    pub anon_key: Option<String>,
    pub email: Option<String>,
}

pub fn config_de(db: &Db) -> Config {
    db.conn
        .lock()
        .ok()
        .and_then(|c| {
            c.query_row(
                "SELECT valor FROM settings WHERE chave = 'supabase_config'",
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
        "INSERT INTO settings (chave, valor) VALUES ('supabase_config', ?1)
         ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor",
        params![serde_json::to_string(c).map_err(|e| e.to_string())?],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// --- cofre de credenciais ----------------------------------------------------

fn cofre(email: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICO_COFRE, email).map_err(|e| format!("cofre indisponível: {e}"))
}

fn guardar_refresh(email: &str, token: &str) -> Result<(), String> {
    cofre(email)?
        .set_password(token)
        .map_err(|e| format!("não consegui guardar no cofre: {e}"))
}

fn ler_refresh(email: &str) -> Option<String> {
    cofre(email).ok()?.get_password().ok()
}

fn apagar_refresh(email: &str) {
    if let Ok(c) = cofre(email) {
        let _ = c.delete_credential();
    }
}

// --- autenticação ------------------------------------------------------------

#[derive(Deserialize)]
struct RespostaAuth {
    access_token: String,
    refresh_token: String,
}

#[derive(Deserialize)]
struct ErroSupabase {
    #[serde(alias = "error_description", alias = "msg", alias = "message")]
    mensagem: Option<String>,
}

async fn erro_legivel(r: reqwest::Response) -> String {
    let status = r.status();
    let texto = r.text().await.unwrap_or_default();
    serde_json::from_str::<ErroSupabase>(&texto)
        .ok()
        .and_then(|e| e.mensagem)
        .unwrap_or_else(|| format!("Supabase respondeu {status}"))
}

async fn autenticar(
    cfg: &Config,
    caminho: &str,
    corpo: serde_json::Value,
) -> Result<RespostaAuth, String> {
    let (url, key) = match (cfg.url.as_ref(), cfg.anon_key.as_ref()) {
        (Some(u), Some(k)) if !u.is_empty() && !k.is_empty() => (u, k),
        _ => return Err("configure a URL e a chave anon do seu projeto".into()),
    };

    let r = reqwest::Client::new()
        .post(format!("{}/auth/v1/{caminho}", url.trim_end_matches('/')))
        .header("apikey", key)
        .header("Content-Type", "application/json")
        .json(&corpo)
        .send()
        .await
        .map_err(|e| format!("não consegui falar com o Supabase: {e}"))?;

    if !r.status().is_success() {
        return Err(erro_legivel(r).await);
    }
    r.json::<RespostaAuth>()
        .await
        .map_err(|e| format!("resposta inesperada do Supabase: {e}"))
}

#[tauri::command]
pub async fn supabase_salvar_config(
    db: tauri::State<'_, Db>,
    url: String,
    anon_key: String,
) -> Result<(), String> {
    let mut cfg = config_de(&db);
    cfg.url = Some(url.trim().trim_end_matches('/').to_string());
    cfg.anon_key = Some(anon_key.trim().to_string());
    gravar_config(&db, &cfg)
}

/// Entrar ou criar conta. A senha é usada uma vez e descartada; só o token de
/// renovação sobrevive, e no cofre do sistema.
#[tauri::command]
pub async fn supabase_entrar(
    db: tauri::State<'_, Db>,
    email: String,
    senha: String,
    criar: bool,
) -> Result<(), String> {
    let cfg = config_de(&db);
    let email = email.trim().to_lowercase();
    let caminho = if criar { "signup" } else { "token?grant_type=password" };
    let corpo = serde_json::json!({ "email": email, "password": senha });

    let r = autenticar(&cfg, caminho, corpo).await?;

    // Projeto com confirmação de e-mail ligada devolve signup sem sessão.
    if r.refresh_token.is_empty() {
        return Err("conta criada — confirme o e-mail e entre em seguida".into());
    }

    guardar_refresh(&email, &r.refresh_token)?;
    let mut cfg = cfg;
    cfg.email = Some(email);
    gravar_config(&db, &cfg)
}

#[tauri::command]
pub async fn supabase_sair(db: tauri::State<'_, Db>) -> Result<(), String> {
    let mut cfg = config_de(&db);
    if let Some(e) = cfg.email.clone() {
        apagar_refresh(&e);
    }
    cfg.email = None;
    gravar_config(&db, &cfg)
}

/// Token de acesso fresco, trocando o de renovação. Não é guardado: vale
/// minutos, e mantê-lo em memória entre sincronizações não compraria nada.
pub async fn token_de_acesso(cfg: &Config) -> Result<String, String> {
    let email = cfg
        .email
        .as_ref()
        .ok_or("você não está conectado ao Supabase")?;
    let refresh = ler_refresh(email).ok_or("sessão não encontrada no cofre; entre de novo")?;

    let r = autenticar(
        cfg,
        "token?grant_type=refresh_token",
        serde_json::json!({ "refresh_token": refresh }),
    )
    .await?;

    // O Supabase rotaciona o refresh a cada uso: guardar o novo é obrigatório,
    // senão a próxima sincronização encontra um token já queimado.
    guardar_refresh(email, &r.refresh_token)?;
    Ok(r.access_token)
}

#[derive(Serialize)]
pub struct Estado {
    pub configurado: bool,
    pub conectado: bool,
    pub email: Option<String>,
}

#[tauri::command]
pub fn supabase_estado(db: tauri::State<Db>) -> Estado {
    let cfg = config_de(&db);
    let conectado = cfg
        .email
        .as_ref()
        .map(|e| ler_refresh(e).is_some())
        .unwrap_or(false);
    Estado {
        configurado: cfg.url.is_some() && cfg.anon_key.is_some(),
        conectado,
        email: cfg.email,
    }
}

// --- transporte das operações ------------------------------------------------

fn base(cfg: &Config) -> Result<(String, String), String> {
    match (cfg.url.as_ref(), cfg.anon_key.as_ref()) {
        (Some(u), Some(k)) if !u.is_empty() && !k.is_empty() => {
            Ok((u.trim_end_matches('/').to_string(), k.clone()))
        }
        _ => Err("configure a URL e a chave anon do seu projeto".into()),
    }
}

/// Envia operações. `Prefer: resolution=ignore-duplicates` é o que torna o
/// reenvio inofensivo: a chave primária é o id da operação, então a segunda
/// tentativa não duplica nada — a idempotência de §7, do lado do servidor.
pub async fn enviar_ops(
    cfg: &Config,
    token: &str,
    ops: &[serde_json::Value],
) -> Result<(), String> {
    if ops.is_empty() {
        return Ok(());
    }
    let (url, key) = base(cfg)?;
    let r = reqwest::Client::new()
        .post(format!("{url}/rest/v1/sync_operations"))
        .header("apikey", &key)
        .header("Authorization", format!("Bearer {token}"))
        .header("Content-Type", "application/json")
        .header("Prefer", "resolution=ignore-duplicates,return=minimal")
        .json(&ops)
        .send()
        .await
        .map_err(|e| format!("envio falhou: {e}"))?;

    if r.status().is_success() {
        Ok(())
    } else {
        Err(erro_legivel(r).await)
    }
}

/// Traz o que as outras máquinas mandaram desde o cursor.
///
/// O filtro por `device_id` diferente do nosso é feito **no servidor**: sem
/// ele, cada máquina baixaria de volta tudo o que acabou de enviar.
pub async fn receber_ops(
    cfg: &Config,
    token: &str,
    device_id: &str,
    desde: i64,
    limite: usize,
) -> Result<Vec<serde_json::Value>, String> {
    let (url, key) = base(cfg)?;
    let alvo = format!(
        "{url}/rest/v1/sync_operations?seq=gt.{desde}&device_id=neq.{device_id}\
         &order=seq.asc&limit={limite}"
    );

    let r = reqwest::Client::new()
        .get(alvo)
        .header("apikey", &key)
        .header("Authorization", format!("Bearer {token}"))
        .send()
        .await
        .map_err(|e| format!("leitura falhou: {e}"))?;

    if !r.status().is_success() {
        return Err(erro_legivel(r).await);
    }
    r.json::<Vec<serde_json::Value>>()
        .await
        .map_err(|e| format!("resposta inesperada: {e}"))
}

/// SQL que o usuário roda uma vez no próprio projeto.
///
/// Fica no código, e não só na documentação, para a tela poder mostrá-lo — e
/// para ele nunca divergir do que o cliente espera encontrar.
pub const SQL_ESQUEMA: &str = r#"-- Rode uma vez no SQL Editor do seu projeto Supabase.

create table if not exists public.sync_operations (
  seq         bigserial primary key,
  -- Id da operação, gerado na máquina de origem. É a chave da idempotência:
  -- reenviar a mesma operação não pode criar uma linha nova.
  id          uuid not null unique,
  user_id     uuid not null default auth.uid() references auth.users(id),
  device_id   text not null,
  entidade    text not null,
  registro_id text not null,
  version     bigint not null,
  payload     jsonb not null,
  criada_em   bigint not null,
  recebida_em timestamptz not null default now()
);

create index if not exists idx_ops_usuario_seq
  on public.sync_operations (user_id, seq);

alter table public.sync_operations enable row level security;

-- Cada pessoa só enxerga e só grava as próprias linhas. Esta é a proteção
-- real do projeto: a chave anon é pública por desenho.
create policy "dono le" on public.sync_operations
  for select using (auth.uid() = user_id);

create policy "dono grava" on public.sync_operations
  for insert with check (auth.uid() = user_id);
"#;

#[tauri::command]
pub fn supabase_sql() -> &'static str {
    SQL_ESQUEMA
}
