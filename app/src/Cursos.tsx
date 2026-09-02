import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Curso, durCurta } from "./App";
import * as I from "./icones";

type Plataforma = { id: string; nome: string; url_base: string | null };

type Detalhe = {
  id: string;
  titulo: string;
  platform_id: string | null;
  plataforma: string | null;
  professor: string | null;
  categoria: string | null;
  estado: string;
  prioridade: number;
  progresso: number;
  meta_minutos: number | null;
  estimado_min: number | null;
  prazo: number | null;
  url_principal: string | null;
  ultima_url: string | null;
  ultima_url_em: number | null;
  favorito: boolean;
  capa_url: string | null;
  capa: string | null;
  tags: string[];
  total_ms: number;
  recente_ms: number;
  semanas: number[];
  tarefas_abertas: number;
  tarefas_concluidas: number;
  notas: number;
  sessoes: Ligado[];
  lista_tarefas: Ligado[];
  lista_notas: Ligado[];
};

type Ligado = {
  id: string;
  texto: string;
  em: number | null;
  extra: string | null;
  concluido: boolean;
};

const ESTADOS: { id: string; nome: string }[] = [
  { id: "nao_iniciado", nome: "Não iniciado" },
  { id: "ativo", nome: "Ativo" },
  { id: "pausado", nome: "Pausado" },
  { id: "concluido", nome: "Concluído" },
  { id: "arquivado", nome: "Arquivado" },
];

const nomeEstado = (id: string) => ESTADOS.find((e) => e.id === id)?.nome ?? id;

const DIA = 86_400_000;

function quando(ms: number | null) {
  if (!ms) return "sem rota salva";
  const dias = Math.floor((Date.now() - ms) / DIA);
  if (dias === 0) return "aberto hoje";
  if (dias === 1) return "aberto ontem";
  if (dias < 30) return `aberto há ${dias} dias`;
  const m = Math.floor(dias / 30);
  return `parado há ${m} ${m === 1 ? "mês" : "meses"}`;
}

const iso = (ms: number | null) =>
  ms ? new Date(ms).toISOString().slice(0, 10) : "";

export default function Cursos({
  cursos,
  onErro,
  onMudou,
}: {
  cursos: Curso[];
  onErro: (e: string | null) => void;
  onMudou: () => void;
}) {
  const [aberto, setAberto] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("");
  const [titulo, setTitulo] = useState("");
  const [url, setUrl] = useState("");
  const [novo, setNovo] = useState(false);

  const acao = (cmd: string, args: Record<string, unknown>) =>
    invoke(cmd, args)
      .then(() => {
        onErro(null);
        onMudou();
      })
      .catch((e) => onErro(String(e)));

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return cursos.filter(
      (c) =>
        (!q || c.titulo.toLowerCase().includes(q)) &&
        (!filtro || c.estado === filtro)
    );
  }, [cursos, busca, filtro]);

  if (aberto) {
    return (
      <Pagina
        id={aberto}
        onFechar={() => setAberto(null)}
        onErro={onErro}
        onMudou={onMudou}
      />
    );
  }

  return (
    <>
      <h1 className="titulo-pagina">Cursos</h1>
      <p className="legenda">
        Cada curso guarda a rota da última aula. Abrir leva direto para lá, no
        seu navegador.
      </p>

      <div className="grade" style={{ marginBottom: 16 }}>
        <div className="campo cresce">
          <label htmlFor="bc">Buscar</label>
          <input
            id="bc"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="nome do curso"
          />
        </div>
        <div className="campo" style={{ width: 170 }}>
          <label htmlFor="fe">Estado</label>
          <select id="fe" value={filtro} onChange={(e) => setFiltro(e.target.value)}>
            <option value="">todos</option>
            {ESTADOS.map((e) => (
              <option key={e.id} value={e.id}>{e.nome}</option>
            ))}
          </select>
        </div>
        {!novo && (
          <button className="btn" onClick={() => setNovo(true)}>
            <I.Mais /> Adicionar
          </button>
        )}
      </div>

      <section className="card">
        {novo && (
          <div className="grade" style={{ marginBottom: visiveis.length ? 18 : 0 }}>
            <div className="campo" style={{ width: 220 }}>
              <label htmlFor="ct">Nome</label>
              <input id="ct" value={titulo} onChange={(e) => setTitulo(e.target.value)} autoFocus />
            </div>
            <div className="campo cresce">
              <label htmlFor="cu">URL (opcional)</label>
              <input id="cu" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
            </div>
            <button
              className="btn btn-primario"
              onClick={() =>
                acao("criar_curso", { titulo, url: url.trim() || null }).then(() => {
                  setTitulo("");
                  setUrl("");
                  setNovo(false);
                })
              }
            >
              Salvar
            </button>
            <button className="btn btn-fantasma" onClick={() => setNovo(false)}>
              Cancelar
            </button>
          </div>
        )}

        {visiveis.length === 0 ? (
          <div className="vazio">
            {cursos.length === 0
              ? "Nenhum curso ainda. Estando na aula no Chrome, use a extensão para salvar a rota."
              : "Nada com esses filtros."}
          </div>
        ) : (
          visiveis.map((c) => (
            <div key={c.id} className="lanc">
              <span
                className="lanc-cor"
                style={{ background: c.favorito ? "var(--warn)" : "var(--line-2)" }}
              />
              <button
                className="lanc-texto"
                onClick={() => setAberto(c.id)}
                style={{
                  background: "none", border: 0, color: "inherit", font: "inherit",
                  textAlign: "left", cursor: "pointer", fontWeight: 500, padding: 0,
                }}
              >
                {c.titulo}
              </button>
              <span className="nota" style={{ margin: 0 }}>{nomeEstado(c.estado)}</span>
              <span className="lanc-curso" style={{ fontSize: 12.5, minWidth: 128, textAlign: "right" }}>
                {quando(c.ultima_url_em)}
              </span>
              <button
                className="btn"
                onClick={() => {
                  const alvo = c.ultima_url ?? c.url_principal;
                  if (alvo) acao("abrir_no_navegador", { url: alvo });
                  else onErro(`"${c.titulo}" não tem rota salva.`);
                }}
              >
                <I.Externo /> Abrir
              </button>
            </div>
          ))
        )}
      </section>
    </>
  );
}

/** Página do curso: o que ele é, quanto tempo levou, e o que está preso a ele. */
function Pagina({
  id,
  onFechar,
  onErro,
  onMudou,
}: {
  id: string;
  onFechar: () => void;
  onErro: (e: string | null) => void;
  onMudou: () => void;
}) {
  const [d, setD] = useState<Detalhe | null>(null);
  const [plataformas, setPlataformas] = useState<Plataforma[]>([]);
  const [editando, setEditando] = useState(false);
  const [f, setF] = useState<Partial<Detalhe> & { tagsTxt?: string }>({});
  const [novaCapa, setNovaCapa] = useState("");

  const carregar = useCallback(() => {
    // Os recortes de tempo saem daqui: o JavaScript é quem sabe o fuso, e no
    // resto do app vale a mesma regra.
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const seg = new Date(hoje);
    seg.setDate(seg.getDate() - ((seg.getDay() + 6) % 7));

    invoke<Detalhe>("curso_detalhe", {
      id,
      recenteDesde: hoje.getTime() - 30 * DIA,
      semanaZero: seg.getTime(),
    })
      .then((x) => {
        setD(x);
        setF({ ...x, tagsTxt: x.tags.join(", ") });
      })
      .catch((e) => onErro(String(e)));
    invoke<Plataforma[]>("listar_plataformas").then(setPlataformas).catch(() => {});
  }, [id, onErro]);

  useEffect(carregar, [carregar]);

  if (!d) {
    return <p className="nota">carregando…</p>;
  }

  const salvar = () =>
    invoke("salvar_curso", {
      id,
      titulo: f.titulo ?? d.titulo,
      platformId: f.platform_id || null,
      professor: f.professor?.trim() || null,
      categoria: f.categoria?.trim() || null,
      estado: f.estado ?? d.estado,
      prioridade: Number(f.prioridade ?? 0),
      progresso: Number(f.progresso ?? 0),
      metaMinutos: f.meta_minutos ? Number(f.meta_minutos) : null,
      estimadoMin: f.estimado_min ? Number(f.estimado_min) : null,
      prazo: f.prazo ?? null,
      urlPrincipal: f.url_principal?.trim() || null,
      capaUrl: d.capa_url,
      tags: (f.tagsTxt ?? "").split(",").map((t) => t.trim()).filter(Boolean),
    })
      .then(() => {
        setEditando(false);
        onErro(null);
        carregar();
        onMudou();
      })
      .catch((e) => onErro(String(e)));

  const maxSemana = Math.max(...d.semanas, 1);
  const alvo = d.ultima_url ?? d.url_principal;

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
        <button className="btn btn-icone" onClick={onFechar} aria-label="Voltar">
          <I.Seta />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 className="titulo-pagina" style={{ margin: 0 }}>{d.titulo}</h1>
          <p className="legenda" style={{ margin: 0 }}>
            {[d.plataforma, d.professor, nomeEstado(d.estado)].filter(Boolean).join(" · ")}
          </p>
        </div>
        <button
          className="btn btn-fantasma btn-icone"
          onClick={() =>
            invoke("favoritar_curso", { id, favorito: !d.favorito })
              .then(() => { carregar(); onMudou(); })
              .catch((e) => onErro(String(e)))
          }
          aria-label={d.favorito ? "Desfavoritar" : "Favoritar"}
        >
          <I.Estrela cheia={d.favorito} />
        </button>
        {alvo && (
          <button
            className="btn btn-primario"
            onClick={() =>
              invoke("abrir_no_navegador", { url: alvo }).catch((e) => onErro(String(e)))
            }
          >
            <I.Externo /> Abrir
          </button>
        )}
      </div>

      <section className="card">
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          {d.capa && (
            <img
              src={d.capa}
              alt=""
              style={{
                width: 132, height: 78, objectFit: "cover",
                borderRadius: "var(--r-sm)", border: "1px solid var(--line)", flex: "none",
              }}
            />
          )}
          <div className="totais" style={{ marginBottom: 0, flex: 1 }}>
            <div>
              <div className="total-valor tile-destaque">{durCurta(d.total_ms)}</div>
              <div className="total-rotulo">estudado no total</div>
            </div>
            <div>
              <div className="total-valor">{durCurta(d.recente_ms)}</div>
              <div className="total-rotulo">últimos 30 dias</div>
            </div>
            <div>
              <div className="total-valor">{d.tarefas_abertas}</div>
              <div className="total-rotulo">
                tarefa{d.tarefas_abertas === 1 ? "" : "s"} aberta
                {d.tarefas_abertas === 1 ? "" : "s"}
              </div>
            </div>
            <div>
              <div className="total-valor">{d.notas}</div>
              <div className="total-rotulo">nota{d.notas === 1 ? "" : "s"}</div>
            </div>
          </div>
        </div>

        {d.total_ms > 0 && (
          <>
            <hr />
            <h2 style={{ fontSize: 13.5, marginBottom: 10 }}>Doze semanas</h2>
            <div className="barras" style={{ height: 72 }}>
              {d.semanas.map((min, i) => (
                <div
                  key={i}
                  className="barra-alvo"
                  title={`${min} min`}
                  tabIndex={0}
                  aria-label={`Semana ${i + 1}: ${min} minutos`}
                >
                  <div className="barra" style={{ height: `${(min / maxSemana) * 100}%` }} />
                </div>
              ))}
            </div>
            <p className="nota">
              Da mais antiga à atual. Soma acumulada esconde abandono; esta não.
            </p>
          </>
        )}

        {d.progresso > 0 && (
          <>
            <div className="meta-topo" style={{ marginTop: 16 }}>
              <span style={{ flex: 1 }}>Progresso</span>
              <span className="num" style={{ fontWeight: 600 }}>{d.progresso}%</span>
            </div>
            <div className="meta-trilho">
              <span
                className="meta-barra"
                style={{ width: `${d.progresso}%`, background: "var(--serie-1)" }}
              />
            </div>
          </>
        )}

        {d.tags.length > 0 && (
          <div className="nota-pes" style={{ marginTop: 16 }}>
            {d.tags.map((t) => (
              <span key={t} className="nota-tag">#{t}</span>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-cab">
          <h2>Detalhes</h2>
          {!editando && (
            <button className="btn" onClick={() => setEditando(true)}>
              <I.Lapis /> Editar
            </button>
          )}
        </div>

        {editando ? (
          <>
            <div className="grade">
              <div className="campo cresce">
                <label>Título</label>
                <input value={f.titulo ?? ""} onChange={(e) => setF({ ...f, titulo: e.target.value })} />
              </div>
              <div className="campo" style={{ width: 170 }}>
                <label>Plataforma</label>
                <select
                  value={f.platform_id ?? ""}
                  onChange={(e) => setF({ ...f, platform_id: e.target.value })}
                >
                  <option value="">— nenhuma —</option>
                  {plataformas.map((p) => (
                    <option key={p.id} value={p.id}>{p.nome}</option>
                  ))}
                </select>
              </div>
              <div className="campo" style={{ width: 160 }}>
                <label>Estado</label>
                <select value={f.estado ?? ""} onChange={(e) => setF({ ...f, estado: e.target.value })}>
                  {ESTADOS.map((e) => (
                    <option key={e.id} value={e.id}>{e.nome}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grade" style={{ marginTop: 12 }}>
              <div className="campo cresce">
                <label>Professor</label>
                <input
                  value={f.professor ?? ""}
                  onChange={(e) => setF({ ...f, professor: e.target.value })}
                />
              </div>
              <div className="campo cresce">
                <label>Categoria</label>
                <input
                  value={f.categoria ?? ""}
                  onChange={(e) => setF({ ...f, categoria: e.target.value })}
                />
              </div>
              <div className="campo cresce">
                <label>Tags</label>
                <input
                  value={f.tagsTxt ?? ""}
                  onChange={(e) => setF({ ...f, tagsTxt: e.target.value })}
                  placeholder="separadas por vírgula"
                />
              </div>
            </div>

            <div className="grade" style={{ marginTop: 12 }}>
              <div className="campo" style={{ width: 100 }}>
                <label>Progresso %</label>
                <input
                  type="number" min={0} max={100}
                  value={f.progresso ?? 0}
                  onChange={(e) => setF({ ...f, progresso: Number(e.target.value) })}
                />
              </div>
              <div className="campo" style={{ width: 110 }}>
                <label>Meta (min)</label>
                <input
                  type="number" min={0}
                  value={f.meta_minutos ?? ""}
                  onChange={(e) => setF({ ...f, meta_minutos: Number(e.target.value) || null })}
                />
              </div>
              <div className="campo" style={{ width: 120 }}>
                <label>Estimado (min)</label>
                <input
                  type="number" min={0}
                  value={f.estimado_min ?? ""}
                  onChange={(e) => setF({ ...f, estimado_min: Number(e.target.value) || null })}
                />
              </div>
              <div className="campo" style={{ width: 110 }}>
                <label>Prioridade</label>
                <select
                  value={f.prioridade ?? 0}
                  onChange={(e) => setF({ ...f, prioridade: Number(e.target.value) })}
                >
                  <option value={0}>normal</option>
                  <option value={1}>alta</option>
                  <option value={2}>urgente</option>
                </select>
              </div>
              <div className="campo" style={{ width: 150 }}>
                <label>Prazo</label>
                <input
                  type="date"
                  value={iso(f.prazo ?? null)}
                  onChange={(e) =>
                    setF({ ...f, prazo: e.target.value ? new Date(e.target.value).getTime() : null })
                  }
                />
              </div>
            </div>

            <div className="grade" style={{ marginTop: 12 }}>
              <div className="campo cresce">
                <label>URL principal</label>
                <input
                  value={f.url_principal ?? ""}
                  onChange={(e) => setF({ ...f, url_principal: e.target.value })}
                />
              </div>
            </div>

            <div className="linha" style={{ marginTop: 16 }}>
              <button className="btn btn-primario" onClick={salvar}>Salvar</button>
              <button
                className="btn btn-fantasma"
                onClick={() => {
                  setEditando(false);
                  setF({ ...d, tagsTxt: d.tags.join(", ") });
                }}
              >
                Cancelar
              </button>
            </div>
          </>
        ) : (
          <table className="medidas">
            <tbody>
              <tr><td>plataforma</td><td>{d.plataforma ?? "—"}</td></tr>
              <tr><td>professor</td><td>{d.professor ?? "—"}</td></tr>
              <tr><td>categoria</td><td>{d.categoria ?? "—"}</td></tr>
              <tr><td>prioridade</td><td>{["normal", "alta", "urgente"][d.prioridade] ?? "normal"}</td></tr>
              <tr>
                <td>meta</td>
                <td>{d.meta_minutos ? durCurta(d.meta_minutos * 60000) : "—"}</td>
              </tr>
              <tr>
                <td>estimado</td>
                <td>{d.estimado_min ? durCurta(d.estimado_min * 60000) : "—"}</td>
              </tr>
              <tr>
                <td>prazo</td>
                <td>{d.prazo ? new Date(d.prazo).toLocaleDateString("pt-BR") : "—"}</td>
              </tr>
              <tr><td>última aula</td><td>{quando(d.ultima_url_em)}</td></tr>
            </tbody>
          </table>
        )}
      </section>

      <Ligados
        titulo="Sessões"
        itens={d.sessoes}
        vazio="Nenhuma sessão fechada neste curso ainda."
        direita={(l) => durCurta(Number(l.extra ?? 0))}
      />
      <Ligados
        titulo="Tarefas"
        itens={d.lista_tarefas}
        vazio="Nenhuma tarefa ligada a este curso."
        direita={(l) => (l.em ? new Date(l.em).toLocaleDateString("pt-BR") : "")}
      />
      <Ligados
        titulo="Notas"
        itens={d.lista_notas}
        vazio="Nenhuma nota ligada a este curso."
        direita={(l) => (l.em ? new Date(l.em).toLocaleDateString("pt-BR") : "")}
      />

      <section className="card">
        <h2>Capa</h2>
        <div className="grade">
          <div className="campo cresce">
            <label htmlFor="cap">Endereço da imagem</label>
            <input
              id="cap"
              value={novaCapa}
              onChange={(e) => setNovaCapa(e.target.value)}
              placeholder={d.capa_url ?? "https://…"}
            />
          </div>
          <button
            className="btn"
            onClick={() =>
              invoke("baixar_capa", { id, url: novaCapa })
                .then(() => {
                  setNovaCapa("");
                  onErro(null);
                  carregar();
                })
                .catch((e) => onErro(String(e)))
            }
          >
            Baixar
          </button>
        </div>
        <p className="nota">
          A imagem é baixada uma vez e guardada dentro do app. Nada é buscado na
          internet quando esta tela abre — e o endereço, não a imagem, é o que
          viaja na sincronização.
        </p>
      </section>
    </>
  );
}

/** Sessões, tarefas e notas presas ao curso — mesma forma para os três. */
function Ligados({
  titulo,
  itens,
  vazio,
  direita,
}: {
  titulo: string;
  itens: Ligado[];
  vazio: string;
  direita: (l: Ligado) => string;
}) {
  return (
    <section className="card">
      <h2>{titulo}</h2>
      {itens.length === 0 ? (
        <div className="vazio">{vazio}</div>
      ) : (
        itens.map((l) => (
          <div key={l.id} className="lanc">
            <span
              className="lanc-cor"
              style={{ background: l.concluido ? "var(--tx-3)" : "var(--serie-1)" }}
            />
            <span
              className="lanc-texto"
              style={{
                textDecoration: l.concluido ? "line-through" : undefined,
                color: l.concluido ? "var(--tx-2)" : undefined,
              }}
            >
              {l.texto}
            </span>
            {l.em && (
              <span className="lanc-curso" style={{ fontSize: 12.5 }}>
                {direita(l)}
              </span>
            )}
          </div>
        ))
      )}
    </section>
  );
}
