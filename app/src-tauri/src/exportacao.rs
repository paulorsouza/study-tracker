//! Exportação dos dados do usuário (§3.1).
//!
//! Isto **não** é a exportação de relatórios cortada em D-030. Aquela recortava
//! um período para levar a uma planilha; esta é o direito de ter os próprios
//! dados de volta: leva tudo, sem recorte, sem filtro, num formato que outro
//! programa consegue ler.
//!
//! Por isso a saída é o banco inteiro em JSON, tabela por tabela, e não uma
//! seleção do que hoje parece importante — o que parece importante muda, e um
//! arquivo de resgate que já vem podado não resgata nada.

use crate::db::Db;
use serde::Serialize;
use std::io::Write;

/// Tabelas que saem. Lista fechada, e é ela que autoriza o nome a entrar na
/// consulta — nome de tabela não é parâmetro em SQL.
///
/// `sync_operations` fica de fora de propósito: é fila de transporte, não dado
/// do usuário. Tudo que está lá já está nas tabelas de origem, e incluí-la
/// dobraria o arquivo com uma cópia em outro formato.
const TABELAS: &[&str] = &[
    "settings",
    "activity_types",
    "activity_goals",
    "subjects",
    "platforms",
    "courses",
    "course_tags",
    "tasks",
    "time_entries",
    "notes",
    "note_tags",
    "time_favorites",
    "session_revisions",
    "open_intervals",
    "audit_events",
];

#[derive(Serialize)]
pub struct Resumo {
    pub caminho: String,
    pub bytes: u64,
    /// Quantas linhas saíram de cada tabela. É o recibo: sem ele, o usuário
    /// teria de abrir um JSON de megabytes para saber se levou tudo.
    pub linhas: Vec<(String, i64)>,
}

/// Uma tabela inteira como vetor de objetos JSON.
///
/// Passa por `json_object` do próprio SQLite em vez de montar o JSON no Rust:
/// assim a exportação não precisa conhecer as colunas, e uma migração futura
/// que acrescente campo entra no arquivo sozinha, sem ninguém lembrar.
fn tabela_json(
    conn: &rusqlite::Connection,
    tabela: &str,
) -> Result<(Vec<String>, i64), String> {
    let existe: i64 = conn
        .query_row(
            "SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
            rusqlite::params![tabela],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if existe == 0 {
        return Ok((Vec::new(), 0));
    }

    let mut stmt = conn
        .prepare(&format!(
            "SELECT json_object({}) FROM \"{tabela}\"",
            colunas_json(conn, tabela)?
        ))
        .map_err(|e| format!("{tabela}: {e}"))?;
    let linhas = stmt
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(|e| format!("{tabela}: {e}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("{tabela}: {e}"))?;
    let n = linhas.len() as i64;
    Ok((linhas, n))
}

/// Monta `'coluna', "coluna", ...` a partir do próprio esquema.
fn colunas_json(conn: &rusqlite::Connection, tabela: &str) -> Result<String, String> {
    let mut stmt = conn
        .prepare(&format!("PRAGMA table_info(\"{tabela}\")"))
        .map_err(|e| e.to_string())?;
    let nomes = stmt
        .query_map([], |r| r.get::<_, String>(1))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    if nomes.is_empty() {
        return Err(format!("{tabela} não tem colunas"));
    }
    Ok(nomes
        .iter()
        .map(|c| format!("'{c}', \"{c}\""))
        .collect::<Vec<_>>()
        .join(", "))
}

/// Escreve o arquivo em fluxo, uma linha por vez.
///
/// Montar o JSON inteiro em memória antes de gravar funcionaria hoje e falharia
/// no ano em que o histórico ficar grande — e é justamente aí que alguém
/// exporta os dados.
#[tauri::command]
pub fn exportar_dados(db: tauri::State<Db>, caminho: String) -> Result<Resumo, String> {
    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;

    let arquivo = std::fs::File::create(&caminho)
        .map_err(|e| format!("não consegui criar o arquivo: {e}"))?;
    let mut w = std::io::BufWriter::new(arquivo);
    let linhas = escrever(&conn, &db.device_id, &mut w)?;
    w.flush().map_err(|e| e.to_string())?;

    let bytes = std::fs::metadata(&caminho).map(|m| m.len()).unwrap_or(0);
    Ok(Resumo {
        caminho,
        bytes,
        linhas,
    })
}

/// A montagem do arquivo, separada do comando para poder ser testada.
///
/// O JSON é escrito à mão, com as vírgulas contadas no laço — e vírgula contada
/// à mão é o que quebra numa tabela vazia ou na última da lista. Por isso existe
/// um teste que lê o arquivo inteiro de volta.
fn escrever(
    conn: &rusqlite::Connection,
    device_id: &str,
    w: &mut impl Write,
) -> Result<Vec<(String, i64)>, String> {
    let versao: i64 = conn
        .query_row("SELECT COALESCE(MAX(rowid), 0) FROM schema_migrations", [], |r| {
            r.get(0)
        })
        .unwrap_or(0);

    writeln!(w, "{{").map_err(|e| e.to_string())?;
    writeln!(
        w,
        "  \"exportado_em\": {}, \"migracoes_aplicadas\": {versao}, \"device_id\": {},",
        crate::db::agora_ms(),
        serde_json::json!(device_id)
    )
    .map_err(|e| e.to_string())?;
    writeln!(w, "  \"tabelas\": {{").map_err(|e| e.to_string())?;

    let mut contagem = Vec::new();
    for (i, t) in TABELAS.iter().enumerate() {
        let (linhas, n) = tabela_json(conn, t)?;
        contagem.push((t.to_string(), n));
        write!(w, "    \"{t}\": [").map_err(|e| e.to_string())?;
        for (j, l) in linhas.iter().enumerate() {
            if j > 0 {
                write!(w, ",").map_err(|e| e.to_string())?;
            }
            write!(w, "\n      {l}").map_err(|e| e.to_string())?;
        }
        let virgula = if i + 1 < TABELAS.len() { "," } else { "" };
        writeln!(
            w,
            "{}]{virgula}",
            if linhas.is_empty() { "" } else { "\n    " }
        )
        .map_err(|e| e.to_string())?;
    }

    writeln!(w, "  }}\n}}").map_err(|e| e.to_string())?;
    Ok(contagem)
}

#[cfg(test)]
mod testes {
    use super::*;

    fn banco() -> rusqlite::Connection {
        let c = rusqlite::Connection::open_in_memory().unwrap();
        c.execute_batch(
            "CREATE TABLE courses (id TEXT PRIMARY KEY, titulo TEXT, favorito INTEGER);
             INSERT INTO courses VALUES ('c1', 'Blender', 1), ('c2', 'Aspas \" e \\ barra', 0);",
        )
        .unwrap();
        c
    }

    #[test]
    fn cada_linha_e_json_valido() {
        let c = banco();
        let (linhas, n) = tabela_json(&c, "courses").unwrap();
        assert_eq!(n, 2);
        for l in &linhas {
            let v: serde_json::Value = serde_json::from_str(l).expect("linha não é JSON");
            assert!(v.get("id").is_some());
        }
    }

    #[test]
    fn texto_com_aspas_sobrevive() {
        // O escape é do SQLite, não nosso. Se um dia deixar de ser, é aqui que
        // se descobre — e não abrindo o arquivo exportado seis meses depois.
        let c = banco();
        let (linhas, _) = tabela_json(&c, "courses").unwrap();
        let achou = linhas.iter().any(|l| {
            serde_json::from_str::<serde_json::Value>(l).unwrap()["titulo"]
                == "Aspas \" e \\ barra"
        });
        assert!(achou, "o título com aspas e barra não voltou intacto");
    }

    #[test]
    fn tabela_que_nao_existe_nao_derruba_a_exportacao() {
        // Banco de versão antiga não tem toda tabela da lista. Exportar tem de
        // funcionar mesmo assim: recusar tudo por causa de uma tabela ausente
        // deixaria o usuário sem os dados que ele tem.
        let c = banco();
        assert_eq!(tabela_json(&c, "nao_existe").unwrap(), (Vec::new(), 0));
    }

    #[test]
    fn o_arquivo_inteiro_e_json_valido() {
        // O teste que importa: as vírgulas são contadas no laço, e tabela vazia
        // ou última da lista são exatamente onde essa conta erra.
        let c = banco();
        let mut saida = Vec::new();
        let contagem = escrever(&c, "dispositivo-de-teste", &mut saida).unwrap();

        let texto = String::from_utf8(saida).unwrap();
        let v: serde_json::Value =
            serde_json::from_str(&texto).unwrap_or_else(|e| panic!("JSON inválido: {e}\n{texto}"));

        assert_eq!(v["device_id"], "dispositivo-de-teste");
        assert_eq!(v["tabelas"]["courses"].as_array().unwrap().len(), 2);

        // Tabelas ausentes viram vetor vazio, não somem: quem lê o arquivo não
        // deveria precisar adivinhar se a tabela não existia ou estava vazia.
        assert_eq!(v["tabelas"]["notes"].as_array().unwrap().len(), 0);
        assert_eq!(
            v["tabelas"].as_object().unwrap().len(),
            TABELAS.len(),
            "toda tabela da lista precisa aparecer no arquivo"
        );
        assert_eq!(contagem.len(), TABELAS.len());
    }

    #[test]
    fn banco_totalmente_vazio_ainda_gera_json_valido() {
        let c = rusqlite::Connection::open_in_memory().unwrap();
        let mut saida = Vec::new();
        escrever(&c, "d", &mut saida).unwrap();
        let texto = String::from_utf8(saida).unwrap();
        serde_json::from_str::<serde_json::Value>(&texto)
            .unwrap_or_else(|e| panic!("JSON inválido: {e}\n{texto}"));
    }
}
