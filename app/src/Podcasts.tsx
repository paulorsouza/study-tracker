import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import * as I from "./icones";
import { Tipo } from "./tempo-comum";

type Podcast = {
  id: string;
  titulo: string;
  feed_url: string;
  site: string | null;
  activity_type_id: string | null;
  atividade: string | null;
  cor: string | null;
  conta_como_estudo: boolean;
  ativo: boolean;
  atualizado_em: number | null;
  novos: number;
};

type Episodio = {
  id: string;
  podcast_id: string;
  podcast: string;
  titulo: string;
  url: string | null;
  publicado_em: number | null;
  duracao_s: number | null;
  estado: string;
  dia_planejado: string | null;
  cor: string | null;
};

type Aba = "novo" | "fila" | "ouvido" | "programas";

const ABAS: { id: Aba; nome: string }[] = [
  { id: "novo", nome: "Novos" },
  { id: "fila", nome: "Para ouvir" },
  { id: "ouvido", nome: "Ouvidos" },
  { id: "programas", nome: "Programas" },
];

const p2 = (n: number) => String(n).padStart(2, "0");
const hojeIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
};

const dur = (s: number | null) => {
  if (!s) return "";
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h > 0 ? `${h}h${p2(m)}` : `${m} min`;
};

const quando = (ms: number | null) => {
  if (!ms) return "";
  const dias = Math.floor((Date.now() - ms) / 86400000);
  if (dias <= 0) return "hoje";
  if (dias === 1) return "ontem";
  if (dias < 30) return `há ${dias} dias`;
  return new Date(ms).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
};

/**
 * Podcasts. O áudio toca no AntennaPod; aqui se decide o que ouvir e o tempo
 * vira registro como qualquer outro — episódio planejado vira tarefa do dia.
 */
export default function Podcasts({
  onErro,
  onMudou,
}: {
  onErro: (e: string | null) => void;
  onMudou: () => void;
}) {
  const [aba, setAba] = useState<Aba>("novo");
  const [podcasts, setPodcasts] = useState<Podcast[]>([]);
  const [episodios, setEpisodios] = useState<Episodio[]>([]);
  const [tipos, setTipos] = useState<Tipo[]>([]);
  const [filtro, setFiltro] = useState<string>("");
  const [ocupado, setOcupado] = useState(false);
  const [resumo, setResumo] = useState<string | null>(null);

  const carregar = useCallback(() => {
    invoke<Podcast[]>("listar_podcasts").then(setPodcasts).catch((e) => onErro(String(e)));
    invoke<Tipo[]>("listar_tipos").then(setTipos).catch(() => {});
  }, [onErro]);

  useEffect(carregar, [carregar]);

  useEffect(() => {
    if (aba === "programas") return;
    invoke<Episodio[]>("listar_episodios", { estado: aba, podcastId: filtro || null })
      .then(setEpisodios)
      .catch((e) => onErro(String(e)));
  }, [aba, filtro, onErro, ocupado]);

  const importar = async () => {
    const caminho = await open({
      multiple: false,
      filters: [{ name: "OPML", extensions: ["opml", "xml"] }],
    });
    if (typeof caminho !== "string") return;
    setOcupado(true);
    invoke<{ novos: number; ja_tinha: number }>("podcasts_importar_opml", { caminho })
      .then((r) => {
        setResumo(`${r.novos} assinatura(s) importada(s), ${r.ja_tinha} já estavam aqui`);
        carregar();
        onErro(null);
      })
      .catch((e) => onErro(String(e)))
      .finally(() => setOcupado(false));
  };

  const atualizar = () => {
    setOcupado(true);
    invoke<{ feeds: number; episodios_novos: number; erros: string[] }>("podcasts_atualizar")
      .then((r) => {
        setResumo(
          `${r.episodios_novos} episódio(s) novo(s) em ${r.feeds} feed(s)` +
            (r.erros.length ? ` · ${r.erros.length} feed(s) com erro` : "")
        );
        onErro(r.erros[0] ?? null);
        carregar();
      })
      .catch((e) => onErro(String(e)))
      .finally(() => setOcupado(false));
  };

  const acao = (p: Promise<unknown>) =>
    p
      .then(() => {
        setOcupado((v) => !v);
        carregar();
        onMudou();
        onErro(null);
      })
      .catch((e) => onErro(String(e)));

  return (
    <>
      <div className="pagina-cab">
        <div>
          <h1 className="titulo-pagina">Podcasts</h1>
        </div>
        <div className="pagina-acoes">
          <button className="btn" onClick={importar} disabled={ocupado}>
            <I.Externo /> Importar OPML
          </button>
          <button className="btn btn-primario" onClick={atualizar} disabled={ocupado}>
            <I.Repetir /> {ocupado ? "Atualizando…" : "Atualizar"}
          </button>
        </div>
      </div>

      <div className="abas">
        {ABAS.map((a) => (
          <button
            key={a.id}
            className="aba"
            aria-current={aba === a.id ? "page" : undefined}
            onClick={() => setAba(a.id)}
          >
            {a.nome}
            {a.id === "novo" && podcasts.reduce((s, p) => s + p.novos, 0) > 0 && (
              <span className="pill pill-warn" style={{ marginLeft: 6 }}>
                {podcasts.reduce((s, p) => s + p.novos, 0)}
              </span>
            )}
          </button>
        ))}
      </div>

      {resumo && (
        <div className="aviso" style={{ marginBottom: 14 }}>
          <div>
            <strong>{resumo}</strong>
          </div>
        </div>
      )}

      {podcasts.length === 0 ? (
        <div className="vazio">
          Nenhum podcast. No AntennaPod: Configurações → Importar/Exportar → Exportar OPML.
        </div>
      ) : aba === "programas" ? (
        <section className="card">
          {podcasts.map((p) => (
            <div key={p.id} className="lanc">
              <span className="lanc-cor" style={{ background: p.cor ?? "var(--line-2)" }} />
              <div className="lanc-texto">
                <div>{p.titulo}</div>
                <span className="lanc-curso">
                  {p.novos} novo{p.novos === 1 ? "" : "s"}
                  {p.atualizado_em ? ` · lido ${quando(p.atualizado_em)}` : ""}
                  {p.conta_como_estudo ? " · conta como estudo" : ""}
                </span>
              </div>
              <select
                value={p.activity_type_id ?? ""}
                onChange={(e) =>
                  acao(
                    invoke("podcast_categoria", {
                      id: p.id,
                      activityTypeId: e.target.value || null,
                    })
                  )
                }
                style={{ width: 170 }}
              >
                <option value="">— sem categoria —</option>
                {tipos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                  </option>
                ))}
              </select>
              <button
                className="btn btn-fantasma btn-icone"
                onClick={() => acao(invoke("excluir_podcast", { id: p.id }))}
                aria-label="Remover podcast"
                title="Remover"
              >
                <I.Lixeira />
              </button>
            </div>
          ))}
        </section>
      ) : (
        <>
          <div className="linha" style={{ marginBottom: 12 }}>
            <select value={filtro} onChange={(e) => setFiltro(e.target.value)} style={{ width: 240 }}>
              <option value="">Todos os programas</option>
              {podcasts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.titulo}
                </option>
              ))}
            </select>
          </div>

          {episodios.length === 0 ? (
            <div className="vazio">Nada aqui.</div>
          ) : (
            <section className="card">
              {episodios.map((e) => (
                <div key={e.id} className="lanc">
                  <span className="lanc-cor" style={{ background: e.cor ?? "var(--line-2)" }} />
                  <div className="lanc-texto">
                    <div>{e.titulo}</div>
                    <span className="lanc-curso">
                      {e.podcast}
                      {e.publicado_em ? ` · ${quando(e.publicado_em)}` : ""}
                      {e.duracao_s ? ` · ${dur(e.duracao_s)}` : ""}
                      {e.dia_planejado ? ` · ${e.dia_planejado.split("-").reverse().join("/")}` : ""}
                    </span>
                  </div>

                  {e.estado !== "ouvido" && (
                    <>
                      <button
                        className="btn btn-pequeno"
                        onClick={() =>
                          acao(invoke("planejar_episodio", { id: e.id, dia: hojeIso() }))
                        }
                      >
                        Hoje
                      </button>
                      <button
                        className="btn btn-pequeno"
                        onClick={() => acao(invoke("planejar_episodio", { id: e.id, dia: null }))}
                      >
                        Depois
                      </button>
                    </>
                  )}
                  <button
                    className="btn btn-fantasma btn-icone"
                    onClick={() =>
                      acao(
                        invoke("episodio_estado", {
                          id: e.id,
                          estado: e.estado === "ouvido" ? "novo" : "ouvido",
                        })
                      )
                    }
                    aria-label={e.estado === "ouvido" ? "Marcar como não ouvido" : "Marcar como ouvido"}
                    title={e.estado === "ouvido" ? "Reabrir" : "Ouvido"}
                  >
                    <I.Check />
                  </button>
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </>
  );
}
