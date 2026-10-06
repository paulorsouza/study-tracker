//! Arquivos das imagens pelo Supabase Storage (D-047, F2).
//!
//! A linha de `note_images` viaja pela fila de operações como qualquer
//! entidade; o arquivo vai à parte, num bucket privado `anexos` com uma pasta
//! por conta (`<uid>/<id>.<ext>`). As políticas do bucket estão em
//! `supabase::SQL_ESQUEMA` e só deixam cada conta ler e gravar a própria pasta.
//!
//! Dentro da rodada de sincronização, em dois tempos: o download logo depois
//! de receber (a linha recém-chegada é o que avisa que há arquivo) e o envio
//! **antes** de mandar as operações — assim a outra máquina, avisada pelo tempo
//! real, já encontra o arquivo lá. Erro aqui não derruba a rodada; o arquivo
//! tenta de novo na próxima.

use crate::db::{agora_ms, Db};
use crate::imagens::{arquivo, arquivo_mini, pasta};
use rusqlite::params;
use serde::Serialize;
use sha2::{Digest, Sha256};

const BUCKET: &str = "anexos";
/// Downloads por rodada. Um aparelho novo com centenas de imagens baixa aos
/// poucos em vez de prender a rodada inteira.
const BAIXAR_POR_RODADA: usize = 30;

#[derive(Serialize, Default, Debug)]
pub struct Transferencia {
    pub enviados: usize,
    pub baixados: usize,
    pub erro: Option<String>,
}

struct Pendente {
    id: String,
    mime: String,
    sha256: String,
}

/// O `sub` do token de acesso é o id da conta — o mesmo `auth.uid()` que as
/// políticas do bucket comparam com a primeira pasta do caminho.
fn uid_do_token(token: &str) -> Result<String, String> {
    let corpo = token.split('.').nth(1).ok_or("token de acesso inválido")?;
    let b64: String = corpo
        .chars()
        .map(|c| match c {
            '-' => '+',
            '_' => '/',
            c => c,
        })
        .collect();
    let bytes = crate::imagens::decodificar(&b64)?;
    let v: serde_json::Value = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
    v["sub"]
        .as_str()
        .map(str::to_string)
        .ok_or_else(|| "token de acesso sem conta".into())
}

fn pendentes(db: &Db, baixar: bool) -> Result<Vec<Pendente>, String> {
    let dir = pasta()?;
    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
    let mut stmt = conn
        .prepare(
            "SELECT i.id, i.mime, i.sha256 FROM note_images i
              WHERE i.deleted_at IS NULL
                AND NOT EXISTS (SELECT 1 FROM anexos_na_nuvem a WHERE a.image_id = i.id)
              ORDER BY i.created_at",
        )
        .map_err(|e| e.to_string())?;
    let todas = stmt
        .query_map([], |r| {
            Ok(Pendente {
                id: r.get(0)?,
                mime: r.get(1)?,
                sha256: r.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    // Com arquivo no disco, falta subir; sem, falta baixar.
    Ok(todas
        .into_iter()
        .filter(|p| dir.join(arquivo(&p.id, &p.mime)).is_file() != baixar)
        .collect())
}

fn confirmar(db: &Db, id: &str) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
    conn.execute(
        "INSERT INTO anexos_na_nuvem (image_id, confirmado_em) VALUES (?1, ?2)
         ON CONFLICT(image_id) DO NOTHING",
        params![id, agora_ms()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

async fn subir(
    base: &str,
    key: &str,
    token: &str,
    caminho: &str,
    mime: &str,
    bytes: Vec<u8>,
) -> Result<(), String> {
    // `x-upsert`: reenviar depois de uma falha no meio não pode dar conflito.
    let r = crate::rede::cliente()
        .post(format!("{base}/storage/v1/object/{BUCKET}/{caminho}"))
        .header("apikey", key)
        .header("Authorization", format!("Bearer {token}"))
        .header("Content-Type", mime)
        .header("x-upsert", "true")
        .body(bytes)
        .send()
        .await
        .map_err(|e| format!("não consegui enviar a imagem: {e}"))?;
    if r.status().is_success() {
        return Ok(());
    }
    Err(erro_storage(r).await)
}

/// `Ok(None)` quando o arquivo ainda não está lá: a máquina de origem mandou a
/// linha e ainda não terminou de subir o arquivo. Não é erro; tenta depois.
async fn descer(base: &str, key: &str, token: &str, caminho: &str) -> Result<Option<Vec<u8>>, String> {
    let r = crate::rede::cliente()
        .get(format!("{base}/storage/v1/object/authenticated/{BUCKET}/{caminho}"))
        .header("apikey", key)
        .header("Authorization", format!("Bearer {token}"))
        .send()
        .await
        .map_err(|e| format!("não consegui baixar a imagem: {e}"))?;
    let status = r.status();
    if status.is_success() {
        return r.bytes().await.map(|b| Some(b.to_vec())).map_err(|e| e.to_string());
    }
    // O Storage responde 400 com "not_found" no corpo, não 404.
    let erro = erro_storage(r).await;
    if status.as_u16() == 404 || erro.contains("not_found") || erro.contains("Object not found") {
        return Ok(None);
    }
    Err(erro)
}

async fn erro_storage(r: reqwest::Response) -> String {
    let status = r.status();
    let texto = r.text().await.unwrap_or_default();
    if texto.contains("Bucket not found") {
        return "o bucket de imagens não existe: rode de novo o SQL de configuração no Supabase"
            .into();
    }
    if texto.contains("row-level security") || texto.contains("Unauthorized") {
        return "o Supabase recusou a imagem: rode de novo o SQL de configuração (políticas do bucket)"
            .into();
    }
    format!("Storage respondeu {status}: {}", texto.chars().take(200).collect::<String>())
}

/// Sobe os arquivos que esta máquina tem e a nuvem ainda não.
pub async fn subir_pendentes(db: &Db, cfg: &crate::supabase::Config, token: &str, t: &mut Transferencia) {
    if let Err(e) = subir_em(db, cfg, token, t).await {
        t.erro = Some(e);
    }
}

/// Baixa os arquivos das imagens que chegaram pela fila sem o arquivo.
pub async fn baixar_pendentes(db: &Db, cfg: &crate::supabase::Config, token: &str, t: &mut Transferencia) {
    if let Err(e) = baixar_em(db, cfg, token, t).await {
        t.erro = Some(e);
    }
}

async fn subir_em(
    db: &Db,
    cfg: &crate::supabase::Config,
    token: &str,
    t: &mut Transferencia,
) -> Result<(), String> {
    let lista = pendentes(db, false)?;
    if lista.is_empty() {
        return Ok(());
    }
    let (base, key) = crate::supabase::base(cfg)?;
    let uid = uid_do_token(token)?;
    let dir = pasta()?;

    for p in lista {
        let cheia = std::fs::read(dir.join(arquivo(&p.id, &p.mime))).map_err(|e| e.to_string())?;
        // A miniatura sobe antes: quem baixar a imagem e não achar a miniatura
        // mostraria o cartão sem capa.
        if let Ok(mini) = std::fs::read(dir.join(arquivo_mini(&p.id, &p.mime))) {
            subir(&base, &key, token, &format!("{uid}/{}", arquivo_mini(&p.id, &p.mime)), &p.mime, mini)
                .await?;
        }
        subir(&base, &key, token, &format!("{uid}/{}", arquivo(&p.id, &p.mime)), &p.mime, cheia).await?;
        confirmar(db, &p.id)?;
        t.enviados += 1;
    }
    Ok(())
}

async fn baixar_em(
    db: &Db,
    cfg: &crate::supabase::Config,
    token: &str,
    t: &mut Transferencia,
) -> Result<(), String> {
    let lista = pendentes(db, true)?;
    if lista.is_empty() {
        return Ok(());
    }
    let (base, key) = crate::supabase::base(cfg)?;
    let uid = uid_do_token(token)?;
    let dir = pasta()?;

    for p in lista.into_iter().take(BAIXAR_POR_RODADA) {
        let Some(cheia) =
            descer(&base, &key, token, &format!("{uid}/{}", arquivo(&p.id, &p.mime))).await?
        else {
            continue;
        };
        let sha: String = Sha256::digest(&cheia).iter().map(|b| format!("{b:02x}")).collect();
        if sha != p.sha256 {
            return Err(format!("imagem {} chegou diferente do que foi enviado", p.id));
        }
        if let Some(mini) =
            descer(&base, &key, token, &format!("{uid}/{}", arquivo_mini(&p.id, &p.mime))).await?
        {
            std::fs::write(dir.join(arquivo_mini(&p.id, &p.mime)), mini).map_err(|e| e.to_string())?;
        }
        // A imagem cheia por último: é a presença dela que marca "baixada".
        std::fs::write(dir.join(arquivo(&p.id, &p.mime)), cheia).map_err(|e| e.to_string())?;
        confirmar(db, &p.id)?;
        t.baixados += 1;
    }
    Ok(())
}

/// Apaga a pasta da conta no bucket, para "apagar os dados da nuvem" não
/// deixar os desenhos para trás. Devolve quantos arquivos saíram.
pub async fn apagar_tudo(cfg: &crate::supabase::Config, token: &str) -> Result<usize, String> {
    let (base, key) = crate::supabase::base(cfg)?;
    let uid = uid_do_token(token)?;
    let cliente = crate::rede::cliente();
    let mut apagados = 0;
    loop {
        let r = cliente
            .post(format!("{base}/storage/v1/object/list/{BUCKET}"))
            .header("apikey", &key)
            .header("Authorization", format!("Bearer {token}"))
            .json(&serde_json::json!({ "prefix": uid, "limit": 1000, "offset": 0 }))
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if !r.status().is_success() {
            let e = erro_storage(r).await;
            // Projeto que nunca rodou o SQL novo não tem bucket: nada a apagar.
            return if e.contains("bucket de imagens não existe") { Ok(apagados) } else { Err(e) };
        }
        let itens: Vec<serde_json::Value> = r.json().await.map_err(|e| e.to_string())?;
        let nomes: Vec<String> = itens
            .iter()
            .filter_map(|i| i["name"].as_str())
            .map(|n| format!("{uid}/{n}"))
            .collect();
        if nomes.is_empty() {
            return Ok(apagados);
        }
        let r = cliente
            .delete(format!("{base}/storage/v1/object/{BUCKET}"))
            .header("apikey", &key)
            .header("Authorization", format!("Bearer {token}"))
            .json(&serde_json::json!({ "prefixes": nomes }))
            .send()
            .await
            .map_err(|e| e.to_string())?;
        if !r.status().is_success() {
            return Err(erro_storage(r).await);
        }
        apagados += nomes.len();
    }
}

#[cfg(test)]
mod testes {
    use super::uid_do_token;

    #[test]
    fn uid_sai_do_sub_do_token() {
        // {"sub":"abc-123","role":"authenticated"} em base64url, sem padding.
        let token = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhYmMtMTIzIiwicm9sZSI6ImF1dGhlbnRpY2F0ZWQifQ.x";
        assert_eq!(uid_do_token(token).unwrap(), "abc-123");
        assert!(uid_do_token("sem-pontos").is_err());
    }
}
