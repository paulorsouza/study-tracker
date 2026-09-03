//! Lançamentos de tempo: ver o dia e corrigir o que estiver errado (§3.5).
//!
//! Um registro de tempo em que o usuário não enxerga o dia e não conserta um
//! erro não ganha confiança — e sem confiança ele para de ser usado. Por isso
//! editar, excluir e desfazer vêm junto com a listagem, não depois.
//!
//! Fronteiras de dia chegam prontas da interface, em milissegundos. É de
//! propósito: o JavaScript já sabe o fuso e o horário de verão do usuário, e
//! duplicar essa lógica aqui só criaria duas verdades para "o que é hoje".

use crate::db::{agora_ms, Db};
use rusqlite::params;
use serde::Serialize;

#[derive(Serialize)]
pub struct Lancamento {
    pub id: String,
    pub started_at: i64,
    pub ended_at: Option<i64>,
    pub activity_type_id: String,
    pub atividade: String,
    pub cor: String,
    pub cor_escura: Option<String>,
    pub conta_como_estudo: bool,
    pub description: Option<String>,
    pub course_id: Option<String>,
    pub curso: Option<String>,
    pub source: String,
    pub observacao: Option<String>,
    pub distancia_m: Option<i64>,
    pub treino: Option<String>,
    /// Ícone da categoria, resolvido aqui para a lista não precisar de um
    /// segundo carregamento só para desenhar a linha.
    pub icone: Option<String>,
    pub subject_id: Option<String>,
    pub materia: Option<String>,
    pub aula: Option<String>,
    /// Etiqueta de estrutura: `pomodoro_focus`, `pomodoro_break` ou nada. Nunca
    /// soma nada — só filtra (`docs/03-modelo-de-tempo.md`). É o que deixa o
    /// Painel contar Pomodoros sem uma segunda consulta que possa discordar.
    pub context: Option<String>,
    /// Este lançamento cobre um pedaço de tempo que outro também cobre.
    ///
    /// Sobreposição continua **permitida** — caminhar com os dogs durante a
    /// pausa do Pomodoro é um caso legítimo (`docs/03-modelo-de-tempo.md`). O
    /// que não pode é passar despercebida: dois lançamentos sobrepostos por
    /// engano fazem o total do dia passar de 24 horas sem ninguém notar.
    pub sobrepoe: bool,
}

#[derive(Serialize)]
pub struct TipoAtividade {
    pub id: String,
    pub nome: String,
    pub cor: String,
    pub cor_escura: Option<String>,
    pub conta_como_estudo: bool,
    pub icone: Option<String>,
    /// Campo extra que esta categoria pede: "distancia", "treino" ou nada.
    /// Mora na categoria e não numa regra no código porque quem decide que
    /// academia registra treino é o usuário — ele pode criar "Natação" amanhã.
    pub campos_extra: Option<String>,
}

/// Aceita `45m`, `1h30`, `1:30`, `2h` e número puro em minutos.
///
/// Devolve minutos. `None` quando não dá para entender — nunca um palpite: um
/// lançamento com duração adivinhada é pior que um lançamento recusado.
pub fn parse_duracao(texto: &str) -> Option<i64> {
    let t = texto.trim().to_lowercase().replace(' ', "");
    if t.is_empty() {
        return None;
    }

    // 1:30
    if let Some((h, m)) = t.split_once(':') {
        let h: i64 = h.parse().ok()?;
        let m: i64 = m.parse().ok()?;
        if !(0..60).contains(&m) {
            return None;
        }
        return Some(h * 60 + m);
    }

    // 1h30 / 1h / 2h00
    if let Some((h, resto)) = t.split_once('h') {
        let h: i64 = h.parse().ok()?;
        if resto.is_empty() {
            return Some(h * 60);
        }
        let m: i64 = resto.trim_end_matches('m').parse().ok()?;
        if !(0..60).contains(&m) {
            return None;
        }
        return Some(h * 60 + m);
    }

    // 45m
    if let Some(m) = t.strip_suffix('m') {
        return m.parse().ok();
    }

    // número puro = minutos
    t.parse().ok()
}

#[tauri::command]
pub fn listar_tipos(db: tauri::State<Db>) -> Result<Vec<TipoAtividade>, String> {
    let conn = db.conn.lock().unwrap();
    let mut stmt = conn
        .prepare(
            "SELECT id, nome, cor, cor_escura, conta_como_estudo, icone, campos_extra
               FROM activity_types
              WHERE deleted_at IS NULL ORDER BY ordem",
        )
        .map_err(|e| e.to_string())?;
    let v = stmt
        .query_map([], |r| {
            Ok(TipoAtividade {
                id: r.get(0)?,
                nome: r.get(1)?,
                cor: r.get(2)?,
                cor_escura: r.get(3)?,
                conta_como_estudo: r.get::<_, i64>(4)? != 0,
                icone: r.get(5)?,
                campos_extra: r.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(v)
}

/// Lançamentos que **tocam** o período, não só os que começam dentro dele —
/// senão uma sessão que atravessa a meia-noite some da lista dos dois dias.
#[tauri::command]
pub fn listar_periodo(
    db: tauri::State<Db>,
    inicio: i64,
    fim: i64,
) -> Result<Vec<Lancamento>, String> {
    let conn = db.conn.lock().unwrap();
    let mut stmt = conn
        .prepare(
            "SELECT e.id, e.started_at, e.ended_at, e.activity_type_id, a.nome, a.cor,
                    a.cor_escura, a.conta_como_estudo, e.description, e.course_id,
                    c.titulo, e.source, e.observacao, e.distancia_m, e.treino, a.icone,
                    e.subject_id, s.nome, e.aula, e.context
               FROM time_entries e
               JOIN activity_types a ON a.id = e.activity_type_id
               LEFT JOIN courses c ON c.id = e.course_id
               LEFT JOIN subjects s ON s.id = e.subject_id
              WHERE e.deleted_at IS NULL
                AND e.started_at < ?2
                AND COALESCE(e.ended_at, ?2) > ?1
              ORDER BY e.started_at",
        )
        .map_err(|e| e.to_string())?;

    let mut v = stmt
        .query_map(params![inicio, fim], |r| {
            Ok(Lancamento {
                id: r.get(0)?,
                started_at: r.get(1)?,
                ended_at: r.get(2)?,
                activity_type_id: r.get(3)?,
                atividade: r.get(4)?,
                cor: r.get(5)?,
                cor_escura: r.get(6)?,
                conta_como_estudo: r.get::<_, i64>(7)? != 0,
                description: r.get(8)?,
                course_id: r.get(9)?,
                curso: r.get(10)?,
                source: r.get(11)?,
                observacao: r.get(12)?,
                distancia_m: r.get(13)?,
                treino: r.get(14)?,
                icone: r.get(15)?,
                subject_id: r.get(16)?,
                materia: r.get(17)?,
                aula: r.get(18)?,
                context: r.get(19)?,
                sobrepoe: false,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    marcar_sobreposicao(&mut v);
    Ok(v)
}

/// Marca quem divide relógio com quem. A lista já vem ordenada por início, o
/// que reduz a comparação a "começou antes do fim mais distante que já vi".
fn marcar_sobreposicao(v: &mut [Lancamento]) {
    let mut maior_fim: Option<(usize, i64)> = None;
    for i in 0..v.len() {
        let (inicio, fim) = (v[i].started_at, v[i].ended_at.unwrap_or(i64::MAX));
        if let Some((j, ate)) = maior_fim {
            if inicio < ate {
                v[i].sobrepoe = true;
                v[j].sobrepoe = true;
            }
        }
        if maior_fim.is_none_or(|(_, ate)| fim > ate) {
            maior_fim = Some((i, fim));
        }
    }
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn criar_lancamento(
    db: tauri::State<Db>,
    inicio: i64,
    fim: Option<i64>,
    duracao: Option<String>,
    activity_type_id: String,
    descricao: Option<String>,
    curso_id: Option<String>,
) -> Result<String, String> {
    // Fim explícito ganha da duração; se vierem os dois, o usuário foi mais
    // específico com o fim.
    let fim = match (fim, duracao.as_deref()) {
        (Some(f), _) => f,
        (None, Some(d)) => {
            let min = parse_duracao(d)
                .ok_or_else(|| format!("não entendi a duração “{d}”. Use 45m, 1h30 ou 1:30"))?;
            if min <= 0 {
                return Err("a duração precisa ser maior que zero".into());
            }
            inicio + min * 60_000
        }
        (None, None) => return Err("informe o fim ou a duração".into()),
    };

    if fim < inicio {
        return Err("o fim não pode ser antes do início".into());
    }

    let conn = db.conn.lock().unwrap();
    let id = uuid::Uuid::new_v4().to_string();
    let agora = agora_ms();
    conn.execute(
        "INSERT INTO time_entries
           (id, started_at, ended_at, activity_type_id, description, course_id,
            source, device_id, version, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'manual', ?7, 1, ?8, ?8)",
        params![
            id,
            inicio,
            fim,
            activity_type_id,
            descricao,
            curso_id,
            db.device_id,
            agora
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(id)
}

/// Guarda o estado anterior antes de mexer. É o que sustenta o desfazer e a
/// área de recuperação de §7 — sem isto, "excluir" seria perda real.
fn registrar_revisao(
    conn: &rusqlite::Connection,
    device: &str,
    id: &str,
    operacao: &str,
) -> Result<(), String> {
    let anterior: String = conn
        .query_row(
            "SELECT json_object(
                'started_at', started_at, 'ended_at', ended_at,
                'activity_type_id', activity_type_id, 'description', description,
                'course_id', course_id, 'deleted_at', deleted_at)
               FROM time_entries WHERE id = ?1",
            params![id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO session_revisions
           (id, entry_id, operacao, estado_anterior, device_id, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            uuid::Uuid::new_v4().to_string(),
            id,
            operacao,
            anterior,
            device,
            agora_ms()
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn editar_lancamento(
    db: tauri::State<Db>,
    id: String,
    inicio: i64,
    fim: i64,
    activity_type_id: String,
    descricao: Option<String>,
    curso_id: Option<String>,
) -> Result<(), String> {
    if fim < inicio {
        return Err("o fim não pode ser antes do início".into());
    }
    let conn = db.conn.lock().unwrap();
    registrar_revisao(&conn, &db.device_id, &id, "editar")?;
    conn.execute(
        "UPDATE time_entries
            SET started_at = ?2, ended_at = ?3, activity_type_id = ?4,
                description = ?5, course_id = ?6, updated_at = ?7,
                version = version + 1
          WHERE id = ?1 AND deleted_at IS NULL",
        params![
            id,
            inicio,
            fim,
            activity_type_id,
            descricao,
            curso_id,
            agora_ms()
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn excluir_lancamento(db: tauri::State<Db>, id: String) -> Result<(), String> {
    let conn = db.conn.lock().unwrap();
    registrar_revisao(&conn, &db.device_id, &id, "excluir")?;
    conn.execute(
        "UPDATE time_entries SET deleted_at = ?2, updated_at = ?2, version = version + 1
          WHERE id = ?1",
        params![id, agora_ms()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn restaurar_lancamento(db: tauri::State<Db>, id: String) -> Result<(), String> {
    let conn = db.conn.lock().unwrap();
    registrar_revisao(&conn, &db.device_id, &id, "restaurar")?;
    conn.execute(
        "UPDATE time_entries SET deleted_at = NULL, updated_at = ?2, version = version + 1
          WHERE id = ?1",
        params![id, agora_ms()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod testes {
    use super::parse_duracao;

    #[test]
    fn formatos_aceitos() {
        assert_eq!(parse_duracao("45m"), Some(45));
        assert_eq!(parse_duracao("45"), Some(45));
        assert_eq!(parse_duracao("1h30"), Some(90));
        assert_eq!(parse_duracao("1h"), Some(60));
        assert_eq!(parse_duracao("2h00"), Some(120));
        assert_eq!(parse_duracao("1:30"), Some(90));
        assert_eq!(parse_duracao("0:45"), Some(45));
        assert_eq!(parse_duracao("1h30m"), Some(90));
    }

    #[test]
    fn tolera_espaco_e_caixa() {
        assert_eq!(parse_duracao(" 1H30 "), Some(90));
        assert_eq!(parse_duracao("1 h 30"), Some(90));
    }

    #[test]
    fn recusa_em_vez_de_adivinhar() {
        assert_eq!(parse_duracao(""), None);
        assert_eq!(parse_duracao("abc"), None);
        assert_eq!(parse_duracao("1h70"), None, "minuto acima de 59");
        assert_eq!(parse_duracao("1:70"), None, "minuto acima de 59");
        assert_eq!(parse_duracao("h30"), None);
    }
}

/// Resumo agregado do período, para a ponte. Sai pronto em minutos: o cliente
/// MCP não deveria precisar somar nada para responder "quanto estudei".
pub fn resumo_json(db: &Db, desde: i64, ate: i64) -> serde_json::Value {
    let Ok(conn) = db.conn.lock() else {
        return serde_json::json!({});
    };

    let por_atividade = conn
        .prepare(
            "SELECT a.nome, a.conta_como_estudo,
                    SUM(COALESCE(e.ended_at, ?2) - e.started_at) / 60000
               FROM time_entries e
               JOIN activity_types a ON a.id = e.activity_type_id
              WHERE e.deleted_at IS NULL AND e.started_at < ?2
                AND COALESCE(e.ended_at, ?2) > ?1
              GROUP BY a.id ORDER BY 3 DESC",
        )
        .and_then(|mut s| {
            s.query_map(params![desde, ate], |r| {
                Ok(serde_json::json!({
                    "atividade": r.get::<_, String>(0)?,
                    "conta_como_estudo": r.get::<_, i64>(1)? != 0,
                    "minutos": r.get::<_, i64>(2)?,
                }))
            })?
            .collect::<Result<Vec<_>, _>>()
        })
        .unwrap_or_default();

    let por_curso = conn
        .prepare(
            "SELECT COALESCE(c.titulo, ?3),
                    SUM(COALESCE(e.ended_at, ?2) - e.started_at) / 60000
               FROM time_entries e
               JOIN activity_types a ON a.id = e.activity_type_id
               LEFT JOIN courses c ON c.id = e.course_id
              WHERE e.deleted_at IS NULL AND a.conta_como_estudo = 1
                AND e.started_at < ?2 AND COALESCE(e.ended_at, ?2) > ?1
              GROUP BY e.course_id ORDER BY 2 DESC",
        )
        .and_then(|mut s| {
            s.query_map(params![desde, ate, "Sem curso"], |r| {
                Ok(serde_json::json!({
                    "curso": r.get::<_, String>(0)?,
                    "minutos": r.get::<_, i64>(1)?,
                }))
            })?
            .collect::<Result<Vec<_>, _>>()
        })
        .unwrap_or_default();

    serde_json::json!({
        "desde": desde,
        "ate": ate,
        "por_atividade": por_atividade,
        "por_curso": por_curso,
    })
}

// --- dividir, unir e duplicar (§3.5) -----------------------------------------

/// Duplica um lançamento logo depois do original, com a mesma duração.
///
/// Colar em seguida e não "agora" é deliberado: o caso real é registrar dois
/// blocos iguais e seguidos, e um lançamento que caísse no instante presente se
/// sobreporia ao cronômetro que talvez esteja rodando.
#[tauri::command]
pub fn duplicar_lancamento(db: tauri::State<Db>, id: String) -> Result<String, String> {
    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
    let novo = uuid::Uuid::new_v4().to_string();
    let agora = agora_ms();
    let n = conn
        .execute(
            "INSERT INTO time_entries
               (id, started_at, ended_at, activity_type_id, description, course_id,
                task_id, subject_id, source, device_id, version, created_at, updated_at)
             SELECT ?2,
                    ended_at,
                    ended_at + (ended_at - started_at),
                    activity_type_id, description, course_id, task_id, subject_id,
                    'manual', ?3, 1, ?4, ?4
               FROM time_entries
              WHERE id = ?1 AND deleted_at IS NULL AND ended_at IS NOT NULL",
            params![id, novo, db.device_id, agora],
        )
        .map_err(|e| e.to_string())?;
    if n == 0 {
        return Err("só dá para duplicar um lançamento já encerrado".into());
    }
    Ok(novo)
}

/// Corta um lançamento em dois no instante `em`.
///
/// As duas metades são linhas novas e o original é excluído logicamente, em vez
/// de encolher o original e criar uma segunda. Assim `session_revisions` guarda
/// um estado anterior íntegro: desfazer é restaurar uma linha, não remontar
/// duas.
#[tauri::command]
pub fn dividir_lancamento(
    db: tauri::State<Db>,
    id: String,
    em: i64,
) -> Result<Vec<String>, String> {
    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
    let (inicio, fim): (i64, Option<i64>) = conn
        .query_row(
            "SELECT started_at, ended_at FROM time_entries
              WHERE id = ?1 AND deleted_at IS NULL",
            params![id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|_| "lançamento não encontrado".to_string())?;
    let fim = fim.ok_or("não dá para dividir um lançamento em aberto")?;

    if em <= inicio || em >= fim {
        return Err("o corte precisa cair dentro do lançamento".into());
    }

    registrar_revisao(&conn, &db.device_id, &id, "dividir")?;
    let agora = agora_ms();
    let mut ids = Vec::new();
    for (a, b) in [(inicio, em), (em, fim)] {
        let novo = uuid::Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO time_entries
               (id, started_at, ended_at, activity_type_id, description, course_id,
                task_id, subject_id, context, parent_id, source, device_id,
                version, created_at, updated_at)
             SELECT ?2, ?3, ?4, activity_type_id, description, course_id, task_id,
                    subject_id, context, parent_id, 'dividido', ?5, 1, ?6, ?6
               FROM time_entries WHERE id = ?1",
            params![id, novo, a, b, db.device_id, agora],
        )
        .map_err(|e| e.to_string())?;
        ids.push(novo);
    }

    conn.execute(
        "UPDATE time_entries SET deleted_at = ?2, updated_at = ?2, version = version + 1
          WHERE id = ?1",
        params![id, agora],
    )
    .map_err(|e| e.to_string())?;
    Ok(ids)
}

/// Junta lançamentos consecutivos compatíveis numa linha só.
///
/// Compatível é regra do domínio, não conveniência: mesma categoria e mesmo
/// curso. Unir categorias diferentes quebraria o total por atividade, que é a
/// pergunta central do Painel — então isto recusa em vez de adivinhar.
#[tauri::command]
pub fn unir_lancamentos(db: tauri::State<Db>, ids: Vec<String>) -> Result<String, String> {
    if ids.len() < 2 {
        return Err("selecione ao menos dois lançamentos".into());
    }
    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;

    struct L {
        id: String,
        inicio: i64,
        fim: Option<i64>,
        tipo: String,
        curso: Option<String>,
        descricao: Option<String>,
    }

    let mut linhas = Vec::new();
    for id in &ids {
        let l = conn
            .query_row(
                "SELECT id, started_at, ended_at, activity_type_id, course_id, description
                   FROM time_entries WHERE id = ?1 AND deleted_at IS NULL",
                params![id],
                |r| {
                    Ok(L {
                        id: r.get(0)?,
                        inicio: r.get(1)?,
                        fim: r.get(2)?,
                        tipo: r.get(3)?,
                        curso: r.get(4)?,
                        descricao: r.get(5)?,
                    })
                },
            )
            .map_err(|_| format!("lançamento {id} não encontrado"))?;
        if l.fim.is_none() {
            return Err("não dá para unir um lançamento em aberto".into());
        }
        linhas.push(l);
    }
    linhas.sort_by_key(|l| l.inicio);

    if linhas.iter().any(|l| l.tipo != linhas[0].tipo) {
        return Err("só dá para unir lançamentos da mesma categoria".into());
    }
    if linhas.iter().any(|l| l.curso != linhas[0].curso) {
        return Err("só dá para unir lançamentos do mesmo curso".into());
    }

    // O buraco entre um e outro entra no resultado: unir declara que aquele
    // período foi uma coisa só. Acima de meia hora é provável que não tenha
    // sido, e o app prefere recusar a inflar o total do dia em silêncio.
    const BURACO_MAXIMO: i64 = 30 * 60_000;
    for par in linhas.windows(2) {
        if par[1].inicio - par[0].fim.unwrap_or(0) > BURACO_MAXIMO {
            return Err("há mais de 30 minutos de intervalo entre eles".into());
        }
    }

    let agora = agora_ms();
    let novo = uuid::Uuid::new_v4().to_string();
    let descricao = linhas.iter().find_map(|l| l.descricao.clone());
    conn.execute(
        "INSERT INTO time_entries
           (id, started_at, ended_at, activity_type_id, description, course_id,
            source, device_id, version, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'unido', ?7, 1, ?8, ?8)",
        params![
            novo,
            linhas[0].inicio,
            linhas[linhas.len() - 1].fim,
            linhas[0].tipo,
            descricao,
            linhas[0].curso,
            db.device_id,
            agora
        ],
    )
    .map_err(|e| e.to_string())?;

    for l in &linhas {
        registrar_revisao(&conn, &db.device_id, &l.id, "unir")?;
        conn.execute(
            "UPDATE time_entries SET deleted_at = ?2, updated_at = ?2, version = version + 1
              WHERE id = ?1",
            params![l.id, agora],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(novo)
}

// --- combinações favoritas (§3.5) --------------------------------------------

#[derive(Serialize)]
pub struct Favorito {
    pub id: String,
    pub rotulo: String,
    pub descricao: Option<String>,
    pub activity_type_id: String,
    pub atividade: String,
    pub cor: String,
    pub course_id: Option<String>,
    pub curso: Option<String>,
    pub task_id: Option<String>,
}

#[tauri::command]
pub fn listar_favoritos(db: tauri::State<Db>) -> Result<Vec<Favorito>, String> {
    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
    let mut stmt = conn
        .prepare(
            "SELECT f.id, f.rotulo, f.descricao, f.activity_type_id, a.nome, a.cor,
                    f.course_id, c.titulo, f.task_id
               FROM time_favorites f
               JOIN activity_types a ON a.id = f.activity_type_id
               LEFT JOIN courses c ON c.id = f.course_id
              WHERE f.deleted_at IS NULL
              ORDER BY f.usos DESC, f.rotulo",
        )
        .map_err(|e| e.to_string())?;
    let v = stmt
        .query_map([], |r| {
            Ok(Favorito {
                id: r.get(0)?,
                rotulo: r.get(1)?,
                descricao: r.get(2)?,
                activity_type_id: r.get(3)?,
                atividade: r.get(4)?,
                cor: r.get(5)?,
                course_id: r.get(6)?,
                curso: r.get(7)?,
                task_id: r.get(8)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(v)
}

#[tauri::command]
pub fn criar_favorito(
    db: tauri::State<Db>,
    rotulo: String,
    descricao: Option<String>,
    activity_type_id: String,
    curso_id: Option<String>,
    tarefa_id: Option<String>,
) -> Result<String, String> {
    let rotulo = rotulo.trim().to_string();
    if rotulo.is_empty() {
        return Err("o favorito precisa de um nome".into());
    }
    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
    let id = uuid::Uuid::new_v4().to_string();
    let agora = agora_ms();
    conn.execute(
        "INSERT INTO time_favorites
           (id, rotulo, descricao, activity_type_id, course_id, task_id,
            device_id, version, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, ?8, ?8)",
        params![
            id,
            rotulo,
            descricao,
            activity_type_id,
            curso_id,
            tarefa_id,
            db.device_id,
            agora
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(id)
}

#[tauri::command]
pub fn excluir_favorito(db: tauri::State<Db>, id: String) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
    conn.execute(
        "UPDATE time_favorites SET deleted_at = ?2, updated_at = ?2, version = version + 1
          WHERE id = ?1",
        params![id, agora_ms()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Marca um favorito como usado. É o que ordena a lista pelo que o usuário
/// realmente aciona, em vez de pela ordem em que ele criou.
pub fn contar_uso(db: &Db, id: &str) {
    if let Ok(conn) = db.conn.lock() {
        let _ = conn.execute(
            "UPDATE time_favorites SET usos = usos + 1, updated_at = ?2, version = version + 1
              WHERE id = ?1",
            params![id, agora_ms()],
        );
    }
}

// --- atalhos de teclado (§3.5) -----------------------------------------------

/// Os atalhos são do app, não do sistema: registrar combinação global
/// sequestraria a tecla dentro do Chrome, que é justamente onde o usuário
/// estuda. Aqui só guardamos o mapa; quem escuta é a interface.
#[tauri::command]
pub fn atalhos_ler(db: tauri::State<Db>) -> Result<String, String> {
    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
    Ok(conn
        .query_row(
            "SELECT valor FROM settings WHERE chave = 'atalhos'",
            [],
            |r| r.get::<_, String>(0),
        )
        .unwrap_or_else(|_| "{}".into()))
}

#[tauri::command]
pub fn atalhos_salvar(db: tauri::State<Db>, mapa: String) -> Result<(), String> {
    // Recusa lixo antes de gravar: um JSON quebrado aqui deixaria o app sem
    // atalho nenhum na próxima abertura, sem dizer por quê.
    serde_json::from_str::<std::collections::BTreeMap<String, String>>(&mapa)
        .map_err(|e| format!("mapa de atalhos inválido: {e}"))?;
    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
    conn.execute(
        "INSERT INTO settings (chave, valor) VALUES ('atalhos', ?1)
         ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor",
        params![mapa],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod testes_sobreposicao {
    use super::{marcar_sobreposicao, Lancamento};

    fn l(inicio: i64, fim: Option<i64>) -> Lancamento {
        Lancamento {
            id: format!("e{inicio}"),
            started_at: inicio,
            ended_at: fim,
            activity_type_id: "at-estudo".into(),
            atividade: "Estudo".into(),
            cor: "#000".into(),
            cor_escura: None,
            conta_como_estudo: true,
            description: None,
            course_id: None,
            curso: None,
            source: "manual".into(),
            observacao: None,
            distancia_m: None,
            treino: None,
            icone: None,
            subject_id: None,
            materia: None,
            aula: None,
            context: None,
            sobrepoe: false,
        }
    }

    fn marcados(mut v: Vec<Lancamento>) -> Vec<bool> {
        marcar_sobreposicao(&mut v);
        v.iter().map(|x| x.sobrepoe).collect()
    }

    #[test]
    fn encostar_nao_e_sobrepor() {
        // Fim de um igual ao início do outro é o caso normal de sessões
        // seguidas. Marcar isso encheria a tela de alerta falso.
        assert_eq!(marcados(vec![l(0, Some(100)), l(100, Some(200))]), [false, false]);
    }

    #[test]
    fn os_dois_lados_sao_marcados() {
        assert_eq!(marcados(vec![l(0, Some(150)), l(100, Some(200))]), [true, true]);
    }

    #[test]
    fn contido_dentro_de_outro() {
        // A caminhada durante a pausa do Pomodoro: legítima, mas visível.
        assert_eq!(
            marcados(vec![l(0, Some(1000)), l(200, Some(300)), l(1000, Some(1100))]),
            [true, true, false],
            "o terceiro encosta no primeiro, não o invade"
        );
    }

    #[test]
    fn o_maior_fim_e_que_manda_e_nao_o_anterior() {
        // Sem guardar o fim mais distante, o terceiro seria comparado com o
        // segundo — que termina cedo — e a invasão do primeiro passaria batida.
        assert_eq!(
            marcados(vec![l(0, Some(9000)), l(10, Some(20)), l(5000, Some(6000))]),
            [true, true, true]
        );
    }

    #[test]
    fn lancamento_em_aberto_engole_o_que_vier_depois() {
        // Sem `ended_at`, o lançamento ainda está correndo: qualquer coisa que
        // comece depois dele está de fato sobreposta.
        assert_eq!(marcados(vec![l(0, None), l(500, Some(600))]), [true, true]);
    }

    #[test]
    fn lista_vazia_e_unica_nao_quebram() {
        assert_eq!(marcados(vec![]), Vec::<bool>::new());
        assert_eq!(marcados(vec![l(0, Some(10))]), [false]);
    }
}

// --- histórico: busca e filtros (§3.5) ---------------------------------------

#[derive(Serialize)]
pub struct Pagina {
    pub itens: Vec<Lancamento>,
    /// Quantos lançamentos o filtro encontrou ao todo, não quantos vieram nesta
    /// página. Sem isto a interface não teria como dizer "40 de 312".
    pub total: i64,
    /// Soma de **todos** os que casaram, não só da página. É a resposta para
    /// "quanto tempo isso deu", que é a pergunta real de quem filtra.
    pub total_ms: i64,
    pub estudo_ms: i64,
}

/// Registra um valor e devolve o marcador que o representa no SQL.
///
/// Todo dado do usuário entra por aqui. O que é concatenado na consulta são só
/// os marcadores — `?3`, `?4` — e os pedaços de cláusula escritos abaixo, à
/// vista. Texto do usuário nunca vira SQL.
fn marcador(vals: &mut Vec<rusqlite::types::Value>, v: rusqlite::types::Value) -> String {
    vals.push(v);
    format!("?{}", vals.len())
}

/// Histórico com busca e filtros.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn buscar_lancamentos(
    db: tauri::State<Db>,
    texto: Option<String>,
    desde: Option<i64>,
    ate: Option<i64>,
    curso_id: Option<String>,
    tipo_id: Option<String>,
    tarefa_id: Option<String>,
    materia_id: Option<String>,
    tag: Option<String>,
    limite: i64,
    deslocamento: i64,
) -> Result<Pagina, String> {
    let mut cond: Vec<String> = vec!["e.deleted_at IS NULL".into()];
    let mut vals: Vec<rusqlite::types::Value> = Vec::new();

    if let Some(t) = texto.as_deref().map(str::trim).filter(|t| !t.is_empty()) {
        // Procura também no nome do curso: buscar "blender" e não achar a
        // sessão que está *dentro* do curso de Blender seria uma surpresa ruim.
        let m = marcador(&mut vals, format!("%{t}%").into());
        cond.push(format!("(e.description LIKE {m} OR c.titulo LIKE {m})"));
    }
    if let Some(v) = desde {
        let m = marcador(&mut vals, v.into());
        cond.push(format!("e.started_at >= {m}"));
    }
    if let Some(v) = ate {
        let m = marcador(&mut vals, v.into());
        cond.push(format!("e.started_at < {m}"));
    }
    if let Some(v) = curso_id.filter(|s| !s.is_empty()) {
        let m = marcador(&mut vals, v.into());
        cond.push(format!("e.course_id = {m}"));
    }
    if let Some(v) = tipo_id.filter(|s| !s.is_empty()) {
        let m = marcador(&mut vals, v.into());
        cond.push(format!("e.activity_type_id = {m}"));
    }
    if let Some(v) = tarefa_id.filter(|s| !s.is_empty()) {
        let m = marcador(&mut vals, v.into());
        cond.push(format!("e.task_id = {m}"));
    }
    if let Some(v) = materia_id.filter(|s| !s.is_empty()) {
        let m = marcador(&mut vals, v.into());
        cond.push(format!("e.subject_id = {m}"));
    }
    if let Some(v) = tag.filter(|s| !s.is_empty()) {
        // Lançamento não tem etiqueta própria: a etiqueta é do curso. Filtrar
        // por tag é filtrar pelos cursos que a têm.
        let m = marcador(&mut vals, v.into());
        cond.push(format!(
            "e.course_id IN (SELECT course_id FROM course_tags WHERE tag = {m})"
        ));
    }

    let onde = cond.join(" AND ");
    let de = "FROM time_entries e
              JOIN activity_types a ON a.id = e.activity_type_id
              LEFT JOIN courses c ON c.id = e.course_id
              LEFT JOIN subjects s ON s.id = e.subject_id";

    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;

    let (total, total_ms, estudo_ms): (i64, i64, i64) = conn
        .query_row(
            &format!(
                "SELECT count(*),
                        COALESCE(SUM(COALESCE(e.ended_at, e.started_at) - e.started_at), 0),
                        COALESCE(SUM(CASE WHEN a.conta_como_estudo = 1
                                          THEN COALESCE(e.ended_at, e.started_at) - e.started_at
                                          ELSE 0 END), 0)
                   {de} WHERE {onde}"
            ),
            rusqlite::params_from_iter(vals.iter()),
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .map_err(|e| e.to_string())?;

    let mut pag = vals.clone();
    let m_lim = marcador(&mut pag, limite.clamp(1, 500).into());
    let m_off = marcador(&mut pag, deslocamento.max(0).into());

    let mut stmt = conn
        .prepare(&format!(
            "SELECT e.id, e.started_at, e.ended_at, e.activity_type_id, a.nome, a.cor,
                    a.cor_escura, a.conta_como_estudo, e.description, e.course_id,
                    c.titulo, e.source, e.observacao, e.distancia_m, e.treino, a.icone,
                    e.subject_id, s.nome, e.aula, e.context
               {de} WHERE {onde}
              ORDER BY e.started_at DESC
              LIMIT {m_lim} OFFSET {m_off}"
        ))
        .map_err(|e| e.to_string())?;

    let mut itens = stmt
        .query_map(rusqlite::params_from_iter(pag.iter()), |r| {
            Ok(Lancamento {
                id: r.get(0)?,
                started_at: r.get(1)?,
                ended_at: r.get(2)?,
                activity_type_id: r.get(3)?,
                atividade: r.get(4)?,
                cor: r.get(5)?,
                cor_escura: r.get(6)?,
                conta_como_estudo: r.get::<_, i64>(7)? != 0,
                description: r.get(8)?,
                course_id: r.get(9)?,
                curso: r.get(10)?,
                source: r.get(11)?,
                observacao: r.get(12)?,
                distancia_m: r.get(13)?,
                treino: r.get(14)?,
                icone: r.get(15)?,
                subject_id: r.get(16)?,
                materia: r.get(17)?,
                aula: r.get(18)?,
                context: r.get(19)?,
                sobrepoe: false,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    // A marcação de sobreposição espera ordem crescente; a lista sai
    // decrescente porque histórico se lê do mais recente para trás.
    itens.reverse();
    marcar_sobreposicao(&mut itens);
    itens.reverse();

    Ok(Pagina {
        itens,
        total,
        total_ms,
        estudo_ms,
    })
}

// --- observação, distância e treino (§3.5) -----------------------------------

/// Grava os campos opcionais do lançamento.
///
/// Comando separado de `editar_lancamento` de propósito. O calendário chama
/// `editar_lancamento` a cada arrasto, com só os campos que ele conhece —
/// se os extras entrassem lá, mover um bloco apagaria a distância da caminhada
/// sem que ninguém pedisse.
///
/// Nada aqui é obrigatório: §3.5 diz que nenhum campo além do tempo precisa
/// ser preenchido, e uma observação vazia é uma resposta legítima.
#[tauri::command]
pub fn salvar_detalhes(
    db: tauri::State<Db>,
    id: String,
    observacao: Option<String>,
    distancia_m: Option<i64>,
    treino: Option<String>,
) -> Result<(), String> {
    if let Some(d) = distancia_m {
        if d < 0 {
            return Err("a distância não pode ser negativa".into());
        }
    }
    let limpo = |s: Option<String>| s.map(|x| x.trim().to_string()).filter(|x| !x.is_empty());

    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
    registrar_revisao(&conn, &db.device_id, &id, "editar")?;
    conn.execute(
        "UPDATE time_entries
            SET observacao = ?2, distancia_m = ?3, treino = ?4,
                updated_at = ?5, version = version + 1
          WHERE id = ?1 AND deleted_at IS NULL",
        params![
            id,
            limpo(observacao),
            distancia_m,
            limpo(treino),
            agora_ms()
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Últimas atividades distintas, para a bandeja do sistema e para o início
/// rápido (§3.5).
///
/// Distintas por categoria + descrição: repetir "Academia" cinco vezes na
/// bandeja não daria cinco atalhos, daria um atalho e quatro linhas de ruído.
#[derive(Serialize, Clone)]
pub struct Recente {
    pub activity_type_id: String,
    pub atividade: String,
    pub descricao: Option<String>,
    pub course_id: Option<String>,
    pub cor: String,
    pub icone: Option<String>,
    pub quando: i64,
}

pub fn recentes_de(db: &Db, limite: i64) -> Vec<Recente> {
    let Ok(conn) = db.conn.lock() else {
        return Vec::new();
    };
    let Ok(mut stmt) = conn.prepare(
        "SELECT e.activity_type_id, a.nome, e.description, e.course_id, a.cor, a.icone,
                MAX(e.started_at)
           FROM time_entries e
           JOIN activity_types a ON a.id = e.activity_type_id
          WHERE e.deleted_at IS NULL AND e.ended_at IS NOT NULL
            AND COALESCE(e.context, '') <> 'pomodoro_break'
          GROUP BY e.activity_type_id, COALESCE(e.description, '')
          ORDER BY MAX(e.started_at) DESC
          LIMIT ?1",
    ) else {
        return Vec::new();
    };
    stmt.query_map(params![limite], |r| {
        Ok(Recente {
            activity_type_id: r.get(0)?,
            atividade: r.get(1)?,
            descricao: r.get(2)?,
            course_id: r.get(3)?,
            cor: r.get(4)?,
            icone: r.get(5)?,
            quando: r.get(6)?,
        })
    })
    .and_then(|it| it.collect::<Result<Vec<_>, _>>())
    .unwrap_or_default()
}

#[tauri::command]
pub fn listar_recentes(db: tauri::State<Db>, limite: i64) -> Result<Vec<Recente>, String> {
    Ok(recentes_de(&db, limite.clamp(1, 20)))
}

// --- matérias (§3.4, §3.5) ---------------------------------------------------

/// Matéria ou área de conhecimento. Existe ao lado do curso, não dentro dele:
/// "Modelagem 3D" atravessa dois cursos, e amarrá-la a um só perderia metade
/// do tempo na hora de somar.
#[derive(Serialize)]
pub struct Materia {
    pub id: String,
    pub nome: String,
    pub cor: Option<String>,
    /// Tempo já lançado nesta matéria. Sai da consulta e não de coluna
    /// guardada — total guardado desatualiza na primeira edição.
    pub total_ms: i64,
}

#[tauri::command]
pub fn listar_materias(db: tauri::State<Db>) -> Result<Vec<Materia>, String> {
    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
    let mut stmt = conn
        .prepare(
            "SELECT s.id, s.nome, s.cor,
                    COALESCE((SELECT SUM(e.ended_at - e.started_at)
                                FROM time_entries e
                               WHERE e.subject_id = s.id AND e.deleted_at IS NULL
                                 AND e.ended_at IS NOT NULL), 0)
               FROM subjects s
              WHERE s.deleted_at IS NULL
              ORDER BY s.nome",
        )
        .map_err(|e| e.to_string())?;
    let v = stmt
        .query_map([], |r| {
            Ok(Materia {
                id: r.get(0)?,
                nome: r.get(1)?,
                cor: r.get(2)?,
                total_ms: r.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(v)
}

#[tauri::command]
pub fn criar_materia(
    db: tauri::State<Db>,
    nome: String,
    cor: Option<String>,
) -> Result<String, String> {
    let nome = nome.trim().to_string();
    if nome.is_empty() {
        return Err("a matéria precisa de um nome".into());
    }
    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
    let id = uuid::Uuid::new_v4().to_string();
    let agora = agora_ms();
    conn.execute(
        "INSERT INTO subjects (id, nome, cor, device_id, version, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, 1, ?5, ?5)",
        params![id, nome, cor, db.device_id, agora],
    )
    .map_err(|e| e.to_string())?;
    Ok(id)
}

#[tauri::command]
pub fn editar_materia(
    db: tauri::State<Db>,
    id: String,
    nome: String,
    cor: Option<String>,
) -> Result<(), String> {
    let nome = nome.trim().to_string();
    if nome.is_empty() {
        return Err("a matéria precisa de um nome".into());
    }
    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
    conn.execute(
        "UPDATE subjects SET nome = ?2, cor = ?3, updated_at = ?4, version = version + 1
          WHERE id = ?1 AND deleted_at IS NULL",
        params![id, nome, cor, agora_ms()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Exclusão lógica, e os lançamentos ficam. Apagar a matéria não pode apagar o
/// tempo que foi gasto nela — só a etiqueta.
#[tauri::command]
pub fn excluir_materia(db: tauri::State<Db>, id: String) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
    conn.execute(
        "UPDATE subjects SET deleted_at = ?2, updated_at = ?2, version = version + 1
          WHERE id = ?1",
        params![id, agora_ms()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Troca só a categoria de um lançamento, preservando tudo o mais.
///
/// É o "trocar o tipo da pausa sem perder o vínculo com o Pomodoro" de §3.4.
/// `editar_lancamento` exigiria início e fim, e passá-los de novo abriria
/// espaço para o chamador reenviar valores velhos; aqui não há como errar,
/// porque não há o que reenviar. `context` e `parent_id` nem são mencionados.
#[tauri::command]
pub fn reclassificar_lancamento(
    db: tauri::State<Db>,
    id: String,
    activity_type_id: String,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
    registrar_revisao(&conn, &db.device_id, &id, "editar")?;
    let n = conn
        .execute(
            "UPDATE time_entries SET activity_type_id = ?2, updated_at = ?3,
                                     version = version + 1
              WHERE id = ?1 AND deleted_at IS NULL",
            params![id, activity_type_id, agora_ms()],
        )
        .map_err(|e| e.to_string())?;
    if n == 0 {
        return Err("lançamento não encontrado".into());
    }
    Ok(())
}

/// Grava matéria e aula de um lançamento já fechado.
///
/// Separado de `salvar_detalhes` pela mesma razão que aquele é separado de
/// `editar_lancamento`: cada tela manda o que conhece, e nenhuma apaga o que
/// não conhece.
#[tauri::command]
pub fn salvar_vinculos(
    db: tauri::State<Db>,
    id: String,
    subject_id: Option<String>,
    aula: Option<String>,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
    registrar_revisao(&conn, &db.device_id, &id, "editar")?;
    conn.execute(
        "UPDATE time_entries SET subject_id = ?2, aula = ?3, updated_at = ?4,
                                 version = version + 1
          WHERE id = ?1 AND deleted_at IS NULL",
        params![
            id,
            subject_id.filter(|s| !s.is_empty()),
            aula.map(|a| a.trim().to_string()).filter(|a| !a.is_empty()),
            agora_ms()
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
