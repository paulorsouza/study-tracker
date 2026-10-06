//! Imagens nas notas (D-047).
//!
//! O desenho feito à caneta no tablet entra como imagem presa à nota. A
//! interface já entrega a imagem reduzida (no máximo 2400px no lado maior) e
//! uma miniatura para o cartão da lista; aqui só se confere o formato, grava o
//! arquivo e registra a linha.
//!
//! O arquivo mora em `anexos/` na pasta de dados do app, nunca no banco: bytes
//! no SQLite incham o WAL e iriam em cada operação de sincronização. O que
//! sincroniza é a linha de `note_images`; o arquivo viaja à parte (F2 de
//! D-047). Enquanto ele não chega, a interface recebe `presente: false` e
//! mostra o lugar vazio, em vez de quebrar.

use crate::db::{agora_ms, Db};
use rusqlite::params;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::path::PathBuf;
use std::sync::OnceLock;

/// Teto por imagem já reduzida. Um desenho em 2400px fica em centenas de KB;
/// 8 MB só passa foto sem redução, e essa não deveria chegar aqui.
const MAX_BYTES: usize = 8 * 1024 * 1024;
const MAX_MINI: usize = 512 * 1024;

#[derive(Serialize)]
pub struct Imagem {
    pub id: String,
    pub largura: i64,
    pub altura: i64,
    pub bytes: i64,
    /// Data URL da miniatura; `None` quando o arquivo ainda não chegou.
    pub mini: Option<String>,
    pub presente: bool,
}

static PASTA: OnceLock<PathBuf> = OnceLock::new();

/// Definida uma vez na abertura, ao lado do banco. Global porque a rodada de
/// sincronização também precisa dela e não tem `AppHandle` à mão.
pub fn definir_pasta(dir: PathBuf) {
    let _ = PASTA.set(dir);
}

pub fn pasta() -> Result<PathBuf, String> {
    let dir = PASTA.get().ok_or("pasta de anexos não definida")?.clone();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn extensao(mime: &str) -> &'static str {
    match mime {
        "image/png" => "png",
        "image/jpeg" => "jpg",
        _ => "webp",
    }
}

/// Nome do arquivo da imagem. Também é o nome usado na exportação para o
/// Obsidian, por isso não leva nada além do id e da extensão.
pub fn arquivo(id: &str, mime: &str) -> String {
    format!("{id}.{}", extensao(mime))
}

pub fn arquivo_mini(id: &str, mime: &str) -> String {
    format!("{id}.mini.{}", extensao(mime))
}

/// O formato vem dos bytes, não do que a interface diz: a extensão do arquivo
/// e o `mime` gravado precisam concordar com o conteúdo.
fn formato(b: &[u8]) -> Option<&'static str> {
    if b.len() >= 12 && &b[0..4] == b"RIFF" && &b[8..12] == b"WEBP" {
        Some("image/webp")
    } else if b.starts_with(&[0x89, b'P', b'N', b'G']) {
        Some("image/png")
    } else if b.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Some("image/jpeg")
    } else {
        None
    }
}

/// Aceita o corpo de uma data URL ou o base64 puro.
pub(crate) fn decodificar(s: &str) -> Result<Vec<u8>, String> {
    let corpo = s.split_once(',').map(|(_, b)| b).unwrap_or(s);
    let mut saida = Vec::with_capacity(corpo.len() / 4 * 3);
    let mut acc: u32 = 0;
    let mut bits = 0;
    for c in corpo.bytes() {
        let v = match c {
            b'A'..=b'Z' => c - b'A',
            b'a'..=b'z' => c - b'a' + 26,
            b'0'..=b'9' => c - b'0' + 52,
            b'+' => 62,
            b'/' => 63,
            b'=' | b'\n' | b'\r' => continue,
            _ => return Err("imagem em formato inválido".into()),
        };
        acc = (acc << 6) | v as u32;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            saida.push((acc >> bits) as u8);
        }
    }
    Ok(saida)
}

fn data_url(mime: &str, bytes: &[u8]) -> String {
    format!("data:{mime};base64,{}", crate::library::base64_simples(bytes))
}

/// Miniatura da primeira imagem de cada nota, para o cartão da lista.
pub fn mini_da_nota(
    conn: &rusqlite::Connection,
    dir: &std::path::Path,
    nota_id: &str,
) -> (i64, Option<String>) {
    let total: i64 = conn
        .query_row(
            "SELECT count(*) FROM note_images WHERE note_id = ?1 AND deleted_at IS NULL",
            params![nota_id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if total == 0 {
        return (0, None);
    }
    let primeira: Option<(String, String)> = conn
        .query_row(
            "SELECT id, mime FROM note_images WHERE note_id = ?1 AND deleted_at IS NULL
              ORDER BY ordem, created_at LIMIT 1",
            params![nota_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .ok();
    let mini = primeira.and_then(|(id, mime)| {
        std::fs::read(dir.join(arquivo_mini(&id, &mime)))
            .ok()
            .map(|b| data_url(&mime, &b))
    });
    (total, mini)
}

#[tauri::command]
pub fn nota_imagens(
    db: tauri::State<Db>,
    nota_id: String,
) -> Result<Vec<Imagem>, String> {
    let dir = pasta()?;
    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
    let mut stmt = conn
        .prepare(
            "SELECT id, mime, largura, altura, bytes FROM note_images
              WHERE note_id = ?1 AND deleted_at IS NULL
              ORDER BY ordem, created_at",
        )
        .map_err(|e| e.to_string())?;
    let linhas = stmt
        .query_map(params![nota_id], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, i64>(2)?,
                r.get::<_, i64>(3)?,
                r.get::<_, i64>(4)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(linhas
        .into_iter()
        .map(|(id, mime, largura, altura, bytes)| {
            let presente = dir.join(arquivo(&id, &mime)).is_file();
            let mini = std::fs::read(dir.join(arquivo_mini(&id, &mime)))
                .ok()
                .map(|b| data_url(&mime, &b));
            Imagem { id, largura, altura, bytes, mini, presente }
        })
        .collect())
}

/// A imagem inteira, para a tela cheia. Separada da lista porque só se paga
/// o tamanho dela quando alguém a abre.
#[tauri::command]
pub fn nota_imagem(db: tauri::State<Db>, id: String) -> Result<String, String> {
    let mime: String = {
        let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
        conn.query_row(
            "SELECT mime FROM note_images WHERE id = ?1 AND deleted_at IS NULL",
            params![id],
            |r| r.get(0),
        )
        .map_err(|_| "imagem não encontrada")?
    };
    let bytes = std::fs::read(pasta()?.join(arquivo(&id, &mime)))
        .map_err(|_| "a imagem ainda não chegou a este aparelho")?;
    Ok(data_url(&mime, &bytes))
}

#[tauri::command]
pub fn nota_imagem_adicionar(
    db: tauri::State<Db>,
    nota_id: String,
    imagem: String,
    mini: String,
    largura: i64,
    altura: i64,
) -> Result<String, String> {
    let bytes = decodificar(&imagem)?;
    let mini = decodificar(&mini)?;
    if bytes.len() > MAX_BYTES {
        return Err("imagem grande demais".into());
    }
    if mini.len() > MAX_MINI {
        return Err("miniatura grande demais".into());
    }
    let mime = formato(&bytes).ok_or("formato de imagem não suportado")?;
    if formato(&mini) != Some(mime) {
        return Err("a miniatura não está no mesmo formato da imagem".into());
    }

    let id = uuid::Uuid::new_v4().to_string();
    let sha: String = Sha256::digest(&bytes).iter().map(|b| format!("{b:02x}")).collect();

    // Arquivo antes da linha: se a gravação falhar, não sobra registro
    // apontando para o nada — e um arquivo órfão não aparece em lugar nenhum.
    let dir = pasta()?;
    std::fs::write(dir.join(arquivo(&id, mime)), &bytes).map_err(|e| e.to_string())?;
    std::fs::write(dir.join(arquivo_mini(&id, mime)), &mini).map_err(|e| e.to_string())?;

    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
    let agora = agora_ms();
    conn.execute(
        "INSERT INTO note_images
           (id, note_id, ordem, mime, largura, altura, bytes, sha256, device_id,
            version, created_at, updated_at)
         VALUES (?1, ?2,
                 (SELECT COALESCE(max(ordem) + 1, 0) FROM note_images
                   WHERE note_id = ?2 AND deleted_at IS NULL),
                 ?3, ?4, ?5, ?6, ?7, ?8, 1, ?9, ?9)",
        params![id, nota_id, mime, largura, altura, bytes.len() as i64, sha, db.device_id, agora],
    )
    .map_err(|e| e.to_string())?;
    Ok(id)
}

/// Exclusão lógica, como em todo o app. O arquivo fica no disco: desfazer a
/// exclusão por sincronização ou conflito precisa dele.
#[tauri::command]
pub fn nota_imagem_excluir(db: tauri::State<Db>, id: String) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
    conn.execute(
        "UPDATE note_images SET deleted_at = ?2, updated_at = ?2, version = version + 1
          WHERE id = ?1 AND deleted_at IS NULL",
        params![id, agora_ms()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod testes {
    use super::{decodificar, formato};

    #[test]
    fn decodifica_com_e_sem_prefixo() {
        assert_eq!(decodificar("YWJj").unwrap(), b"abc");
        assert_eq!(decodificar("YWI=").unwrap(), b"ab");
        assert_eq!(decodificar("data:image/png;base64,YQ==").unwrap(), b"a");
        assert!(decodificar("Y$==").is_err());
    }

    #[test]
    fn formato_vem_dos_bytes() {
        assert_eq!(formato(b"RIFF\0\0\0\0WEBPVP8 "), Some("image/webp"));
        assert_eq!(formato(&[0x89, b'P', b'N', b'G', 13, 10]), Some("image/png"));
        assert_eq!(formato(&[0xFF, 0xD8, 0xFF, 0xE0]), Some("image/jpeg"));
        assert_eq!(formato(b"<svg"), None);
    }
}
