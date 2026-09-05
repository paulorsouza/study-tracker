import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Curso, durCurta } from "./App";
import Modal from "./Modal";
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

const p2 = (n: number) => String(n).padStart(2, "0");

/** Data local em AAAA-MM-DD, para o campo de data. */
const isoLocal = (ms: number | null) => {
  if (!ms) return "";
  const d = new Date(ms);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
};

/** O inverso, à meia-noite local. `new Date("AAAA-MM-DD")` seria UTC e
 *  mostraria o dia anterior no Brasil. */
const deIsoLocal = (s: string) => {
  const [a, m, d] = s.split("-").map(Number);
  return new Date(a, m - 1, d).getTime();
};

const inicial = (titulo: string) => (titulo.trim()[0] ?? "?").toUpperCase();

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
  const [novo, setNovo] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [url, setUrl] = useState("");

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

  const abrirNoNavegador = (c: Curso) => {
    const alvo = c.ultima_url ?? c.url_principal;
    if (alvo) acao("abrir_no_navegador", { url: alvo });
    else onErro(`"${c.titulo}" não tem rota salva.`);
  };

  const criar = () =>
    acao("criar_curso", { titulo, url: url.trim() || null }).then(() => {
      setTitulo("");
      setUrl("");
      setNovo(false);
    });

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
      <div className="pagina-cab">
        <div>
          <h1 className="titulo-pagina">Cursos</h1>
          <p className="legenda">
            Cada curso guarda a rota da última aula. Abrir leva direto para lá, no
            seu navegador.
          </p>
        </div>
        <div className="pagina-acoes">
          <button className="btn btn-primario" onClick={() => setNovo(true)}>
            <I.Mais /> Adicionar
          </button>
        </div>
      </div>

      <div className="filtros">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar curso"
          aria-label="Buscar curso"
          style={{ maxWidth: 280 }}
        />
        <select
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          aria-label="Filtrar por estado"
          style={{ width: 170 }}
        >
          <option value="">todos os estados</option>
          {ESTADOS.map((e) => (
            <option key={e.id} value={e.id}>{e.nome}</option>
          ))}
        </select>
      </div>

      {visiveis.length === 0 ? (
        <div className="vazio">
          {cursos.length === 0
            ? "Nenhum curso ainda. Estando na aula no Chrome, use a extensão para salvar a rota — ou adicione aqui."
            : "Nada com esses filtros."}
        </div>
      ) : (
        <div className="cursos-grade">
          {visiveis.map((c) => (
            <div
              key={c.id}
              className="curso-card"
              role="button"
              tabIndex={0}
              onClick={() => setAberto(c.id)}
              onKeyDown={(e) => e.key === "Enter" && setAberto(c.id)}
            >
              <div className="curso-capa">
                <span className="curso-inicial" aria-hidden>{inicial(c.titulo)}</span>
                {c.favorito && (
                  <span className="curso-estrela" title="Favorito">
                    <I.Estrela cheia size={15} />
                  </span>
                )}
              </div>
              <div className="curso-corpo">
                <div className="curso-titulo">{c.titulo}</div>
                <div className="curso-meta">
                  <span className={`pill${c.estado === "ativo" ? " pill-acc" : ""}`}>
                    {nomeEstado(c.estado)}
                  </span>
                  <span>{quando(c.ultima_url_em)}</span>
                </div>
                <div className="curso-pe">
                  <button
                    className="btn btn-suave btn-pequeno"
                    onClick={(e) => {
                      e.stopPropagation();
                      abrirNoNavegador(c);
                    }}
                  >
                    <I.Externo /> Continuar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        titulo="Novo curso"
        aberto={novo}
        onFechar={() => setNovo(false)}
        pe={
          <>
            <button className="btn btn-fantasma" onClick={() => setNovo(false)}>Cancelar</button>
            <button className="btn btn-primario" onClick={criar}>Salvar</button>
          </>
        }
      >
        <div className="campos" onKeyDown={(e) => e.key === "Enter" && criar()}>
          <div className="campo campo-largo">
            <label htmlFor="nc-titulo">Nome</label>
            <input id="nc-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          </div>
          <div className="campo campo-largo">
            <label htmlFor="nc-url">URL (opcional)</label>
            <input
              id="nc-url"
              placeholder="https://…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>
        </div>
        <p className="nota">
          O resto — professor, plataforma, capa, meta — entra depois, na página
          do curso.
        </p>
      </Modal>
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
      .then(setD)
      .catch((e) => onErro(String(e)));
    invoke<Plataforma[]>("listar_plataformas").then(setPlataformas).catch(() => {});
  }, [id, onErro]);

  useEffect(carregar, [carregar]);

  if (!d) {
    return <p className="nota">carregando…</p>;
  }

  const maxSemana = Math.max(...d.semanas, 1);
  const alvo = d.ultima_url ?? d.url_principal;

  return (
    <>
      <div className="pagina-cab" style={{ alignItems: "center" }}>
        <button className="btn btn-fantasma btn-icone" onClick={onFechar} aria-label="Voltar">
          <I.Seta />
        </button>
        <div>
          <h1 className="titulo-pagina">{d.titulo}</h1>
          <p className="legenda">
            {[d.plataforma, d.professor, nomeEstado(d.estado)].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="pagina-acoes" style={{ paddingTop: 0 }}>
          <button
            className="btn btn-fantasma btn-icone"
            onClick={() =>
              invoke("favoritar_curso", { id, favorito: !d.favorito })
                .then(() => { carregar(); onMudou(); })
                .catch((e) => onErro(String(e)))
            }
            aria-label={d.favorito ? "Desfavoritar" : "Favoritar"}
            title={d.favorito ? "Desfavoritar" : "Favoritar"}
            style={d.favorito ? { color: "var(--warn)" } : undefined}
          >
            <I.Estrela cheia={d.favorito} />
          </button>
          <button className="btn" onClick={() => setEditando(true)}>
            <I.Lapis /> Editar
          </button>
          {alvo && (
            <button
              className="btn btn-primario"
              onClick={() =>
                invoke("abrir_no_navegador", { url: alvo }).catch((e) => onErro(String(e)))
              }
            >
              <I.Externo /> Continuar
            </button>
          )}
        </div>
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
        <h2>Detalhes</h2>
        <div className="ficha-grade">
          {(
            [
              ["plataforma", d.plataforma ?? "—"],
              ["professor", d.professor ?? "—"],
              ["categoria", d.categoria ?? "—"],
              ["prioridade", ["normal", "alta", "urgente"][d.prioridade] ?? "normal"],
              ["meta", d.meta_minutos ? durCurta(d.meta_minutos * 60000) : "—"],
              ["estimado", d.estimado_min ? durCurta(d.estimado_min * 60000) : "—"],
              ["prazo", d.prazo ? new Date(d.prazo).toLocaleDateString("pt-BR") : "—"],
              ["última aula", quando(d.ultima_url_em)],
            ] as [string, string][]
          ).map(([rotulo, valor]) => (
            <div key={rotulo} className="ficha-item">
              <div className="ficha-rotulo">{rotulo}</div>
              <div className="ficha-valor">{valor}</div>
            </div>
          ))}
        </div>
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

      <FormCurso
        key={editando ? d.id : "fechado"}
        aberto={editando}
        d={d}
        plataformas={plataformas}
        onFechar={() => setEditando(false)}
        onSalvo={() => {
          setEditando(false);
          carregar();
          onMudou();
        }}
        onErro={onErro}
      />
    </>
  );
}

/** Edição do curso, num formulário só — inclusive a capa. */
function FormCurso({
  aberto, d, plataformas, onFechar, onSalvo, onErro,
}: {
  aberto: boolean;
  d: Detalhe;
  plataformas: Plataforma[];
  onFechar: () => void;
  onSalvo: () => void;
  onErro: (e: string | null) => void;
}) {
  const [f, setF] = useState<Partial<Detalhe>>({ ...d });
  const [tagsTxt, setTagsTxt] = useState(d.tags.join(", "));
  const [capaUrl, setCapaUrl] = useState(d.capa_url ?? "");
  const [baixando, setBaixando] = useState(false);
  const [capaMsg, setCapaMsg] = useState<string | null>(null);

  const salvar = () =>
    invoke("salvar_curso", {
      id: d.id,
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
      capaUrl: capaUrl.trim() || null,
      tags: tagsTxt.split(",").map((t) => t.trim()).filter(Boolean),
    })
      .then(() => {
        onErro(null);
        onSalvo();
      })
      .catch((e) => onErro(String(e)));

  const baixarCapa = () => {
    setBaixando(true);
    setCapaMsg(null);
    invoke("baixar_capa", { id: d.id, url: capaUrl })
      .then(() => setCapaMsg("Capa baixada e guardada no app."))
      .catch((e) => setCapaMsg(String(e)))
      .finally(() => setBaixando(false));
  };

  const campo = (k: keyof Detalhe, valor: string) => setF({ ...f, [k]: valor });

  return (
    <Modal
      titulo="Editar curso"
      aberto={aberto}
      onFechar={onFechar}
      larga
      pe={
        <>
          <button className="btn btn-fantasma" onClick={onFechar}>Cancelar</button>
          <button className="btn btn-primario" onClick={salvar}>Salvar</button>
        </>
      }
    >
      <div className="campos">
        <div className="campo campo-largo">
          <label htmlFor="fc-titulo">Título</label>
          <input id="fc-titulo" value={f.titulo ?? ""} onChange={(e) => campo("titulo", e.target.value)} />
        </div>
        <div className="campo">
          <label htmlFor="fc-plat">Plataforma</label>
          <select
            id="fc-plat"
            value={f.platform_id ?? ""}
            onChange={(e) => campo("platform_id", e.target.value)}
          >
            <option value="">— nenhuma —</option>
            {plataformas.map((p) => (
              <option key={p.id} value={p.id}>{p.nome}</option>
            ))}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="fc-estado">Estado</label>
          <select id="fc-estado" value={f.estado ?? ""} onChange={(e) => campo("estado", e.target.value)}>
            {ESTADOS.map((e) => (
              <option key={e.id} value={e.id}>{e.nome}</option>
            ))}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="fc-prof">Professor</label>
          <input id="fc-prof" value={f.professor ?? ""} onChange={(e) => campo("professor", e.target.value)} />
        </div>
        <div className="campo">
          <label htmlFor="fc-cat">Categoria</label>
          <input id="fc-cat" value={f.categoria ?? ""} onChange={(e) => campo("categoria", e.target.value)} />
        </div>
        <div className="campo campo-largo">
          <label htmlFor="fc-tags">Tags</label>
          <input
            id="fc-tags"
            value={tagsTxt}
            onChange={(e) => setTagsTxt(e.target.value)}
            placeholder="separadas por vírgula"
          />
        </div>
        <div className="campo">
          <label htmlFor="fc-prog">Progresso (%)</label>
          <input
            id="fc-prog"
            type="number" min={0} max={100}
            value={f.progresso ?? 0}
            onChange={(e) => setF({ ...f, progresso: Number(e.target.value) })}
          />
        </div>
        <div className="campo">
          <label htmlFor="fc-pri">Prioridade</label>
          <select
            id="fc-pri"
            value={f.prioridade ?? 0}
            onChange={(e) => setF({ ...f, prioridade: Number(e.target.value) })}
          >
            <option value={0}>normal</option>
            <option value={1}>alta</option>
            <option value={2}>urgente</option>
          </select>
        </div>
        <div className="campo">
          <label htmlFor="fc-meta">Meta (min)</label>
          <input
            id="fc-meta"
            type="number" min={0}
            value={f.meta_minutos ?? ""}
            onChange={(e) => setF({ ...f, meta_minutos: Number(e.target.value) || null })}
          />
        </div>
        <div className="campo">
          <label htmlFor="fc-est">Estimado (min)</label>
          <input
            id="fc-est"
            type="number" min={0}
            value={f.estimado_min ?? ""}
            onChange={(e) => setF({ ...f, estimado_min: Number(e.target.value) || null })}
          />
        </div>
        <div className="campo">
          <label htmlFor="fc-prazo">Prazo</label>
          <input
            id="fc-prazo"
            type="date"
            value={isoLocal(f.prazo ?? null)}
            onChange={(e) =>
              setF({ ...f, prazo: e.target.value ? deIsoLocal(e.target.value) : null })
            }
          />
        </div>
        <div className="campo campo-largo">
          <label htmlFor="fc-url">URL principal</label>
          <input
            id="fc-url"
            value={f.url_principal ?? ""}
            onChange={(e) => campo("url_principal", e.target.value)}
            placeholder="https://…"
          />
        </div>
        <div className="campo campo-largo">
          <label htmlFor="fc-capa">Capa (endereço da imagem)</label>
          <div className="linha" style={{ marginBottom: 0 }}>
            <input
              id="fc-capa"
              value={capaUrl}
              onChange={(e) => setCapaUrl(e.target.value)}
              placeholder="https://…"
            />
            <button className="btn" onClick={baixarCapa} disabled={baixando || !capaUrl.trim()}>
              {baixando ? "Baixando…" : "Baixar"}
            </button>
          </div>
          {capaMsg && <span className="nota" style={{ margin: 0 }}>{capaMsg}</span>}
        </div>
      </div>
      <p className="nota">
        A capa é baixada uma vez e guardada dentro do app; o endereço, não a
        imagem, é o que viaja na sincronização.
      </p>
    </Modal>
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
