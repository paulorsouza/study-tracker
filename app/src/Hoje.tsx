import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Curso, durCurta } from "./App";
import * as I from "./icones";

type Lancamento = {
  id: string;
  started_at: number;
  ended_at: number | null;
  activity_type_id: string;
  atividade: string;
  cor: string;
  cor_escura: string | null;
  conta_como_estudo: boolean;
  description: string | null;
  course_id: string | null;
  curso: string | null;
  source: string;
  sobrepoe: boolean;
};

type Tipo = {
  id: string;
  nome: string;
  cor: string;
  cor_escura: string | null;
  conta_como_estudo: boolean;
};

/** O passo escuro é escolhido contra a superfície escura — não é o claro clareado. */
const corDe = (l: { cor: string; cor_escura: string | null }, tema: string) =>
  tema === "escuro" ? l.cor_escura ?? l.cor : l.cor;

const hhmm = (ms: number) =>
  new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

function comHora(dia: Date, hm: string) {
  const [h, m] = hm.split(":").map(Number);
  const d = new Date(dia);
  d.setHours(h || 0, m || 0, 0, 0);
  return d.getTime();
}

function limitesDoDia(dia: Date) {
  const ini = new Date(dia);
  ini.setHours(0, 0, 0, 0);
  const fim = new Date(ini);
  fim.setDate(fim.getDate() + 1);
  return [ini.getTime(), fim.getTime()] as const;
}

const agoraHhmm = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export default function Hoje({
  cursos,
  versao,
  tema,
  onErro,
  onMudou,
}: {
  cursos: Curso[];
  versao: number;
  tema: string;
  onErro: (e: string | null) => void;
  onMudou: () => void;
}) {
  const [dia, setDia] = useState(() => new Date());
  const [itens, setItens] = useState<Lancamento[]>([]);
  const [selecao, setSelecao] = useState<string[]>([]);
  const [cortando, setCortando] = useState<string | null>(null);
  const [corte, setCorte] = useState("");
  const [tipos, setTipos] = useState<Tipo[]>([]);
  const [editando, setEditando] = useState<string | null>(null);
  const [desfazer, setDesfazer] = useState<string | null>(null);
  const [formAberto, setFormAberto] = useState(false);

  const [fInicio, setFInicio] = useState(agoraHhmm);
  const [fFim, setFFim] = useState("");
  const [fDuracao, setFDuracao] = useState("");
  const [fTipo, setFTipo] = useState("at-estudo");
  const [fDesc, setFDesc] = useState("");
  const [fCurso, setFCurso] = useState("");

  const [ini, fim] = useMemo(() => limitesDoDia(dia), [dia]);

  const recarregar = useCallback(() => {
    invoke<Lancamento[]>("listar_periodo", { inicio: ini, fim })
      .then(setItens)
      .catch(() => {});
  }, [ini, fim]);

  useEffect(() => {
    invoke<Tipo[]>("listar_tipos").then(setTipos).catch(() => {});
  }, []);

  useEffect(() => {
    recarregar();
    const t = setInterval(recarregar, 5000);
    return () => clearInterval(t);
  }, [recarregar, versao]);

  const totais = useMemo(() => {
    let total = 0;
    let estudo = 0;
    const por = new Map<string, { nome: string; cor: string; ms: number }>();
    for (const i of itens) {
      const d = (i.ended_at ?? Date.now()) - i.started_at;
      total += d;
      if (i.conta_como_estudo) estudo += d;
      const at = por.get(i.activity_type_id) ?? { nome: i.atividade, cor: corDe(i, tema), ms: 0 };
      at.ms += d;
      por.set(i.activity_type_id, at);
    }
    return {
      total,
      estudo,
      por: [...por.values()].sort((a, b) => b.ms - a.ms),
    };
  }, [itens, tema]);

  const ehHoje = new Date().toDateString() === dia.toDateString();
  const DIA_MS = 86_400_000;

  const mudarDia = (delta: number) => {
    const d = new Date(dia);
    d.setDate(d.getDate() + delta);
    setDia(d);
    setEditando(null);
  };

  const limpar = () => {
    setFDesc("");
    setFDuracao("");
    setFFim("");
    setFInicio(agoraHhmm());
  };

  const adicionar = () => {
    if (!fInicio) return onErro("informe a hora de início");
    if (!fFim && !fDuracao.trim()) return onErro("informe o fim ou a duração");
    invoke("criar_lancamento", {
      inicio: comHora(dia, fInicio),
      fim: fFim ? comHora(dia, fFim) : null,
      duracao: fDuracao.trim() || null,
      activityTypeId: fTipo,
      descricao: fDesc.trim() || null,
      cursoId: fCurso || null,
    })
      .then(() => {
        limpar();
        onErro(null);
        onMudou();
        recarregar();
      })
      .catch((e) => onErro(String(e)));
  };

  const acao = (cmd: string, args: Record<string, unknown>) =>
    invoke(cmd, args)
      .then(() => {
        onErro(null);
        setSelecao([]);
        recarregar();
        onMudou();
      })
      .catch((e) => onErro(String(e)));

  /// Abre o corte na própria linha, com o meio só como sugestão.
  ///
  /// Cortar no meio automaticamente seria quase sempre errado: quem divide sabe
  /// a hora em que a sessão mudou de assunto, e é essa hora que importa.
  const abrirCorte = (i: Lancamento) => {
    setCortando(i.id);
    setCorte(hhmm(i.started_at + ((i.ended_at ?? Date.now()) - i.started_at) / 2));
  };

  const confirmarCorte = (id: string) => {
    if (!/^\d{1,2}:\d{2}$/.test(corte.trim())) {
      onErro(`não entendi a hora “${corte}”. Use HH:MM`);
      return;
    }
    acao("dividir_lancamento", { id, em: comHora(dia, corte.trim()) }).then(() =>
      setCortando(null)
    );
  };

  const excluir = (id: string) =>
    invoke("excluir_lancamento", { id })
      .then(() => {
        setDesfazer(id);
        onErro(null);
        recarregar();
      })
      .catch((e) => onErro(String(e)));

  return (
    <>
      <div style={{ display: "flex", alignItems: "flex-start", marginBottom: 22 }}>
        <div style={{ flex: 1 }}>
          <h1 className="titulo-pagina">
            {ehHoje
              ? "Hoje"
              : dia.toLocaleDateString("pt-BR", {
                  weekday: "long",
                  day: "2-digit",
                  month: "long",
                })}
          </h1>
          <p className="legenda" style={{ margin: 0 }}>
            {dia.toLocaleDateString("pt-BR", { dateStyle: "full" })}
          </p>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          <button className="btn btn-icone" onClick={() => mudarDia(-1)} aria-label="Dia anterior">
            <I.Seta />
          </button>
          <button className="btn" onClick={() => setDia(new Date())} disabled={ehHoje}>
            Hoje
          </button>
          <button className="btn btn-icone" onClick={() => mudarDia(1)} aria-label="Próximo dia">
            <I.Seta dir="dir" />
          </button>
        </div>
      </div>

      {desfazer && (
        <div className="aviso">
          <div style={{ flex: 1 }}>
            <strong>Lançamento excluído</strong>
            <p>Ele continua no banco — nada foi perdido de verdade.</p>
          </div>
          <button
            className="btn"
            onClick={() =>
              invoke("restaurar_lancamento", { id: desfazer })
                .then(() => {
                  setDesfazer(null);
                  recarregar();
                })
                .catch((e) => onErro(String(e)))
            }
          >
            Desfazer
          </button>
          <button className="btn btn-fantasma" onClick={() => setDesfazer(null)}>
            Dispensar
          </button>
        </div>
      )}

      <section className="card">
        <div className="totais">
          <div>
            <div className="total-valor">{durCurta(totais.estudo)}</div>
            <div className="total-rotulo">estudo efetivo</div>
          </div>
          <div>
            <div className="total-valor" style={{ color: "var(--tx-2)" }}>
              {durCurta(totais.total)}
            </div>
            <div className="total-rotulo">tempo registrado no dia</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 4 }}>
            {totais.por.map((a) => (
              <span key={a.nome} className="chip">
                <span className="chip-cor" style={{ background: a.cor }} />
                {a.nome} · <span className="num">{durCurta(a.ms)}</span>
              </span>
            ))}
          </div>
        </div>

        {/* Linha do tempo: mostra os buracos do dia, que a lista não mostra. */}
        <div className="faixa">
          {itens.map((i) => {
            const a = Math.max(i.started_at, ini);
            const b = Math.min(i.ended_at ?? Date.now(), fim);
            return (
              <div
                key={i.id}
                className="faixa-bloco"
                title={`${hhmm(i.started_at)} · ${i.description || i.atividade}`}
                style={{
                  left: `${((a - ini) / DIA_MS) * 100}%`,
                  width: `${Math.max(((b - a) / DIA_MS) * 100, 0.4)}%`,
                  background: corDe(i, tema),
                }}
              />
            );
          })}
          {ehHoje && (
            <div
              className="faixa-agora"
              style={{ left: `${((Date.now() - ini) / DIA_MS) * 100}%` }}
              title="agora"
            />
          )}
        </div>
        <div className="faixa-horas" aria-hidden>
          <span>00h</span><span>06h</span><span>12h</span><span>18h</span><span>24h</span>
        </div>

        {itens.length === 0 ? (
          <div className="vazio">
            Nada registrado neste dia.
            <br />
            Use o cronômetro na lateral, a extensão do Chrome, ou lance à mão.
          </div>
        ) : (
          itens.map((i) =>
            editando === i.id ? (
              <Editor
                key={i.id}
                item={i}
                dia={dia}
                tipos={tipos}
                cursos={cursos}
                onFechar={() => setEditando(null)}
                onSalvo={() => {
                  setEditando(null);
                  recarregar();
                  onMudou();
                }}
                onErro={onErro}
              />
            ) : (
              <div
                key={i.id}
                className={`lanc${i.sobrepoe ? " lanc-sobreposto" : ""}`}
              >
                <input
                  type="checkbox"
                  className="lanc-marca"
                  checked={selecao.includes(i.id)}
                  disabled={!i.ended_at}
                  onChange={(e) =>
                    setSelecao((s) =>
                      e.target.checked ? [...s, i.id] : s.filter((x) => x !== i.id)
                    )
                  }
                  aria-label={`Selecionar ${i.description || i.atividade}`}
                />
                <span className="lanc-cor" style={{ background: corDe(i, tema) }} />
                <span className="lanc-hora num">
                  {hhmm(i.started_at)} – {i.ended_at ? hhmm(i.ended_at) : "agora"}
                </span>
                <span className="lanc-texto">
                  {i.description || <span style={{ color: "var(--tx-2)" }}>{i.atividade}</span>}
                  {i.curso && <span className="lanc-curso"> · {i.curso}</span>}
                  {i.sobrepoe && (
                    <span className="marca-aviso" title="Divide relógio com outro lançamento">
                      sobreposto
                    </span>
                  )}
                </span>
                <span className="lanc-dur num">
                  {durCurta((i.ended_at ?? Date.now()) - i.started_at)}
                </span>
                <span className="lanc-acoes">
                  <button
                    className="btn btn-fantasma btn-icone"
                    onClick={() => acao("timer_continuar", { entryId: i.id })}
                    aria-label="Continuar este lançamento agora"
                    title="Continuar agora"
                  >
                    <I.Play size={14} />
                  </button>
                  <button
                    className="btn btn-fantasma btn-icone"
                    onClick={() => acao("duplicar_lancamento", { id: i.id })}
                    disabled={!i.ended_at}
                    aria-label="Duplicar lançamento"
                    title="Duplicar"
                  >
                    <I.Copia />
                  </button>
                  <button
                    className="btn btn-fantasma btn-icone"
                    onClick={() => abrirCorte(i)}
                    disabled={!i.ended_at}
                    aria-label="Dividir lançamento em dois"
                    title="Dividir"
                  >
                    <I.Tesoura />
                  </button>
                  <button
                    className="btn btn-fantasma btn-icone"
                    onClick={() => setEditando(i.id)}
                    disabled={!i.ended_at}
                    aria-label="Editar lançamento"
                  >
                    <I.Lapis />
                  </button>
                  <button
                    className="btn btn-fantasma btn-icone btn-perigo"
                    onClick={() => excluir(i.id)}
                    disabled={!i.ended_at}
                    aria-label="Excluir lançamento"
                  >
                    <I.Lixeira />
                  </button>
                </span>
                {cortando === i.id && (
                  <div className="lanc-corte">
                    <label htmlFor={`corte-${i.id}`}>cortar às</label>
                    <input
                      id={`corte-${i.id}`}
                      value={corte}
                      onChange={(e) => setCorte(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && confirmarCorte(i.id)}
                      placeholder="HH:MM"
                      autoFocus
                    />
                    <button className="btn btn-primario" onClick={() => confirmarCorte(i.id)}>
                      Cortar
                    </button>
                    <button className="btn btn-fantasma" onClick={() => setCortando(null)}>
                      Cancelar
                    </button>
                  </div>
                )}
              </div>
            )
          )
        )}

        {selecao.length > 0 && (
          <div className="barra-selecao" role="status">
            <span>
              {selecao.length} selecionado{selecao.length === 1 ? "" : "s"}
            </span>
            <button
              className="btn"
              disabled={selecao.length < 2}
              onClick={() => acao("unir_lancamentos", { ids: selecao })}
              title="Vira um lançamento só, do início do primeiro ao fim do último"
            >
              <I.Juntar /> Unir
            </button>
            <button className="btn btn-fantasma" onClick={() => setSelecao([])}>
              Limpar
            </button>
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-cab">
          <h2>Lançar à mão</h2>
          {!formAberto && (
            <button className="btn" onClick={() => setFormAberto(true)}>
              <I.Mais /> Novo lançamento
            </button>
          )}
        </div>

        {formAberto ? (
          <>
            <div className="grade">
              <div className="campo" style={{ width: 108 }}>
                <label htmlFor="ini">Início</label>
                <input id="ini" type="time" value={fInicio} onChange={(e) => setFInicio(e.target.value)} />
              </div>
              <div className="campo" style={{ width: 108 }}>
                <label htmlFor="fim">Fim</label>
                <input id="fim" type="time" value={fFim} onChange={(e) => setFFim(e.target.value)} />
              </div>
              <div className="campo" style={{ width: 132 }}>
                <label htmlFor="durac">ou duração</label>
                <input
                  id="durac"
                  placeholder="45m · 1h30 · 1:30"
                  value={fDuracao}
                  onChange={(e) => setFDuracao(e.target.value)}
                />
              </div>
              <div className="campo" style={{ width: 150 }}>
                <label htmlFor="tipo">Atividade</label>
                <select id="tipo" value={fTipo} onChange={(e) => setFTipo(e.target.value)}>
                  {tipos.map((t) => (
                    <option key={t.id} value={t.id}>{t.nome}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grade" style={{ marginTop: 12 }}>
              <div className="campo cresce">
                <label htmlFor="desc">O que foi feito</label>
                <input
                  id="desc"
                  value={fDesc}
                  onChange={(e) => setFDesc(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && adicionar()}
                />
              </div>
              <div className="campo" style={{ width: 180 }}>
                <label htmlFor="curso">Curso</label>
                <select id="curso" value={fCurso} onChange={(e) => setFCurso(e.target.value)}>
                  <option value="">— nenhum —</option>
                  {cursos.map((c) => (
                    <option key={c.id} value={c.id}>{c.titulo}</option>
                  ))}
                </select>
              </div>
              <button className="btn btn-primario" onClick={adicionar}>Lançar</button>
              <button
                className="btn btn-fantasma"
                onClick={() => { setFormAberto(false); limpar(); }}
              >
                Cancelar
              </button>
            </div>

            <p className="nota">
              Informe o fim ou a duração — se vierem os dois, o fim ganha. Fora o
              tempo, nenhum campo é obrigatório.
            </p>
          </>
        ) : (
          <p className="nota" style={{ margin: 0 }}>
            Esqueceu de ligar o cronômetro? Dá para registrar depois, em qualquer
            data.
          </p>
        )}
      </section>
    </>
  );
}

function Editor({
  item, dia, tipos, cursos, onFechar, onSalvo, onErro,
}: {
  item: Lancamento;
  dia: Date;
  tipos: Tipo[];
  cursos: Curso[];
  onFechar: () => void;
  onSalvo: () => void;
  onErro: (e: string | null) => void;
}) {
  const [inicio, setInicio] = useState(hhmm(item.started_at));
  const [fim, setFim] = useState(hhmm(item.ended_at ?? item.started_at));
  const [tipo, setTipo] = useState(item.activity_type_id);
  const [desc, setDesc] = useState(item.description ?? "");
  const [curso, setCurso] = useState(item.course_id ?? "");

  const salvar = () =>
    invoke("editar_lancamento", {
      id: item.id,
      inicio: comHora(dia, inicio),
      fim: comHora(dia, fim),
      activityTypeId: tipo,
      descricao: desc.trim() || null,
      cursoId: curso || null,
    })
      .then(() => { onErro(null); onSalvo(); })
      .catch((e) => onErro(String(e)));

  return (
    <div
      onKeyDown={(e) => {
        if (e.key === "Escape") onFechar();
        if (e.key === "Enter") salvar();
      }}
      style={{
        border: "1px solid var(--acc)",
        borderRadius: "var(--r-sm)",
        padding: 12,
        margin: "6px -10px",
        background: "var(--surf-2)",
      }}
    >
      <div className="grade">
        <div className="campo" style={{ width: 104 }}>
          <label>Início</label>
          <input type="time" value={inicio} onChange={(e) => setInicio(e.target.value)} autoFocus />
        </div>
        <div className="campo" style={{ width: 104 }}>
          <label>Fim</label>
          <input type="time" value={fim} onChange={(e) => setFim(e.target.value)} />
        </div>
        <div className="campo" style={{ width: 140 }}>
          <label>Atividade</label>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {tipos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
        </div>
        <div className="campo" style={{ width: 160 }}>
          <label>Curso</label>
          <select value={curso} onChange={(e) => setCurso(e.target.value)}>
            <option value="">— nenhum —</option>
            {cursos.map((c) => <option key={c.id} value={c.id}>{c.titulo}</option>)}
          </select>
        </div>
      </div>
      <div className="grade" style={{ marginTop: 10 }}>
        <div className="campo cresce">
          <label>Descrição</label>
          <input value={desc} onChange={(e) => setDesc(e.target.value)} />
        </div>
        <button className="btn btn-primario" onClick={salvar}>Salvar</button>
        <button className="btn btn-fantasma" onClick={onFechar}>Cancelar</button>
      </div>
      <p className="nota" style={{ marginTop: 8 }}>
        Enter salva, Esc cancela. A versão anterior fica guardada no histórico.
      </p>
    </div>
  );
}
