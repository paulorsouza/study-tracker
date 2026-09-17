//! Tarefa que se repete (D-044).
//!
//! A rotina é a **regra**; o que aparece no Planejamento continua sendo uma
//! tarefa comum, com `rotina_id` preenchido. Nada além deste módulo sabe que
//! rotina existe: cronômetro, relatórios, sincronização e a própria tela do dia
//! seguem lendo `tasks`.
//!
//! ## Por que materializar, e não calcular na hora
//!
//! Tarefa gerada na leitura não teria onde guardar o que o uso produz — a
//! conclusão, o tempo realizado, a ordem na coluna, a troca de dia por arrasto.
//! D-011 adiou a recorrência justamente por isso.
//!
//! ## Não duplicar entre máquinas
//!
//! O id da tarefa do dia é **derivado** da rotina e da data, não sorteado. As
//! duas máquinas geram o mesmo id para o mesmo dia, então a segunda a
//! sincronizar reconhece a tarefa como a mesma em vez de criar uma cópia — era
//! a outra metade do que D-011 deixou em aberto.

use crate::db::{agora_ms, Db};
use chrono::{Datelike, Duration, Local, NaiveDate};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

/// Quantos dias à frente existem como tarefa. Duas semanas dão espaço para
/// planejar e replanejar sem encher o banco de tarefa que ninguém olhou.
const HORIZONTE: i64 = 14;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Rotina {
    pub id: String,
    pub titulo: String,
    pub course_id: Option<String>,
    pub activity_type_id: Option<String>,
    pub duracao_estimada_min: Option<i64>,
    pub prioridade: i64,
    /// Dias da semana, 0 = domingo: "0123456" é todo dia.
    pub dias: String,
    pub ativa: bool,
    pub inicio: Option<String>,
    pub fim: Option<String>,
}

/// Id estável da tarefa de uma rotina num dia. Mesmo formato de um uuid para
/// não destoar do resto da tabela, mas derivado — é o que impede a duplicata
/// entre máquinas.
fn id_do_dia(rotina_id: &str, dia: &str) -> String {
    let bytes = Sha256::digest(format!("rotina:{rotina_id}:{dia}").as_bytes());
    let h: String = bytes.iter().map(|b| format!("{b:02x}")).collect();
    format!(
        "{}-{}-{}-{}-{}",
        &h[0..8],
        &h[8..12],
        &h[12..16],
        &h[16..20],
        &h[20..32]
    )
}

fn ler(conn: &Connection, so_ativas: bool) -> rusqlite::Result<Vec<Rotina>> {
    let sql = format!(
        "SELECT id, titulo, course_id, activity_type_id, duracao_estimada_min, prioridade,
                dias, ativa, inicio, fim
           FROM rotinas WHERE deleted_at IS NULL {}
          ORDER BY titulo",
        if so_ativas { "AND ativa = 1" } else { "" }
    );
    let mut stmt = conn.prepare(&sql)?;
    let v = stmt
        .query_map([], |r| {
            Ok(Rotina {
                id: r.get(0)?,
                titulo: r.get(1)?,
                course_id: r.get(2)?,
                activity_type_id: r.get(3)?,
                duracao_estimada_min: r.get(4)?,
                prioridade: r.get(5)?,
                dias: r.get(6)?,
                ativa: r.get::<_, i64>(7)? == 1,
                inicio: r.get(8)?,
                fim: r.get(9)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(v)
}

/// Cria as tarefas que faltam de hoje até o horizonte.
///
/// `INSERT OR IGNORE` é o coração: rodar de novo não duplica, e a tarefa que o
/// usuário apagou continua apagada — a linha existe com `deleted_at`, então o
/// insert é ignorado e a rotina não a ressuscita no dia seguinte.
pub fn materializar(db: &Db) -> Result<usize, String> {
    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
    let rotinas = ler(&conn, true).map_err(|e| e.to_string())?;
    if rotinas.is_empty() {
        return Ok(0);
    }

    let hoje = Local::now().date_naive();
    let agora = agora_ms();
    let mut criadas = 0usize;

    for r in rotinas {
        for n in 0..=HORIZONTE {
            let dia = hoje + Duration::days(n);
            let iso = dia.format("%Y-%m-%d").to_string();

            // num_days_from_sunday() == 0 no domingo, como o texto de `dias`.
            let n_semana = dia.weekday().num_days_from_sunday().to_string();
            if !r.dias.contains(&n_semana) {
                continue;
            }
            if r.inicio.as_deref().is_some_and(|i| iso.as_str() < i) {
                continue;
            }
            if r.fim.as_deref().is_some_and(|f| iso.as_str() > f) {
                continue;
            }

            let id = id_do_dia(&r.id, &iso);
            let ordem: i64 = conn
                .query_row(
                    "SELECT COALESCE(MAX(ordem), -1) + 1 FROM tasks
                      WHERE deleted_at IS NULL AND dia_planejado IS ?1",
                    params![iso],
                    |x| x.get(0),
                )
                .unwrap_or(0);

            let n = conn
                .execute(
                    "INSERT OR IGNORE INTO tasks
                       (id, titulo, course_id, activity_type_id, rotina_id,
                        duracao_estimada_min, prioridade, dia_planejado, ordem, estado,
                        device_id, version, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'aberta', ?10, 1, ?11, ?11)",
                    params![
                        id,
                        r.titulo,
                        r.course_id,
                        r.activity_type_id,
                        r.id,
                        r.duracao_estimada_min,
                        r.prioridade,
                        iso,
                        ordem,
                        db.device_id,
                        agora
                    ],
                )
                .map_err(|e| e.to_string())?;
            criadas += n;
        }
    }
    Ok(criadas)
}

/// Roda na abertura e de hora em hora. De hora em hora, e não à meia-noite: o
/// computador que dorme à noite perderia o disparo, e quem abre o app às 8h
/// precisa do dia já montado.
pub fn spawn_materializacao(app: tauri::AppHandle) {
    use tauri::Manager;
    std::thread::spawn(move || loop {
        if let Some(db) = app.try_state::<Db>() {
            if let Err(e) = materializar(&db) {
                eprintln!("[rotinas] {e}");
            }
        }
        std::thread::sleep(std::time::Duration::from_secs(3600));
    });
}

// --- comandos ----------------------------------------------------------------

#[tauri::command]
pub fn listar_rotinas(db: tauri::State<Db>) -> Result<Vec<Rotina>, String> {
    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
    ler(&conn, false).map_err(|e| e.to_string())
}

/// Cria ou edita. Editar altera as tarefas **futuras ainda abertas** e não
/// toca no passado: corrigir o título da rotina não pode reescrever o que já
/// foi estudado.
#[tauri::command]
pub fn salvar_rotina(db: tauri::State<Db>, r: Rotina) -> Result<String, String> {
    let titulo = r.titulo.trim().to_string();
    if titulo.is_empty() {
        return Err("a rotina precisa de um título".into());
    }
    if r.dias.trim().is_empty() {
        return Err("escolha ao menos um dia da semana".into());
    }

    let hoje = Local::now().date_naive().format("%Y-%m-%d").to_string();
    {
        let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
        let agora = agora_ms();

        if r.id.is_empty() {
            let id = uuid::Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO rotinas
                   (id, titulo, course_id, activity_type_id, duracao_estimada_min, prioridade,
                    dias, ativa, inicio, fim, device_id, version, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 1, ?12, ?12)",
                params![
                    id, titulo, r.course_id, r.activity_type_id, r.duracao_estimada_min,
                    r.prioridade, r.dias, r.ativa as i64, r.inicio, r.fim, db.device_id, agora
                ],
            )
            .map_err(|e| e.to_string())?;
            drop(conn);
            materializar(&db)?;
            return Ok(id);
        }

        conn.execute(
            "UPDATE rotinas SET titulo = ?2, course_id = ?3, activity_type_id = ?4,
                                duracao_estimada_min = ?5, prioridade = ?6, dias = ?7,
                                ativa = ?8, inicio = ?9, fim = ?10,
                                updated_at = ?11, version = version + 1
              WHERE id = ?1",
            params![
                r.id, titulo, r.course_id, r.activity_type_id, r.duracao_estimada_min,
                r.prioridade, r.dias, r.ativa as i64, r.inicio, r.fim, agora
            ],
        )
        .map_err(|e| e.to_string())?;

        conn.execute(
            "UPDATE tasks SET titulo = ?2, course_id = ?3, activity_type_id = ?4,
                              duracao_estimada_min = ?5, prioridade = ?6,
                              updated_at = ?7, version = version + 1
              WHERE rotina_id = ?1 AND estado = 'aberta' AND deleted_at IS NULL
                AND dia_planejado >= ?8",
            params![
                r.id, titulo, r.course_id, r.activity_type_id, r.duracao_estimada_min,
                r.prioridade, agora, hoje
            ],
        )
        .map_err(|e| e.to_string())?;

        // Dia que saiu da regra não deve continuar cobrando: some do futuro,
        // ainda aberto. O que já foi feito fica.
        let mut stmt = conn
            .prepare(
                "SELECT id, dia_planejado FROM tasks
                  WHERE rotina_id = ?1 AND estado = 'aberta' AND deleted_at IS NULL
                    AND dia_planejado >= ?2",
            )
            .map_err(|e| e.to_string())?;
        let futuras = stmt
            .query_map(params![r.id, hoje], |x| {
                Ok((x.get::<_, String>(0)?, x.get::<_, String>(1)?))
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        drop(stmt);

        for (id, dia) in futuras {
            let cai = NaiveDate::parse_from_str(&dia, "%Y-%m-%d")
                .map(|d| {
                    r.ativa && r.dias.contains(&d.weekday().num_days_from_sunday().to_string())
                })
                .unwrap_or(true);
            if !cai {
                conn.execute(
                    "UPDATE tasks SET deleted_at = ?2, updated_at = ?2, version = version + 1
                      WHERE id = ?1",
                    params![id, agora],
                )
                .map_err(|e| e.to_string())?;
            }
        }
    }

    materializar(&db)?;
    Ok(r.id)
}

/// Apaga a rotina e as tarefas dela ainda abertas, de hoje em diante. O
/// histórico não é tocado: tempo estudado não desaparece porque a regra que o
/// originou saiu de cena.
#[tauri::command]
pub fn excluir_rotina(db: tauri::State<Db>, id: String) -> Result<(), String> {
    let hoje = Local::now().date_naive().format("%Y-%m-%d").to_string();
    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
    let agora = agora_ms();
    conn.execute(
        "UPDATE tasks SET deleted_at = ?2, updated_at = ?2, version = version + 1
          WHERE rotina_id = ?1 AND estado = 'aberta' AND deleted_at IS NULL
            AND dia_planejado >= ?3",
        params![id, agora, hoje],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE rotinas SET deleted_at = ?2, updated_at = ?2, version = version + 1
          WHERE id = ?1",
        params![id, agora],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
