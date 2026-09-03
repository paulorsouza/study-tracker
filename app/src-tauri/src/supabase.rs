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

#[cfg(desktop)]
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

#[cfg(desktop)]
fn cofre(email: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICO_COFRE, email).map_err(|e| format!("cofre indisponível: {e}"))
}

#[cfg(desktop)]
fn guardar_refresh(email: &str, token: &str) -> Result<(), String> {
    cofre(email)?
        .set_password(token)
        .map_err(|e| format!("não consegui guardar no cofre: {e}"))
}

#[cfg(desktop)]
fn ler_refresh(email: &str) -> Option<String> {
    cofre(email).ok()?.get_password().ok()
}

#[cfg(desktop)]
fn apagar_refresh(email: &str) {
    if let Ok(c) = cofre(email) {
        let _ = c.delete_credential();
    }
}

/// No Android o token de renovação vive **só em memória**, e some ao fechar.
///
/// O `keyring` não tem backend Android. As saídas seriam guardar o token no
/// banco — que é exatamente o que D-025 proíbe, porque uma cópia do arquivo
/// levaria a sessão junto — ou escrever uma ponte para o Keystore, que é
/// trabalho de verdade e ainda não foi feito.
///
/// Entre as duas, esta é a escolha honesta: **pedir login de novo** a cada
/// abertura. Menos cômodo, e nunca menos seguro. Quando o Keystore existir,
/// só estas três funções mudam.
#[cfg(mobile)]
static REFRESH_EM_MEMORIA: std::sync::Mutex<Option<(String, String)>> =
    std::sync::Mutex::new(None);

#[cfg(mobile)]
fn guardar_refresh(email: &str, token: &str) -> Result<(), String> {
    *REFRESH_EM_MEMORIA
        .lock()
        .map_err(|_| "cofre em memória ocupado")? = Some((email.to_string(), token.to_string()));
    Ok(())
}

#[cfg(mobile)]
fn ler_refresh(email: &str) -> Option<String> {
    let g = REFRESH_EM_MEMORIA.lock().ok()?;
    let (e, t) = g.as_ref()?;
    (e == email).then(|| t.clone())
}

#[cfg(mobile)]
fn apagar_refresh(_email: &str) {
    if let Ok(mut g) = REFRESH_EM_MEMORIA.lock() {
        *g = None;
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
-- `drop policy if exists` antes de cada `create`: o script precisa poder ser
-- rodado de novo sem erro, senão quem acrescentar uma política tem de editar o
-- que já rodou.
drop policy if exists "dono le" on public.sync_operations;
create policy "dono le" on public.sync_operations
  for select using (auth.uid() = user_id);

drop policy if exists "dono grava" on public.sync_operations;
create policy "dono grava" on public.sync_operations
  for insert with check (auth.uid() = user_id);

-- Sem esta, "apagar os dados da nuvem" falharia calado: a RLS recusaria o
-- delete e o PostgREST responderia sucesso com zero linhas afetadas.
drop policy if exists "dono apaga" on public.sync_operations;
create policy "dono apaga" on public.sync_operations
  for delete using (auth.uid() = user_id);
"#;

#[tauri::command]
pub fn supabase_sql() -> &'static str {
    SQL_ESQUEMA
}

// --- conta (§3.1) ------------------------------------------------------------

/// Pede ao Supabase o e-mail de redefinição de senha.
///
/// O app não recebe nem manipula a senha nova: o link do e-mail abre a página
/// do próprio Supabase. Trazer esse fluxo para dentro do app exigiria embutir a
/// troca de token do link, e não há ganho que pague guardar mais um segredo.
#[tauri::command]
pub async fn supabase_recuperar_senha(
    db: tauri::State<'_, Db>,
    email: String,
) -> Result<(), String> {
    let cfg = config_de(&db);
    let email = email.trim().to_lowercase();
    if email.is_empty() {
        return Err("informe o e-mail da conta".into());
    }
    let (url, key) = base(&cfg)?;

    let r = reqwest::Client::new()
        .post(format!("{url}/auth/v1/recover"))
        .header("apikey", &key)
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({ "email": email }))
        .send()
        .await
        .map_err(|e| format!("não consegui falar com o Supabase: {e}"))?;

    if !r.status().is_success() {
        return Err(erro_legivel(r).await);
    }
    Ok(())
}

/// Troca a senha de quem já está conectado.
///
/// A senha nova vai direto para o Supabase e não encosta em disco: nem em
/// `settings`, nem no cofre, nem em log. O que muda no cofre é só o token de
/// renovação, que o Supabase rotaciona sozinho na próxima sincronização.
#[tauri::command]
pub async fn supabase_trocar_senha(
    db: tauri::State<'_, Db>,
    nova: String,
) -> Result<(), String> {
    if nova.chars().count() < 8 {
        return Err("a senha precisa de pelo menos 8 caracteres".into());
    }
    let cfg = config_de(&db);
    let token = token_de_acesso(&cfg).await?;
    let (url, key) = base(&cfg)?;

    let r = reqwest::Client::new()
        .put(format!("{url}/auth/v1/user"))
        .header("apikey", &key)
        .header("Authorization", format!("Bearer {token}"))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({ "password": nova }))
        .send()
        .await
        .map_err(|e| format!("não consegui falar com o Supabase: {e}"))?;

    if !r.status().is_success() {
        return Err(erro_legivel(r).await);
    }
    Ok(())
}

/// Máquina que já sincronizou com esta conta.
#[derive(Serialize)]
pub struct Maquina {
    pub origem: String,
    pub lido_em: i64,
    pub esta_maquina: bool,
    /// Operações que esta máquina mandou e que já chegaram aqui.
    pub operacoes: i64,
}

/// As máquinas que sincronizaram, tiradas do que o app já sabe.
///
/// **Não são as sessões de autenticação.** Listar sessões do GoTrue exige a
/// chave `service_role`, que dá poder de administrador sobre o projeto inteiro
/// — guardá-la num app de desktop seria entregar o projeto a quem abrisse o
/// executável. O que dá para saber sem ela é o que interessa na prática: de
/// quais máquinas vieram dados.
#[tauri::command]
pub fn supabase_maquinas(db: tauri::State<Db>) -> Result<Vec<Maquina>, String> {
    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
    let mut stmt = conn
        .prepare(
            "SELECT c.origem, c.lido_em,
                    (SELECT count(*) FROM sync_operations o WHERE o.device_id = c.origem)
               FROM sync_cursores c
              ORDER BY c.lido_em DESC",
        )
        .map_err(|e| e.to_string())?;
    let mut v = stmt
        .query_map([], |r| {
            let origem: String = r.get(0)?;
            Ok(Maquina {
                esta_maquina: origem == db.device_id,
                origem,
                lido_em: r.get(1)?,
                operacoes: r.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    // Esta máquina entra mesmo sem cursor: no primeiro uso ela ainda não leu
    // nada de ninguém, e uma lista que não mostra o computador em que o usuário
    // está parece quebrada.
    if !v.iter().any(|m| m.esta_maquina) {
        v.insert(
            0,
            Maquina {
                origem: db.device_id.clone(),
                lido_em: 0,
                esta_maquina: true,
                operacoes: conn
                    .query_row(
                        "SELECT count(*) FROM sync_operations WHERE device_id = ?1",
                        params![db.device_id],
                        |r| r.get(0),
                    )
                    .unwrap_or(0),
            },
        );
    }
    Ok(v)
}

/// Encerra a sessão nas outras máquinas, mantendo esta conectada.
///
/// `scope=others` é do próprio GoTrue e não precisa de chave de administrador:
/// quem está autenticado pode derrubar as próprias sessões. As outras máquinas
/// pedem login na próxima sincronização; os dados locais delas continuam lá.
#[tauri::command]
pub async fn supabase_encerrar_outras(db: tauri::State<'_, Db>) -> Result<(), String> {
    let cfg = config_de(&db);
    let token = token_de_acesso(&cfg).await?;
    let (url, key) = base(&cfg)?;

    let r = reqwest::Client::new()
        .post(format!("{url}/auth/v1/logout?scope=others"))
        .header("apikey", &key)
        .header("Authorization", format!("Bearer {token}"))
        .header("Content-Length", "0")
        .send()
        .await
        .map_err(|e| format!("não consegui falar com o Supabase: {e}"))?;

    if !r.status().is_success() {
        return Err(erro_legivel(r).await);
    }
    Ok(())
}

/// Apaga do Supabase todas as operações desta conta.
///
/// A RLS limita o `delete` às linhas de `auth.uid()`, então isto não tem como
/// alcançar dados de outra pessoa mesmo que quisesse. O que fica **intacto** é
/// o banco local: apagar a nuvem não é apagar o histórico do usuário, e
/// confundir as duas coisas seria destruir dado que ninguém mandou destruir.
#[tauri::command]
pub async fn supabase_apagar_nuvem(db: tauri::State<'_, Db>) -> Result<u64, String> {
    let cfg = config_de(&db);
    let token = token_de_acesso(&cfg).await?;
    let (url, key) = base(&cfg)?;

    let r = reqwest::Client::new()
        .delete(format!("{url}/rest/v1/sync_operations?seq=gte.0"))
        .header("apikey", &key)
        .header("Authorization", format!("Bearer {token}"))
        .header("Prefer", "count=exact")
        .send()
        .await
        .map_err(|e| format!("não consegui falar com o Supabase: {e}"))?;

    if !r.status().is_success() {
        return Err(erro_legivel(r).await);
    }

    // `Content-Range: */12` é como o PostgREST devolve a contagem.
    let apagadas = r
        .headers()
        .get("content-range")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.rsplit('/').next().and_then(|n| n.parse().ok()))
        .unwrap_or(0);

    // Os cursores voltam ao zero: sem isto, a próxima leitura começaria de uma
    // posição que não existe mais e o app pensaria estar em dia.
    if let Ok(conn) = db.conn.lock() {
        let _ = conn.execute("DELETE FROM sync_cursores", []);
        let _ = conn.execute("UPDATE sync_operations SET enviada_em = NULL", []);
    }
    Ok(apagadas)
}
