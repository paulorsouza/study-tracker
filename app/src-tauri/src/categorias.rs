//! Tipos de atividade e metas (§3.5 e §3.11).
//!
//! As categorias deixaram de ser só as semeadas: o usuário cria, renomeia,
//! reordena e apaga as suas. Duas restrições que não são arbitrárias:
//!
//! * **a cor sai de uma paleta fechada**, não de um seletor livre. Ver D-012:
//!   cor de categoria é identidade em gráfico, e um tom escolhido no olho pode
//!   ficar indistinguível de outro para quem tem daltonismo — ou, como já
//!   aconteceu aqui, para qualquer um;
//! * **`ordem` importa**. A separação exigida é entre pares *vizinhos*, então
//!   a sequência das categorias é parte da acessibilidade, não decoração.

use crate::db::{agora_ms, Db};
use rusqlite::params;
use serde::Serialize;

/// Paleta categórica validada para daltonismo nos dois temas — a mesma da
/// migração 002. Fica aqui para existir **uma** fonte: a semente, o seletor de
/// cor da interface e a documentação leem daqui.
///
/// Oito é o limite, não um número redondo: além disso não há como manter a
/// separação entre pares, e gerar uma nona cor seria fabricar uma que colide
/// com alguma das outras.
pub const PALETA: &[(&str, &str, &str)] = &[
    ("azul", "#2a78d6", "#3987e5"),
    ("laranja", "#eb6834", "#d95926"),
    ("verde-água", "#1baf7a", "#199e70"),
    ("amarelo", "#eda100", "#c98500"),
    ("magenta", "#e87ba4", "#d55181"),
    ("verde", "#008300", "#008300"),
    ("violeta", "#4a3aa7", "#9085e9"),
    ("vermelho", "#e34948", "#e66767"),
];

/// Categorias que o resto do sistema referencia por id. Apagar quebraria o
/// cronômetro e o Pomodoro, então o app recusa em vez de deixar quebrar depois.
const PROTEGIDAS: &[&str] = &["at-estudo", "at-pausa"];

#[derive(Serialize)]
pub struct Cor {
    pub nome: String,
    pub clara: String,
    pub escura: String,
}

#[tauri::command]
pub fn paleta() -> Vec<Cor> {
    PALETA
        .iter()
        .map(|(n, c, e)| Cor {
            nome: n.to_string(),
            clara: c.to_string(),
            escura: e.to_string(),
        })
        .collect()
}

#[derive(Serialize)]
pub struct Meta {
    pub id: String,
    pub activity_type_id: String,
    pub atividade: String,
    pub cor: String,
    pub cor_escura: Option<String>,
    pub periodo: String,
    pub min_minutos: Option<i64>,
    pub max_minutos: Option<i64>,
}

// --- tipos de atividade ------------------------------------------------------

#[tauri::command]
pub fn criar_tipo(
    db: tauri::State<Db>,
    nome: String,
    cor: String,
    cor_escura: String,
    conta_como_estudo: bool,
) -> Result<String, String> {
    let nome = nome.trim().to_string();
    if nome.is_empty() {
        return Err("a categoria precisa de um nome".into());
    }
    if !PALETA.iter().any(|(_, c, _)| *c == cor) {
        return Err("cor fora da paleta validada".into());
    }

    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
    let ordem: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(ordem), -1) + 1 FROM activity_types WHERE deleted_at IS NULL",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    let id = uuid::Uuid::new_v4().to_string();
    let agora = agora_ms();
    conn.execute(
        "INSERT INTO activity_types
           (id, nome, cor, cor_escura, conta_como_estudo, ordem, device_id,
            version, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, ?8, ?8)",
        params![id, nome, cor, cor_escura, conta_como_estudo as i64, ordem, db.device_id, agora],
    )
    .map_err(|e| e.to_string())?;
    Ok(id)
}

#[tauri::command]
pub fn editar_tipo(
    db: tauri::State<Db>,
    id: String,
    nome: String,
    cor: String,
    cor_escura: String,
    conta_como_estudo: bool,
) -> Result<(), String> {
    if !PALETA.iter().any(|(_, c, _)| *c == cor) {
        return Err("cor fora da paleta validada".into());
    }
    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
    conn.execute(
        "UPDATE activity_types
            SET nome = ?2, cor = ?3, cor_escura = ?4, conta_como_estudo = ?5,
                updated_at = ?6, version = version + 1
          WHERE id = ?1 AND deleted_at IS NULL",
        params![id, nome.trim(), cor, cor_escura, conta_como_estudo as i64, agora_ms()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn excluir_tipo(db: tauri::State<Db>, id: String) -> Result<(), String> {
    if PROTEGIDAS.contains(&id.as_str()) {
        return Err(
            "esta categoria é usada pelo cronômetro e pelo Pomodoro; renomeie em vez de apagar"
                .into(),
        );
    }
    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;

    // Exclusão lógica: os lançamentos antigos continuam apontando para cá, e o
    // histórico não pode perder o nome do que foi feito.
    let agora = agora_ms();
    conn.execute(
        "UPDATE activity_types SET deleted_at = ?2, updated_at = ?2, version = version + 1
          WHERE id = ?1",
        params![id, agora],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE activity_goals SET deleted_at = ?2, updated_at = ?2, version = version + 1
          WHERE activity_type_id = ?1 AND deleted_at IS NULL",
        params![id, agora],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// A ordem é o mecanismo de separação entre cores vizinhas (D-012), então
/// reordenar não é cosmético — é por isso que existe como operação explícita.
#[tauri::command]
pub fn reordenar_tipos(db: tauri::State<Db>, ids: Vec<String>) -> Result<(), String> {
    let mut conn = db.conn.lock().map_err(|_| "banco ocupado")?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let agora = agora_ms();
    for (i, id) in ids.iter().enumerate() {
        tx.execute(
            "UPDATE activity_types SET ordem = ?2, updated_at = ?3, version = version + 1
              WHERE id = ?1",
            params![id, i as i64, agora],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

// --- metas -------------------------------------------------------------------

#[tauri::command]
pub fn listar_metas(db: tauri::State<Db>) -> Result<Vec<Meta>, String> {
    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
    let mut stmt = conn
        .prepare(
            "SELECT g.id, g.activity_type_id, a.nome, a.cor, a.cor_escura,
                    g.periodo, g.min_minutos, g.max_minutos
               FROM activity_goals g
               JOIN activity_types a ON a.id = g.activity_type_id
              WHERE g.deleted_at IS NULL AND a.deleted_at IS NULL
              ORDER BY a.ordem",
        )
        .map_err(|e| e.to_string())?;
    let v = stmt
        .query_map([], |r| {
            Ok(Meta {
                id: r.get(0)?,
                activity_type_id: r.get(1)?,
                atividade: r.get(2)?,
                cor: r.get(3)?,
                cor_escura: r.get(4)?,
                periodo: r.get(5)?,
                min_minutos: r.get(6)?,
                max_minutos: r.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(v)
}

#[tauri::command]
pub fn salvar_meta(
    db: tauri::State<Db>,
    activity_type_id: String,
    periodo: String,
    min_minutos: Option<i64>,
    max_minutos: Option<i64>,
) -> Result<(), String> {
    if !matches!(periodo.as_str(), "dia" | "semana") {
        return Err("período inválido".into());
    }
    // Meta sem nenhum dos dois lados não diz nada; com piso acima do teto, diz
    // duas coisas contraditórias. As duas checagens também estão no banco — a
    // daqui existe para a mensagem ser legível.
    if min_minutos.is_none() && max_minutos.is_none() {
        return Err("defina ao menos um piso ou um teto".into());
    }
    if let (Some(a), Some(b)) = (min_minutos, max_minutos) {
        if a > b {
            return Err("o mínimo não pode ser maior que o máximo".into());
        }
    }
    if min_minutos.is_some_and(|v| v < 0) || max_minutos.is_some_and(|v| v < 0) {
        return Err("as horas não podem ser negativas".into());
    }

    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
    let agora = agora_ms();

    let existente: Option<String> = conn
        .query_row(
            "SELECT id FROM activity_goals
              WHERE activity_type_id = ?1 AND periodo = ?2 AND deleted_at IS NULL",
            params![activity_type_id, periodo],
            |r| r.get(0),
        )
        .ok();

    match existente {
        Some(id) => conn.execute(
            "UPDATE activity_goals
                SET min_minutos = ?2, max_minutos = ?3, updated_at = ?4,
                    version = version + 1
              WHERE id = ?1",
            params![id, min_minutos, max_minutos, agora],
        ),
        None => conn.execute(
            "INSERT INTO activity_goals
               (id, activity_type_id, periodo, min_minutos, max_minutos,
                device_id, version, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7, ?7)",
            params![
                uuid::Uuid::new_v4().to_string(),
                activity_type_id,
                periodo,
                min_minutos,
                max_minutos,
                db.device_id,
                agora
            ],
        ),
    }
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn excluir_meta(db: tauri::State<Db>, id: String) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
    conn.execute(
        "UPDATE activity_goals SET deleted_at = ?2, updated_at = ?2, version = version + 1
          WHERE id = ?1",
        params![id, agora_ms()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
