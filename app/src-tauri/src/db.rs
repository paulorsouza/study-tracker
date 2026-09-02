//! Banco local. É a fonte de verdade durante o uso (§5 do plano) — a interface
//! nunca fala SQL, só chama comando. Isso mantém a política de acesso num lugar
//! só e impede que conteúdo remoto alcance o banco por acidente.

use rusqlite::{params, Connection};
use std::path::Path;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

pub struct Db {
    pub conn: Mutex<Connection>,
    /// Identidade deste computador, resolvida uma vez na abertura. Fica aqui
    /// para não repetir consulta a cada escrita.
    pub device_id: String,
}

pub fn agora_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Migrações em ordem. Nunca editar uma já lançada — sempre acrescentar outra.
/// O nome fica gravado no banco, então renomear equivale a reaplicar.
const MIGRATIONS: &[(&str, &str)] = &[
    ("001_inicial", include_str!("../migrations/001_inicial.sql")),
    (
        "002_paleta_validada",
        include_str!("../migrations/002_paleta_validada.sql"),
    ),
    ("003_planejado", include_str!("../migrations/003_planejado.sql")),
    ("004_metas", include_str!("../migrations/004_metas.sql")),
    ("005_notas", include_str!("../migrations/005_notas.sql")),
    ("006_auditoria", include_str!("../migrations/006_auditoria.sql")),
    ("007_obsidian", include_str!("../migrations/007_obsidian.sql")),
    ("008_sync", include_str!("../migrations/008_sync.sql")),
    (
        "009_curso_detalhe",
        include_str!("../migrations/009_curso_detalhe.sql"),
    ),
    (
        "010_favoritos_tempo",
        include_str!("../migrations/010_favoritos_tempo.sql"),
    ),
    (
        "011_atividades_pessoais",
        include_str!("../migrations/011_atividades_pessoais.sql"),
    ),
];

pub fn abrir(caminho: &Path) -> rusqlite::Result<Connection> {
    if let Some(dir) = caminho.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    let conn = Connection::open(caminho)?;

    // WAL: leitura não bloqueia escrita. Importante porque o cronômetro escreve
    // enquanto a interface consulta relatórios.
    conn.pragma_update(None, "journal_mode", "WAL")?;
    // FULL em vez de NORMAL: com WAL, NORMAL pode perder as últimas transações
    // numa queda de energia. Aqui isso significaria perder tempo já estudado.
    conn.pragma_update(None, "synchronous", "FULL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;

    migrar(&conn)?;
    Ok(conn)
}

fn migrar(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
           nome       TEXT PRIMARY KEY,
           aplicada_em INTEGER NOT NULL
         );",
    )?;

    for (nome, sql) in MIGRATIONS {
        let ja: i64 = conn.query_row(
            "SELECT count(*) FROM schema_migrations WHERE nome = ?1",
            params![nome],
            |r| r.get(0),
        )?;
        if ja > 0 {
            continue;
        }

        // Cada migração é atômica: ou o esquema inteiro avança, ou nada muda.
        // Migração interrompida pela metade é um dos casos de teste de §13.
        conn.execute_batch("BEGIN")?;
        match conn.execute_batch(sql).and_then(|_| {
            conn.execute(
                "INSERT INTO schema_migrations (nome, aplicada_em) VALUES (?1, ?2)",
                params![nome, agora_ms()],
            )
            .map(|_| ())
        }) {
            Ok(()) => conn.execute_batch("COMMIT")?,
            Err(e) => {
                let _ = conn.execute_batch("ROLLBACK");
                return Err(e);
            }
        }
    }
    Ok(())
}

/// Identidade deste computador. Gerada uma vez e guardada no próprio banco —
/// é o que vai permitir distinguir origem das alterações quando houver sync,
/// e o que sustenta o índice de cronômetro único por dispositivo.
pub fn device_id(conn: &Connection) -> rusqlite::Result<String> {
    if let Ok(v) = conn.query_row(
        "SELECT valor FROM settings WHERE chave = 'device_id'",
        [],
        |r| r.get::<_, String>(0),
    ) {
        return Ok(v);
    }
    let novo = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO settings (chave, valor) VALUES ('device_id', ?1)",
        params![novo],
    )?;
    Ok(novo)
}

/// Categorias iniciais (§3.5). Semeadas só uma vez: se o usuário apagar
/// "academia", ela não volta na próxima abertura.
pub fn semear(conn: &Connection, device: &str) -> rusqlite::Result<()> {
    let ja: i64 = conn.query_row(
        "SELECT count(*) FROM settings WHERE chave = 'semeado_v1'",
        [],
        |r| r.get(0),
    )?;
    if ja > 0 {
        return Ok(());
    }

    // (id, nome, cor clara, cor escura, conta_como_estudo)
    //
    // Paleta categórica validada para daltonismo nos dois temas. A ORDEM é o
    // mecanismo de segurança — são os pares vizinhos que precisam se separar,
    // então reordenar sem revalidar quebra a acessibilidade em silêncio.
    let tipos: &[(&str, &str, &str, &str, i64)] = &[
        ("at-estudo", "Estudo", "#2a78d6", "#3987e5", 1),
        ("at-academia", "Academia", "#eb6834", "#d95926", 0),
        ("at-caminhada", "Caminhada com os dogs", "#1baf7a", "#199e70", 0),
        ("at-exercicio", "Exercício", "#eda100", "#c98500", 0),
        ("at-descanso", "Descanso", "#e87ba4", "#d55181", 0),
        ("at-deslocamento", "Deslocamento", "#008300", "#008300", 0),
        ("at-pausa", "Pausa", "#4a3aa7", "#9085e9", 0),
        ("at-pessoal", "Pessoal", "#e34948", "#e66767", 0),
    ];

    let agora = agora_ms();
    for (i, (id, nome, cor, escura, estudo)) in tipos.iter().enumerate() {
        conn.execute(
            "INSERT INTO activity_types
               (id, nome, cor, cor_escura, conta_como_estudo, ordem, device_id,
                version, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, ?8, ?8)",
            params![id, nome, cor, escura, estudo, i as i64, device, agora],
        )?;
    }

    for (id, nome, url) in [
        ("pf-hotmart", "Hotmart", "https://consumer.hotmart.com"),
        ("pf-t2", "T2 Educação", "https://app.t2.com.br/"),
    ] {
        conn.execute(
            "INSERT INTO platforms (id, nome, url_base, device_id, version, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, 1, ?5, ?5)",
            params![id, nome, url, device, agora],
        )?;
    }

    conn.execute(
        "INSERT INTO settings (chave, valor) VALUES ('semeado_v1', '1')",
        [],
    )?;
    Ok(())
}
