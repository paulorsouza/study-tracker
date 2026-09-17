//! Podcasts (D-046).
//!
//! O app não toca áudio — quem toca é o AntennaPod, no celular. O que ele não
//! resolve é o que este app já resolve para curso e tarefa: decidir o que ouvir
//! e saber quanto tempo foi. Por isso o episódio planejado **vira tarefa**, com
//! `episodio_id` preenchido, em vez de virar uma agenda paralela: cronômetro,
//! metas do dia, Painel e sincronização continuam lendo o que já liam.
//!
//! A assinatura entra por **OPML**, exportado do AntennaPod em Configurações →
//! Importar/Exportar. Não existe API pública para ler de lá o que já foi
//! ouvido, e fingir uma sincronização que não existe seria pior do que a
//! importação manual, que é honesta sobre o que faz.

use crate::db::{agora_ms, Db};
use chrono::DateTime;
use quick_xml::events::Event;
use quick_xml::Reader;
use rusqlite::params;
use serde::Serialize;
use sha2::{Digest, Sha256};

/// Quantos episódios de cada feed entram. Feed antigo traz centenas, e o que
/// interessa para planejar a semana está no topo.
const POR_FEED: usize = 30;

#[derive(Serialize, Clone, Debug)]
pub struct Podcast {
    pub id: String,
    pub titulo: String,
    pub feed_url: String,
    pub site: Option<String>,
    pub activity_type_id: Option<String>,
    pub atividade: Option<String>,
    pub cor: Option<String>,
    pub conta_como_estudo: bool,
    pub ativo: bool,
    pub atualizado_em: Option<i64>,
    pub novos: i64,
}

#[derive(Serialize, Clone, Debug)]
pub struct Episodio {
    pub id: String,
    pub podcast_id: String,
    pub podcast: String,
    pub titulo: String,
    pub url: Option<String>,
    pub publicado_em: Option<i64>,
    pub duracao_s: Option<i64>,
    pub estado: String,
    pub dia_planejado: Option<String>,
    pub cor: Option<String>,
}

/// Id derivado do feed e do guid: reimportar o mesmo episódio não cria outro,
/// e duas máquinas chegam ao mesmo id — a mesma ideia das rotinas (D-044).
fn id_derivado(semente: &str) -> String {
    let bytes = Sha256::digest(semente.as_bytes());
    let h: String = bytes.iter().map(|b| format!("{b:02x}")).collect();
    format!("{}-{}-{}-{}-{}", &h[0..8], &h[8..12], &h[12..16], &h[16..20], &h[20..32])
}

// --- OPML --------------------------------------------------------------------

/// Um `<outline>` com `xmlUrl` é uma assinatura; o resto da árvore é pasta e
/// não interessa aqui.
fn feeds_do_opml(xml: &str) -> Vec<(String, String, Option<String>)> {
    let mut leitor = Reader::from_str(xml);
    leitor.config_mut().trim_text(true);
    let mut saida = Vec::new();
    let mut buf = Vec::new();

    loop {
        match leitor.read_event_into(&mut buf) {
            Ok(Event::Empty(e)) | Ok(Event::Start(e)) if e.name().as_ref() == "outline" => {
                let mut feed = None;
                let mut titulo = None;
                let mut site = None;
                for a in e.attributes().flatten() {
                    let valor = a.unescape_value().unwrap_or_default().to_string();
                    match a.key.as_ref() {
                        "xmlUrl" => feed = Some(valor),
                        "text" | "title" => titulo = titulo.or(Some(valor)),
                        "htmlUrl" => site = Some(valor),
                        _ => {}
                    }
                }
                if let Some(f) = feed {
                    let t = titulo.unwrap_or_else(|| f.clone());
                    saida.push((t, f, site));
                }
            }
            Ok(Event::Eof) | Err(_) => break,
            _ => {}
        }
        buf.clear();
    }
    saida
}

#[derive(Serialize)]
pub struct Importacao {
    pub novos: usize,
    pub ja_tinha: usize,
}

#[tauri::command]
pub async fn podcasts_importar_opml(
    db: tauri::State<'_, Db>,
    caminho: String,
) -> Result<Importacao, String> {
    let xml = std::fs::read_to_string(&caminho)
        .map_err(|e| format!("não consegui ler o arquivo: {e}"))?;
    let feeds = feeds_do_opml(&xml);
    if feeds.is_empty() {
        return Err("nenhuma assinatura encontrada no arquivo".into());
    }

    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
    let agora = agora_ms();
    let mut r = Importacao { novos: 0, ja_tinha: 0 };

    for (titulo, feed, site) in feeds {
        let existe: bool = conn
            .query_row(
                "SELECT EXISTS (SELECT 1 FROM podcasts WHERE feed_url = ?1 AND deleted_at IS NULL)",
                params![feed],
                |x| x.get(0),
            )
            .unwrap_or(false);
        if existe {
            r.ja_tinha += 1;
            continue;
        }
        conn.execute(
            "INSERT INTO podcasts (id, titulo, feed_url, site, ativo, device_id, version,
                                   created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, 1, ?5, 1, ?6, ?6)",
            params![id_derivado(&feed), titulo, feed, site, db.device_id, agora],
        )
        .map_err(|e| e.to_string())?;
        r.novos += 1;
    }
    Ok(r)
}

// --- feeds -------------------------------------------------------------------

struct ItemFeed {
    titulo: String,
    guid: String,
    url: Option<String>,
    publicado_em: Option<i64>,
    duracao_s: Option<i64>,
}

/// "1:02:33", "45:10" ou segundos puros — os três aparecem em `itunes:duration`.
fn duracao_para_s(t: &str) -> Option<i64> {
    let t = t.trim();
    if t.is_empty() {
        return None;
    }
    if !t.contains(':') {
        return t.parse().ok();
    }
    let mut total = 0i64;
    for parte in t.split(':') {
        total = total * 60 + parte.trim().parse::<i64>().ok()?;
    }
    Some(total)
}

/// `&amp;` e `&#237;` chegam como evento próprio, fora do texto. Sem resolver,
/// o título perde pedaços — "Renda fixa &amp; cía" virava "Renda fixaca".
fn entidade(nome: &str) -> String {
    if let Some(num) = nome.strip_prefix('#') {
        let (base, digitos) = match num.strip_prefix(['x', 'X']) {
            Some(hex) => (16, hex),
            None => (10, num),
        };
        return u32::from_str_radix(digitos, base)
            .ok()
            .and_then(char::from_u32)
            .map(String::from)
            .unwrap_or_default();
    }
    match nome {
        "amp" => "&",
        "lt" => "<",
        "gt" => ">",
        "quot" => "\"",
        "apos" => "'",
        _ => "",
    }
    .to_string()
}

fn itens_do_rss(xml: &str) -> Vec<ItemFeed> {
    let mut leitor = Reader::from_str(xml);
    // Sem aparar: o espaço em volta da entidade faz parte do título. A limpeza
    // acontece no fim, quando o item fecha.
    leitor.config_mut().trim_text(false);
    let mut buf = Vec::new();
    let mut itens = Vec::new();

    let mut dentro = false;
    let mut campo: Option<String> = None;
    let (mut titulo, mut guid, mut link, mut data, mut duracao) =
        (String::new(), String::new(), None, None, None);

    loop {
        match leitor.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => {
                let nome = e.name().as_ref().to_string();
                if nome == "item" {
                    dentro = true;
                    titulo.clear();
                    guid.clear();
                    link = None;
                    data = None;
                    duracao = None;
                } else if dentro {
                    campo = Some(nome);
                }
            }
            Ok(Event::Empty(e)) if dentro && e.name().as_ref() == "enclosure" => {
                for a in e.attributes().flatten() {
                    if a.key.as_ref() == "url" {
                        link = Some(a.unescape_value().unwrap_or_default().to_string());
                    }
                }
            }
            Ok(Event::GeneralRef(r)) if dentro => {
                let resolvida = entidade(r.as_ref());
                match campo.as_deref() {
                    Some("title") => titulo.push_str(&resolvida),
                    Some("guid") => guid.push_str(&resolvida),
                    _ => {}
                }
            }
            Ok(Event::Text(t)) if dentro => {
                let valor = quick_xml::escape::unescape(t.as_ref())
                    .unwrap_or_else(|_| t.as_ref().into())
                    .to_string();
                match campo.as_deref() {
                    Some("title") => titulo.push_str(&valor),
                    Some("guid") => guid.push_str(&valor),
                    Some("pubDate") => {
                        data = DateTime::parse_from_rfc2822(valor.trim())
                            .ok()
                            .map(|d| d.timestamp_millis())
                    }
                    Some("itunes:duration") => duracao = duracao_para_s(&valor),
                    _ => {}
                }
            }
            Ok(Event::End(e)) => {
                if e.name().as_ref() == "item" {
                    dentro = false;
                    let limpo = titulo.trim().to_string();
                    let guid_limpo = guid.trim().to_string();
                    if !limpo.is_empty() {
                        itens.push(ItemFeed {
                            titulo: limpo.clone(),
                            // Feed sem guid existe: o endereço do áudio, ou o
                            // próprio título, servem de identidade.
                            guid: if guid_limpo.is_empty() {
                                link.clone().unwrap_or_else(|| limpo.clone())
                            } else {
                                guid_limpo
                            },
                            url: link.clone(),
                            publicado_em: data,
                            duracao_s: duracao,
                        });
                    }
                    if itens.len() >= POR_FEED {
                        break;
                    }
                }
                campo = None;
            }
            Ok(Event::Eof) | Err(_) => break,
            _ => {}
        }
        buf.clear();
    }
    itens
}

#[derive(Serialize)]
pub struct Atualizacao {
    pub feeds: usize,
    pub episodios_novos: usize,
    pub erros: Vec<String>,
}

#[tauri::command]
pub async fn podcasts_atualizar(db: tauri::State<'_, Db>) -> Result<Atualizacao, String> {
    let assinaturas: Vec<(String, String, String)> = {
        let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
        let mut stmt = conn
            .prepare(
                "SELECT id, titulo, feed_url FROM podcasts
                  WHERE ativo = 1 AND deleted_at IS NULL ORDER BY titulo",
            )
            .map_err(|e| e.to_string())?;
        let v = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        v
    };

    let mut r = Atualizacao { feeds: 0, episodios_novos: 0, erros: Vec::new() };
    let cliente = crate::rede::cliente();

    for (id, titulo, feed) in assinaturas {
        // Um feed fora do ar não pode derrubar a atualização dos outros.
        let resposta = match cliente
            .get(&feed)
            .timeout(std::time::Duration::from_secs(20))
            .send()
            .await
        {
            Ok(x) => x,
            Err(e) => {
                r.erros.push(format!("{titulo}: {e}"));
                continue;
            }
        };
        if !resposta.status().is_success() {
            r.erros.push(format!("{titulo}: respondeu {}", resposta.status()));
            continue;
        }
        let xml = match resposta.text().await {
            Ok(x) => x,
            Err(e) => {
                r.erros.push(format!("{titulo}: {e}"));
                continue;
            }
        };

        let itens = itens_do_rss(&xml);
        let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
        let agora = agora_ms();
        for it in itens {
            let ep_id = id_derivado(&format!("{feed}|{}", it.guid));
            let n = conn
                .execute(
                    "INSERT OR IGNORE INTO episodios
                       (id, podcast_id, titulo, guid, url, publicado_em, duracao_s, estado,
                        device_id, version, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'novo', ?8, 1, ?9, ?9)",
                    params![
                        ep_id, id, it.titulo, it.guid, it.url, it.publicado_em,
                        it.duracao_s, db.device_id, agora
                    ],
                )
                .map_err(|e| e.to_string())?;
            r.episodios_novos += n;
        }
        conn.execute(
            "UPDATE podcasts SET atualizado_em = ?2 WHERE id = ?1",
            params![id, agora],
        )
        .map_err(|e| e.to_string())?;
        r.feeds += 1;
    }
    Ok(r)
}

// --- leitura -----------------------------------------------------------------

#[tauri::command]
pub fn listar_podcasts(db: tauri::State<Db>) -> Result<Vec<Podcast>, String> {
    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
    let mut stmt = conn
        .prepare(
            "SELECT p.id, p.titulo, p.feed_url, p.site, p.activity_type_id, a.nome, a.cor,
                    COALESCE(a.conta_como_estudo, 0), p.ativo, p.atualizado_em,
                    (SELECT count(*) FROM episodios e
                      WHERE e.podcast_id = p.id AND e.estado = 'novo' AND e.deleted_at IS NULL)
               FROM podcasts p
               LEFT JOIN activity_types a ON a.id = p.activity_type_id
              WHERE p.deleted_at IS NULL
              ORDER BY p.titulo",
        )
        .map_err(|e| e.to_string())?;
    let v = stmt
        .query_map([], |r| {
            Ok(Podcast {
                id: r.get(0)?,
                titulo: r.get(1)?,
                feed_url: r.get(2)?,
                site: r.get(3)?,
                activity_type_id: r.get(4)?,
                atividade: r.get(5)?,
                cor: r.get(6)?,
                conta_como_estudo: r.get::<_, i64>(7)? == 1,
                ativo: r.get::<_, i64>(8)? == 1,
                atualizado_em: r.get(9)?,
                novos: r.get(10)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(v)
}

#[tauri::command]
pub fn listar_episodios(
    db: tauri::State<Db>,
    estado: Option<String>,
    podcast_id: Option<String>,
) -> Result<Vec<Episodio>, String> {
    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
    let mut stmt = conn
        .prepare(
            "SELECT e.id, e.podcast_id, p.titulo, e.titulo, e.url, e.publicado_em, e.duracao_s,
                    e.estado, e.dia_planejado, a.cor
               FROM episodios e
               JOIN podcasts p ON p.id = e.podcast_id
               LEFT JOIN activity_types a ON a.id = p.activity_type_id
              WHERE e.deleted_at IS NULL
                AND (?1 IS NULL OR e.estado = ?1)
                AND (?2 IS NULL OR e.podcast_id = ?2)
              ORDER BY COALESCE(e.publicado_em, 0) DESC
              LIMIT 200",
        )
        .map_err(|e| e.to_string())?;
    let v = stmt
        .query_map(params![estado, podcast_id], |r| {
            Ok(Episodio {
                id: r.get(0)?,
                podcast_id: r.get(1)?,
                podcast: r.get(2)?,
                titulo: r.get(3)?,
                url: r.get(4)?,
                publicado_em: r.get(5)?,
                duracao_s: r.get(6)?,
                estado: r.get(7)?,
                dia_planejado: r.get(8)?,
                cor: r.get(9)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(v)
}

// --- escrita -----------------------------------------------------------------

#[tauri::command]
pub fn podcast_categoria(
    db: tauri::State<Db>,
    id: String,
    activity_type_id: Option<String>,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
    conn.execute(
        "UPDATE podcasts SET activity_type_id = ?2, updated_at = ?3, version = version + 1
          WHERE id = ?1",
        params![id, activity_type_id, agora_ms()],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn excluir_podcast(db: tauri::State<Db>, id: String) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
    let agora = agora_ms();
    conn.execute(
        "UPDATE episodios SET deleted_at = ?2, updated_at = ?2, version = version + 1
          WHERE podcast_id = ?1 AND deleted_at IS NULL",
        params![id, agora],
    )
    .map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE podcasts SET deleted_at = ?2, updated_at = ?2, version = version + 1
          WHERE id = ?1",
        params![id, agora],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Muda o estado do episódio. Marcar como ouvido fecha também a tarefa que
/// tiver nascido dele — senão o dia continuaria cobrando o que já foi ouvido.
#[tauri::command]
pub fn episodio_estado(db: tauri::State<Db>, id: String, estado: String) -> Result<(), String> {
    if !matches!(estado.as_str(), "novo" | "fila" | "ouvido" | "pulado") {
        return Err(format!("estado inválido: {estado}"));
    }
    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
    let agora = agora_ms();
    let ouvido = (estado == "ouvido").then_some(agora);

    conn.execute(
        "UPDATE episodios SET estado = ?2, ouvido_em = ?3, updated_at = ?4,
                              version = version + 1
          WHERE id = ?1",
        params![id, estado, ouvido, agora],
    )
    .map_err(|e| e.to_string())?;

    if estado == "ouvido" {
        conn.execute(
            "UPDATE tasks SET estado = 'concluida', concluida_em = ?2, updated_at = ?2,
                              version = version + 1
              WHERE episodio_id = ?1 AND estado = 'aberta' AND deleted_at IS NULL",
            params![id, agora],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Põe o episódio no plano de um dia: vira tarefa, com a duração do áudio como
/// estimativa e a categoria do podcast. Daí em diante é tarefa como as outras —
/// o play dela liga o cronômetro, e o tempo entra nos números do dia.
#[tauri::command]
pub fn planejar_episodio(
    db: tauri::State<Db>,
    id: String,
    dia: Option<String>,
) -> Result<String, String> {
    let conn = db.conn.lock().map_err(|_| "banco ocupado")?;
    let (podcast_id, titulo, duracao): (String, String, Option<i64>) = conn
        .query_row(
            "SELECT podcast_id, titulo, duracao_s FROM episodios WHERE id = ?1",
            params![id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .map_err(|_| "episódio não encontrado")?;
    let (podcast, categoria): (String, Option<String>) = conn
        .query_row(
            "SELECT titulo, activity_type_id FROM podcasts WHERE id = ?1",
            params![podcast_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|e| e.to_string())?;

    let agora = agora_ms();
    let tarefa_id = id_derivado(&format!("episodio:{id}"));
    let ordem: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(ordem), -1) + 1 FROM tasks
              WHERE deleted_at IS NULL AND dia_planejado IS ?1",
            params![dia],
            |r| r.get(0),
        )
        .unwrap_or(0);

    conn.execute(
        "INSERT INTO tasks
           (id, titulo, activity_type_id, episodio_id, duracao_estimada_min, prioridade,
            dia_planejado, ordem, estado, device_id, version, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, ?7, 'aberta', ?8, 1, ?9, ?9)
         ON CONFLICT(id) DO UPDATE SET dia_planejado = excluded.dia_planejado,
                                       estado = 'aberta', deleted_at = NULL,
                                       updated_at = excluded.updated_at,
                                       version = version + 1",
        params![
            tarefa_id,
            format!("{podcast} — {titulo}"),
            categoria,
            id,
            duracao.map(|s| (s + 59) / 60),
            dia,
            ordem,
            db.device_id,
            agora
        ],
    )
    .map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE episodios SET estado = 'fila', dia_planejado = ?2, updated_at = ?3,
                              version = version + 1
          WHERE id = ?1",
        params![id, dia, agora],
    )
    .map_err(|e| e.to_string())?;

    Ok(tarefa_id)
}


#[cfg(test)]
mod testes {
    use super::*;

    /// OPML do AntennaPod: as assinaturas vêm como `outline` com `xmlUrl`,
    /// dentro de uma árvore que pode ter pastas.
    #[test]
    fn le_opml_do_antennapod() {
        let xml = r#"<?xml version="1.0" encoding="UTF-8"?>
        <opml version="2.0">
          <head><title>AntennaPod Subscriptions</title></head>
          <body>
            <outline text="Notícias">
              <outline type="rss" text="Stock Pickers" xmlUrl="https://a/feed.xml"
                       htmlUrl="https://a" />
            </outline>
            <outline type="rss" title="Market Makers" xmlUrl="https://b/feed.xml" />
          </body>
        </opml>"#;

        let feeds = feeds_do_opml(xml);
        assert_eq!(feeds.len(), 2);
        assert_eq!(feeds[0].0, "Stock Pickers");
        assert_eq!(feeds[0].1, "https://a/feed.xml");
        assert_eq!(feeds[0].2.as_deref(), Some("https://a"));
        assert_eq!(feeds[1].0, "Market Makers");
    }

    #[test]
    fn le_itens_do_rss() {
        let xml = r#"<?xml version="1.0"?>
        <rss xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
          <channel>
            <title>Programa</title>
            <item>
              <title>Renda fixa &amp; c&#237;a</title>
              <guid isPermaLink="false">ep-1</guid>
              <pubDate>Wed, 16 Sep 2026 10:00:00 -0300</pubDate>
              <itunes:duration>1:02:33</itunes:duration>
              <enclosure url="https://a/ep1.mp3" type="audio/mpeg" length="1" />
            </item>
            <item>
              <title>Sem guid e em segundos</title>
              <pubDate>Tue, 15 Sep 2026 10:00:00 -0300</pubDate>
              <itunes:duration>2700</itunes:duration>
              <enclosure url="https://a/ep2.mp3" type="audio/mpeg" length="1" />
            </item>
          </channel>
        </rss>"#;

        let itens = itens_do_rss(xml);
        assert_eq!(itens.len(), 2);
        // A entidade do XML precisa chegar decodificada ao título.
        assert_eq!(itens[0].titulo, "Renda fixa & cía");
        assert_eq!(itens[0].guid, "ep-1");
        assert_eq!(itens[0].duracao_s, Some(3753));
        assert!(itens[0].publicado_em.unwrap() > 0);
        // Sem guid, a identidade é o endereço do áudio.
        assert_eq!(itens[1].guid, "https://a/ep2.mp3");
        assert_eq!(itens[1].duracao_s, Some(2700));
    }

    /// Mesmo episódio, mesmo id: é o que impede duplicata ao reimportar e entre
    /// máquinas.
    #[test]
    fn id_do_episodio_e_estavel() {
        let a = id_derivado("https://a/feed.xml|ep-1");
        let b = id_derivado("https://a/feed.xml|ep-1");
        let c = id_derivado("https://a/feed.xml|ep-2");
        assert_eq!(a, b);
        assert_ne!(a, c);
        assert_eq!(a.len(), 36);
    }

    #[test]
    fn duracao_em_tres_formatos() {
        assert_eq!(duracao_para_s("45:10"), Some(2710));
        assert_eq!(duracao_para_s("1:02:33"), Some(3753));
        assert_eq!(duracao_para_s("900"), Some(900));
        assert_eq!(duracao_para_s(""), None);
    }
}
