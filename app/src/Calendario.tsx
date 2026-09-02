import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Curso, durCurta } from "./App";
import { Lancamento, Tipo, corDe, hhmm, segundaDe, DIA } from "./tempo-comum";
import * as I from "./icones";

const DIAS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];
const MIN = 60_000;
/** Altura de uma hora. Tudo no traçado deriva daqui. */
const H = 46;
/** Largura da régua de horas à esquerda; o mesmo valor está no CSS da grade. */
const CANAL = 46;
/** Passo do arrasto. Cinco minutos é fino o bastante para ser honesto e grosso
 *  o bastante para o ponteiro não exigir precisão de cirurgião. */
const PASSO = 5;

type Arrasto = {
  tipo: "criar" | "mover" | "fim" | "inicio";
  id?: string;
  dia: number;
  /** Minutos desde a meia-noite do dia, no início do arrasto. */
  ancora: number;
  inicio: number;
  fim: number;
};

const minutosDoDia = (ms: number, base: number) => (ms - base) / MIN;

type Posto = { l: Lancamento; ini: number; fim: number; col: number; colunas: number };

/**
 * Reparte a largura entre blocos que dividem relógio.
 *
 * Sobreposição é permitida no modelo (caminhar com os dogs durante a pausa), e
 * um calendário que só empilhasse esconderia um lançamento atrás do outro — o
 * pior resultado possível para a tela cujo trabalho é mostrar onde o tempo foi.
 * Cada grupo que se toca vira um bloco de colunas, e todos aparecem.
 */
function repartir(itens: Lancamento[], base: number): Posto[] {
  const postos: Posto[] = itens
    .map((l) => ({
      l,
      ini: minutosDoDia(l.started_at, base),
      fim: minutosDoDia(l.ended_at ?? Date.now(), base),
      col: 0,
      colunas: 1,
    }))
    .sort((a, b) => a.ini - b.ini || b.fim - a.fim);

  let grupo: Posto[] = [];
  let ateOnde = -Infinity;

  const fecharGrupo = () => {
    const largura = grupo.reduce((m, p) => Math.max(m, p.col + 1), 1);
    grupo.forEach((p) => (p.colunas = largura));
    grupo = [];
  };

  for (const p of postos) {
    if (p.ini >= ateOnde) fecharGrupo();
    // A primeira coluna livre no instante em que este começa.
    const ocupadas = new Set(grupo.filter((q) => q.fim > p.ini).map((q) => q.col));
    while (ocupadas.has(p.col)) p.col++;
    grupo.push(p);
    ateOnde = Math.max(ateOnde, p.fim);
  }
  fecharGrupo();
  return postos;
}

/**
 * Calendário semanal com blocos manipuláveis (§3.5).
 *
 * O mapeamento é direto: um minuto vale `H / 60` pixels, e toda posição sai
 * dessa conta. Nada de biblioteca de calendário — o que existe aqui é uma
 * régua, e uma régua com regras próprias de arredondamento seria mais difícil
 * de confiar do que de escrever.
 */
export default function Calendario({
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
  const [seg, setSeg] = useState(() => segundaDe(new Date()));
  const [itens, setItens] = useState<Lancamento[]>([]);
  const [tipos, setTipos] = useState<Tipo[]>([]);
  const [tipoNovo, setTipoNovo] = useState("");
  const [arrasto, setArrasto] = useState<Arrasto | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const corpo = useRef<HTMLDivElement>(null);

  const recarregar = useCallback(() => {
    invoke<Lancamento[]>("listar_periodo", {
      inicio: seg.getTime(),
      fim: seg.getTime() + 7 * DIA,
    })
      .then(setItens)
      .catch((e) => onErro(String(e)));
  }, [seg, onErro]);

  useEffect(recarregar, [recarregar, versao]);

  useEffect(() => {
    invoke<Tipo[]>("listar_tipos")
      .then((t) => {
        setTipos(t);
        setTipoNovo((a) => a || t.find((x) => x.conta_como_estudo)?.id || t[0]?.id || "");
      })
      .catch(() => {});
  }, []);

  // Só as horas que têm alguma coisa, mais uma folga. Mostrar 24 horas sempre
  // deixaria a madrugada vazia ocupando metade da tela.
  const [h0, h1] = useMemo(() => {
    let min = 7;
    let max = 22;
    for (const l of itens) {
      const i = Math.floor((l.started_at - seg.getTime()) / DIA);
      if (i < 0 || i > 6) continue;
      const base = seg.getTime() + i * DIA;
      min = Math.min(min, Math.floor(minutosDoDia(l.started_at, base) / 60));
      max = Math.max(max, Math.ceil(minutosDoDia(l.ended_at ?? Date.now(), base) / 60));
    }
    return [Math.max(0, min), Math.min(24, Math.max(max, min + 4))];
  }, [itens, seg]);

  const horas = Array.from({ length: h1 - h0 }, (_, i) => h0 + i);
  const topo = (min: number) => ((min - h0 * 60) / 60) * H;

  /** Minutos desde a meia-noite, a partir da posição do ponteiro na coluna. */
  const minutoEm = (e: { clientY: number }, col: HTMLElement) => {
    const r = col.getBoundingClientRect();
    const bruto = h0 * 60 + ((e.clientY - r.top) / H) * 60;
    return Math.round(bruto / PASSO) * PASSO;
  };

  const comecar = (
    e: React.PointerEvent,
    tipo: Arrasto["tipo"],
    dia: number,
    l?: Lancamento
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const col = (e.currentTarget as HTMLElement).closest(".cal-col") as HTMLElement;
    if (!col) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const m = minutoEm(e, col);
    const base = seg.getTime() + dia * DIA;
    setSel(l?.id ?? null);
    setArrasto({
      tipo,
      id: l?.id,
      dia,
      ancora: m,
      inicio: l ? minutosDoDia(l.started_at, base) : m,
      fim: l ? minutosDoDia(l.ended_at ?? Date.now(), base) : m,
    });
  };

  /// Sobre qual dia o ponteiro está. Mover atravessa colunas — um bloco preso à
  /// coluna em que nasceu obrigaria a excluir e recriar para corrigir o dia,
  /// que é o erro mais comum de quem lança à mão.
  const diaEm = (e: { clientX: number }) => {
    const g = corpo.current;
    if (!g) return null;
    const r = g.getBoundingClientRect();
    const largura = (r.width - CANAL) / 7;
    return Math.min(6, Math.max(0, Math.floor((e.clientX - r.left - CANAL) / largura)));
  };

  const mexer = (e: React.PointerEvent, dia: number) => {
    if (!arrasto || arrasto.dia !== dia) return;
    const col = (e.currentTarget as HTMLElement).closest(".cal-col") as HTMLElement;
    if (!col) return;
    const m = minutoEm(e, col);
    const outroDia = arrasto.tipo === "mover" ? diaEm(e) : null;
    setArrasto((a) => {
      if (!a) return a;
      if (a.tipo === "criar") return { ...a, inicio: Math.min(a.ancora, m), fim: Math.max(a.ancora, m) };
      if (a.tipo === "fim") return { ...a, fim: Math.max(a.inicio + PASSO, m) };
      if (a.tipo === "inicio") return { ...a, inicio: Math.min(a.fim - PASSO, m) };
      const d = m - a.ancora;
      return {
        ...a,
        dia: outroDia ?? a.dia,
        ancora: m,
        inicio: a.inicio + d,
        fim: a.fim + d,
      };
    });
  };

  const soltar = () => {
    const a = arrasto;
    setArrasto(null);
    if (!a) return;

    const base = seg.getTime() + a.dia * DIA;
    const inicio = Math.round(base + a.inicio * MIN);
    const fim = Math.round(base + a.fim * MIN);

    // Um clique sem arrasto não cria nada. Sem este corte, cada toque na grade
    // deixaria um lançamento de zero minuto para o usuário limpar depois.
    if (fim - inicio < PASSO * MIN) return;

    if (a.tipo === "criar") {
      invoke("criar_lancamento", {
        inicio,
        fim,
        duracao: null,
        activityTypeId: tipoNovo,
        descricao: null,
        cursoId: null,
      })
        .then(() => {
          onErro(null);
          recarregar();
          onMudou();
        })
        .catch((e) => onErro(String(e)));
      return;
    }

    const l = itens.find((x) => x.id === a.id);
    if (!l) return;
    if (l.started_at === inicio && l.ended_at === fim) return;
    invoke("editar_lancamento", {
      id: l.id,
      inicio,
      fim,
      activityTypeId: l.activity_type_id,
      descricao: l.description,
      cursoId: l.course_id,
    })
      .then(() => {
        onErro(null);
        recarregar();
        onMudou();
      })
      .catch((e) => onErro(String(e)));
  };

  const mover = (n: number) => {
    const d = new Date(seg);
    d.setDate(d.getDate() + n * 7);
    setSeg(d);
  };

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const agoraMin = new Date().getHours() * 60 + new Date().getMinutes();
  const colunaHoje = Math.floor((hoje.getTime() - seg.getTime()) / DIA);

  const selecionado = itens.find((l) => l.id === sel) ?? null;

  // Enquanto o arrasto corre, o dia do bloco é o de destino: senão ele sumiria
  // da coluna de origem sem aparecer na de chegada.
  const diaDe = (l: Lancamento) =>
    arrasto?.id === l.id
      ? arrasto.dia
      : Math.floor((l.started_at - seg.getTime()) / DIA);

  return (
    <>
      <div className="periodo">
        <button className="btn btn-icone" onClick={() => mover(-1)} aria-label="Semana anterior">
          <I.Seta />
        </button>
        <button className="btn" onClick={() => setSeg(segundaDe(new Date()))}>
          Esta semana
        </button>
        <button className="btn btn-icone" onClick={() => mover(1)} aria-label="Próxima semana">
          <I.Seta dir="dir" />
        </button>
        <span className="periodo-rotulo">
          {seg.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} –{" "}
          {new Date(seg.getTime() + 6 * DIA).toLocaleDateString("pt-BR", {
            day: "2-digit",
            month: "short",
          })}
        </span>
        <div className="campo" style={{ width: 160, marginLeft: "auto" }}>
          <label htmlFor="cn">Criar como</label>
          <select id="cn" value={tipoNovo} onChange={(e) => setTipoNovo(e.target.value)}>
            {tipos.map((t) => (
              <option key={t.id} value={t.id}>{t.nome}</option>
            ))}
          </select>
        </div>
      </div>

      <section className="card">
        <div className="cal-rolagem">
          <div className="cal">
            <div className="cal-cab">
              <div className="cal-canto" />
              {DIAS.map((d, i) => {
                const data = new Date(seg.getTime() + i * DIA);
                return (
                  <div key={d} className={`cal-dia${i === colunaHoje ? " cal-dia-hoje" : ""}`}>
                    <span>{d}</span> <span className="num">{data.getDate()}</span>
                  </div>
                );
              })}
            </div>

            <div className="cal-corpo" ref={corpo} style={{ height: horas.length * H }}>
              <div className="cal-horas">
                {horas.map((h) => (
                  <div key={h} className="cal-hora" style={{ height: H }}>
                    <span>{String(h).padStart(2, "0")}h</span>
                  </div>
                ))}
              </div>

              {DIAS.map((_, dia) => (
                <div
                  key={dia}
                  className="cal-col"
                  onPointerDown={(e) => comecar(e, "criar", dia)}
                  onPointerMove={(e) => mexer(e, dia)}
                  onPointerUp={soltar}
                  onPointerCancel={soltar}
                >
                  {horas.map((h) => (
                    <div key={h} className="cal-celula" style={{ height: H }} />
                  ))}

                  {dia === colunaHoje && agoraMin >= h0 * 60 && agoraMin <= h1 * 60 && (
                    <div className="cal-agora" style={{ top: topo(agoraMin) }} />
                  )}

                  {repartir(
                    itens.filter((l) => diaDe(l) === dia),
                    seg.getTime() + dia * DIA
                  ).map(({ l, col, colunas, ...p }) => {
                      const arrastando = arrasto?.id === l.id;
                      const ini = arrastando ? arrasto!.inicio : p.ini;
                      const fim = arrastando ? arrasto!.fim : p.fim;
                      const alt = ((fim - ini) / 60) * H;
                      return (
                        <div
                          key={l.id}
                          className={`cal-bloco${sel === l.id ? " cal-bloco-sel" : ""}${
                            l.sobrepoe ? " cal-bloco-sobreposto" : ""
                          }`}
                          style={{
                            top: topo(ini),
                            height: Math.max(alt, 13),
                            background: corDe(l, tema),
                            left: `calc(${(col / colunas) * 100}% + 3px)`,
                            width: `calc(${100 / colunas}% - 6px)`,
                            right: "auto",
                            // Arrastando vem para a frente: senão o bloco em
                            // movimento passa por baixo do vizinho.
                            zIndex: arrastando ? 4 : 1,
                          }}
                          onPointerDown={(e) => comecar(e, "mover", dia, l)}
                          title={`${hhmm(l.started_at)} – ${
                            l.ended_at ? hhmm(l.ended_at) : "agora"
                          } · ${l.description || l.atividade}`}
                        >
                          <span
                            className="cal-alca cal-alca-topo"
                            onPointerDown={(e) => comecar(e, "inicio", dia, l)}
                          />
                          {alt > 26 && (
                            <span className="cal-bloco-txt">
                              {l.description || l.atividade}
                            </span>
                          )}
                          <span className="cal-bloco-dur num">
                            {durCurta((fim - ini) * MIN)}
                          </span>
                          <span
                            className="cal-alca cal-alca-baixo"
                            onPointerDown={(e) => comecar(e, "fim", dia, l)}
                          />
                        </div>
                      );
                    })}

                  {arrasto?.tipo === "criar" && arrasto.dia === dia && (
                    <div
                      className="cal-bloco cal-bloco-novo"
                      style={{
                        top: topo(arrasto.inicio),
                        height: Math.max(((arrasto.fim - arrasto.inicio) / 60) * H, 2),
                      }}
                    >
                      <span className="cal-bloco-dur num">
                        {durCurta((arrasto.fim - arrasto.inicio) * MIN)}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {selecionado ? (
          <Detalhe
            l={selecionado}
            cursos={cursos}
            tipos={tipos}
            onFechar={() => setSel(null)}
            onErro={onErro}
            onSalvo={() => {
              recarregar();
              onMudou();
            }}
          />
        ) : (
          <p className="nota">
            Arraste numa faixa vazia para criar. Arraste o bloco para mover, ou
            as bordas para esticar. O passo é de 5 minutos.
          </p>
        )}
      </section>
    </>
  );
}

/** Edição do bloco escolhido, embaixo da grade e não numa janela por cima. */
function Detalhe({
  l,
  cursos,
  tipos,
  onFechar,
  onErro,
  onSalvo,
}: {
  l: Lancamento;
  cursos: Curso[];
  tipos: Tipo[];
  onFechar: () => void;
  onErro: (e: string | null) => void;
  onSalvo: () => void;
}) {
  const [desc, setDesc] = useState(l.description ?? "");
  const [tipo, setTipo] = useState(l.activity_type_id);
  const [curso, setCurso] = useState(l.course_id ?? "");

  useEffect(() => {
    setDesc(l.description ?? "");
    setTipo(l.activity_type_id);
    setCurso(l.course_id ?? "");
  }, [l.id, l.description, l.activity_type_id, l.course_id]);

  const salvar = () =>
    invoke("editar_lancamento", {
      id: l.id,
      inicio: l.started_at,
      fim: l.ended_at,
      activityTypeId: tipo,
      descricao: desc.trim() || null,
      cursoId: curso || null,
    })
      .then(() => {
        onErro(null);
        onSalvo();
      })
      .catch((e) => onErro(String(e)));

  return (
    <div className="cal-detalhe">
      <div className="grade">
        <span className="lanc-hora num" style={{ alignSelf: "center" }}>
          {hhmm(l.started_at)} – {l.ended_at ? hhmm(l.ended_at) : "agora"}
        </span>
        <div className="campo cresce">
          <label htmlFor="cd">Descrição</label>
          <input id="cd" value={desc} onChange={(e) => setDesc(e.target.value)} />
        </div>
        <div className="campo" style={{ width: 140 }}>
          <label htmlFor="cc">Categoria</label>
          <select id="cc" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {tipos.map((t) => (
              <option key={t.id} value={t.id}>{t.nome}</option>
            ))}
          </select>
        </div>
        <div className="campo" style={{ width: 160 }}>
          <label htmlFor="cu">Curso</label>
          <select id="cu" value={curso} onChange={(e) => setCurso(e.target.value)}>
            <option value="">— nenhum —</option>
            {cursos.map((c) => (
              <option key={c.id} value={c.id}>{c.titulo}</option>
            ))}
          </select>
        </div>
        <button className="btn btn-primario" onClick={salvar}>Salvar</button>
        <button
          className="btn btn-fantasma btn-icone btn-perigo"
          onClick={() =>
            invoke("excluir_lancamento", { id: l.id })
              .then(() => {
                onFechar();
                onSalvo();
              })
              .catch((e) => onErro(String(e)))
          }
          aria-label="Excluir lançamento"
        >
          <I.Lixeira />
        </button>
        <button className="btn btn-fantasma btn-icone" onClick={onFechar} aria-label="Fechar">
          <I.Fechar />
        </button>
      </div>
    </div>
  );
}
