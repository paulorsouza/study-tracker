import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Curso, durCurta } from "./App";
import { Lancamento, Tipo, corDe, hhmm } from "./tempo-comum";
import * as I from "./icones";

type Tarefa = { id: string; titulo: string };

type Pagina = {
  itens: Lancamento[];
  total: number;
  total_ms: number;
  estudo_ms: number;
};

const POR_PAGINA = 40;

/** Períodos prontos. O caso comum não deveria exigir escolher duas datas. */
const PERIODOS: { id: string; nome: string; dias: number | null }[] = [
  { id: "7", nome: "7 dias", dias: 7 },
  { id: "30", nome: "30 dias", dias: 30 },
  { id: "90", nome: "3 meses", dias: 90 },
  { id: "365", nome: "1 ano", dias: 365 },
  { id: "tudo", nome: "Tudo", dias: null },
];

export default function Historico({
  cursos,
  versao,
  tema,
  onErro,
}: {
  cursos: Curso[];
  versao: number;
  tema: string;
  onErro: (e: string | null) => void;
}) {
  const [texto, setTexto] = useState("");
  const [periodo, setPeriodo] = useState("30");
  const [curso, setCurso] = useState("");
  const [tipo, setTipo] = useState("");
  const [tarefa, setTarefa] = useState("");
  const [tag, setTag] = useState("");
  const [pagina, setPagina] = useState(0);

  const [tipos, setTipos] = useState<Tipo[]>([]);
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [res, setRes] = useState<Pagina | null>(null);

  useEffect(() => {
    invoke<Tipo[]>("listar_tipos").then(setTipos).catch(() => {});
    invoke<string[]>("listar_tags_curso").then(setTags).catch(() => {});
    invoke<Tarefa[]>("listar_tarefas", { dia: null, ate: null, modo: "todas" })
      .then(setTarefas)
      .catch(() => {});
  }, [versao]);

  const buscar = useCallback(() => {
    const dias = PERIODOS.find((p) => p.id === periodo)?.dias ?? null;
    const desde = dias === null ? null : Date.now() - dias * 86_400_000;
    invoke<Pagina>("buscar_lancamentos", {
      texto: texto.trim() || null,
      desde,
      ate: null,
      cursoId: curso || null,
      tipoId: tipo || null,
      tarefaId: tarefa || null,
      tag: tag || null,
      limite: POR_PAGINA,
      deslocamento: pagina * POR_PAGINA,
    })
      .then((p) => {
        setRes(p);
        onErro(null);
      })
      .catch((e) => onErro(String(e)));
  }, [texto, periodo, curso, tipo, tarefa, tag, pagina, onErro]);

  // Um respiro antes de consultar: sem ele, cada tecla vira uma varredura de
  // todo o histórico, e é justamente com histórico grande que isso pesa.
  useEffect(() => {
    const id = setTimeout(buscar, 220);
    return () => clearTimeout(id);
  }, [buscar, versao]);

  // Trocar um filtro volta para a primeira página: manter a 5ª página com um
  // filtro novo mostraria uma lista vazia sem explicar por quê.
  useEffect(() => setPagina(0), [texto, periodo, curso, tipo, tarefa, tag]);

  const filtrando = !!(texto.trim() || curso || tipo || tarefa || tag) || periodo !== "30";
  const ultima = res ? Math.max(0, Math.ceil(res.total / POR_PAGINA) - 1) : 0;

  const limpar = () => {
    setTexto("");
    setPeriodo("30");
    setCurso("");
    setTipo("");
    setTarefa("");
    setTag("");
  };

  return (
    <>
      <div className="grade" style={{ marginBottom: 14 }}>
        <div className="campo cresce">
          <label htmlFor="hb">Buscar</label>
          <input
            id="hb"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="descrição ou nome do curso"
          />
        </div>
        <div className="campo" style={{ width: 130 }}>
          <label htmlFor="hp">Período</label>
          <select id="hp" value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
            {PERIODOS.map((p) => (
              <option key={p.id} value={p.id}>{p.nome}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grade" style={{ marginBottom: 18 }}>
        <div className="campo cresce">
          <label htmlFor="hc">Curso</label>
          <select id="hc" value={curso} onChange={(e) => setCurso(e.target.value)}>
            <option value="">todos</option>
            {cursos.map((c) => (
              <option key={c.id} value={c.id}>{c.titulo}</option>
            ))}
          </select>
        </div>
        <div className="campo" style={{ width: 150 }}>
          <label htmlFor="ht">Categoria</label>
          <select id="ht" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="">todas</option>
            {tipos.map((t) => (
              <option key={t.id} value={t.id}>{t.nome}</option>
            ))}
          </select>
        </div>
        <div className="campo cresce">
          <label htmlFor="hk">Tarefa</label>
          <select id="hk" value={tarefa} onChange={(e) => setTarefa(e.target.value)}>
            <option value="">todas</option>
            {tarefas.map((t) => (
              <option key={t.id} value={t.id}>{t.titulo}</option>
            ))}
          </select>
        </div>
        <div className="campo" style={{ width: 140 }}>
          <label htmlFor="hg">Tag do curso</label>
          <select id="hg" value={tag} onChange={(e) => setTag(e.target.value)}>
            <option value="">todas</option>
            {tags.map((t) => (
              <option key={t} value={t}>#{t}</option>
            ))}
          </select>
        </div>
        {filtrando && (
          <button className="btn btn-fantasma" onClick={limpar}>
            <I.Fechar size={13} /> Limpar
          </button>
        )}
      </div>

      <section className="card">
        {res && (
          <div className="totais" style={{ marginBottom: res.itens.length ? 18 : 0 }}>
            <div>
              <div className="total-valor tile-destaque">{durCurta(res.estudo_ms)}</div>
              <div className="total-rotulo">estudo no recorte</div>
            </div>
            <div>
              <div className="total-valor">{durCurta(res.total_ms)}</div>
              <div className="total-rotulo">tempo total</div>
            </div>
            <div>
              <div className="total-valor">{res.total}</div>
              <div className="total-rotulo">
                lançamento{res.total === 1 ? "" : "s"}
              </div>
            </div>
          </div>
        )}

        {!res ? (
          <p className="nota">buscando…</p>
        ) : res.itens.length === 0 ? (
          <div className="vazio">
            {filtrando ? "Nada com esses filtros." : "Nenhum lançamento ainda."}
          </div>
        ) : (
          res.itens.map((l, i) => {
            const dia = new Date(l.started_at).toDateString();
            const anterior = i > 0 ? new Date(res.itens[i - 1].started_at).toDateString() : null;
            return (
              <div key={l.id}>
                {dia !== anterior && (
                  <div className="hist-dia">
                    {new Date(l.started_at).toLocaleDateString("pt-BR", {
                      weekday: "short",
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </div>
                )}
                <div className={`lanc${l.sobrepoe ? " lanc-sobreposto" : ""}`}>
                  <span className="lanc-cor" style={{ background: corDe(l, tema) }} />
                  <span
                    style={{ color: corDe(l, tema), display: "flex", flex: "none" }}
                    title={l.atividade}
                  >
                    <I.IconeCategoria nome={l.icone} size={14} />
                  </span>
                  <span className="lanc-hora num">
                    {hhmm(l.started_at)} – {l.ended_at ? hhmm(l.ended_at) : "agora"}
                  </span>
                  <span className="lanc-texto">
                    {l.description || (
                      <span style={{ color: "var(--tx-2)" }}>{l.atividade}</span>
                    )}
                    {l.curso && <span className="lanc-curso"> · {l.curso}</span>}
                    {l.sobrepoe && <span className="marca-aviso">sobreposto</span>}
                    {l.distancia_m != null && (
                      <span className="marca-extra">{(l.distancia_m / 1000).toFixed(1)} km</span>
                    )}
                    {l.treino && <span className="marca-extra">{l.treino}</span>}
                  </span>
                  <span className="lanc-dur num">
                    {durCurta((l.ended_at ?? Date.now()) - l.started_at)}
                  </span>
                </div>
              </div>
            );
          })
        )}

        {res && res.total > POR_PAGINA && (
          <div className="paginacao">
            <button
              className="btn btn-icone"
              disabled={pagina === 0}
              onClick={() => setPagina((p) => p - 1)}
              aria-label="Página anterior"
            >
              <I.Seta />
            </button>
            <span>
              {pagina * POR_PAGINA + 1}–{Math.min((pagina + 1) * POR_PAGINA, res.total)} de{" "}
              {res.total}
            </span>
            <button
              className="btn btn-icone"
              disabled={pagina >= ultima}
              onClick={() => setPagina((p) => p + 1)}
              aria-label="Próxima página"
            >
              <I.Seta dir="dir" />
            </button>
          </div>
        )}
      </section>
    </>
  );
}
