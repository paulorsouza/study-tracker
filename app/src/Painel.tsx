import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Curso, durCurta } from "./App";
import Metas from "./Metas";
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
  course_id: string | null;
  curso: string | null;
};

type Tema = "escuro" | "claro";

/** O passo escuro é escolhido contra a superfície escura — não é o claro clareado. */
const corDe = (l: { cor: string; cor_escura: string | null }, tema: Tema) =>
  tema === "escuro" ? l.cor_escura ?? l.cor : l.cor;

const DIA_MS = 86_400_000;

function inicioDoDia(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Fatia o lançamento por dia local: sessão que cruza a meia-noite conta em cada
 *  dia o pedaço que ficou nele, não tudo no dia em que começou. */
function porDiaLocal(itens: Lancamento[], dias: Date[]) {
  const mapa = new Map(dias.map((d) => [d.getTime(), 0]));
  for (const l of itens) {
    if (!l.conta_como_estudo || !l.ended_at) continue;
    for (const d of dias) {
      const a = d.getTime();
      const b = a + DIA_MS;
      const inter = Math.min(l.ended_at, b) - Math.max(l.started_at, a);
      if (inter > 0) mapa.set(a, (mapa.get(a) ?? 0) + inter);
    }
  }
  return dias.map((d) => ({ dia: d, ms: mapa.get(d.getTime()) ?? 0 }));
}

const PERIODOS = [
  { dias: 7, nome: "7 dias" },
  { dias: 14, nome: "14 dias" },
  { dias: 30, nome: "30 dias" },
];

export default function Painel({
  cursos,
  versao,
  tema,
  irPara,
}: {
  cursos: Curso[];
  versao: number;
  tema: Tema;
  irPara: (aba: "hoje" | "plano" | "cursos") => void;
}) {
  const [itens, setItens] = useState<Lancamento[]>([]);
  const [periodo, setPeriodo] = useState(14);
  const [foco, setFoco] = useState<number | null>(null);

  // Uma busca só, com a janela mais longa de que qualquer bloco precisa. Todos
  // os números da tela saem do mesmo conjunto — assim eles não podem discordar
  // entre si, que é o defeito clássico de painel montado com várias consultas.
  useEffect(() => {
    const fim = inicioDoDia(new Date()).getTime() + DIA_MS;
    const inicio = fim - 90 * DIA_MS;
    invoke<Lancamento[]>("listar_periodo", { inicio, fim })
      .then(setItens)
      .catch(() => {});
  }, [versao]);

  const dados = useMemo(() => {
    const hoje0 = inicioDoDia(new Date());

    const diasSerie = Array.from({ length: periodo }, (_, i) => {
      const d = new Date(hoje0);
      d.setDate(d.getDate() - (periodo - 1 - i));
      return d;
    });
    const serie = porDiaLocal(itens, diasSerie);

    // Sequência: dias seguidos com estudo, olhando para trás. Se hoje ainda não
    // tem nada, a conta começa em ontem — o plano é explícito em não punir
    // pausa, e zerar a sequência às 00h01 seria exatamente isso.
    const dias90 = Array.from({ length: 90 }, (_, i) => {
      const d = new Date(hoje0);
      d.setDate(d.getDate() - (89 - i));
      return d;
    });
    const hist = porDiaLocal(itens, dias90);
    let seq = 0;
    for (let i = hist.length - 1; i >= 0; i--) {
      if (hist[i].ms > 0) seq++;
      else if (i === hist.length - 1) continue; // hoje ainda em aberto
      else break;
    }

    const hojeMs = hist[hist.length - 1].ms;

    // Semana corrente, de segunda a hoje.
    const seg = new Date(hoje0);
    seg.setDate(seg.getDate() - ((seg.getDay() + 6) % 7));
    const semanaMs = hist
      .filter((h) => h.dia >= seg)
      .reduce((s, h) => s + h.ms, 0);

    const desde = hoje0.getTime() - (periodo - 1) * DIA_MS;
    const noPeriodo = itens.filter((l) => l.ended_at && l.ended_at >= desde);

    const porCurso = new Map<string, number>();
    const porAtiv = new Map<string, { nome: string; cor: string; ms: number }>();
    for (const l of noPeriodo) {
      const d = l.ended_at! - l.started_at;
      if (l.conta_como_estudo) {
        const k = l.curso ?? "Sem curso";
        porCurso.set(k, (porCurso.get(k) ?? 0) + d);
      }
      const a = porAtiv.get(l.activity_type_id) ?? {
        nome: l.atividade,
        cor: corDe(l, tema),
        ms: 0,
      };
      a.ms += d;
      porAtiv.set(l.activity_type_id, a);
    }

    return {
      serie,
      seq,
      hojeMs,
      semanaMs,
      totalPeriodo: serie.reduce((s, x) => s + x.ms, 0),
      porCurso: [...porCurso.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6),
      porAtiv: [...porAtiv.values()].sort((a, b) => b.ms - a.ms),
    };
  }, [itens, periodo, tema]);

  const maxDia = Math.max(...dados.serie.map((s) => s.ms), 1);
  const maxCurso = Math.max(...dados.porCurso.map(([, ms]) => ms), 1);
  const melhor = dados.serie.reduce((a, b) => (b.ms > a.ms ? b : a), dados.serie[0]);

  // Curso sem lançamento no período todo, mas que já teve algum dia.
  const parados = cursos.filter(
    (c) => c.ultima_url_em && Date.now() - c.ultima_url_em > 14 * DIA_MS
  );

  return (
    <>
      <h1 className="titulo-pagina">Painel</h1>
      <p className="legenda">
        Visão macro da rotina. Todos os números vêm da mesma consulta, então não
        podem discordar entre si.
      </p>

      <div className="tiles">
        <Tile valor={durCurta(dados.hojeMs)} rotulo="estudo hoje" destaque />
        <Tile valor={durCurta(dados.semanaMs)} rotulo="esta semana" />
        <Tile
          valor={String(dados.seq)}
          rotulo={dados.seq === 1 ? "dia seguido" : "dias seguidos"}
        />
        <Tile
          valor={durCurta(dados.totalPeriodo / Math.max(periodo, 1))}
          rotulo="média por dia"
        />
      </div>

      <Metas itens={itens} tema={tema} versao={versao} />

      <section className="card">
        <div className="card-cab">
          <h2>Estudo por dia</h2>
          <div className="abas" style={{ marginBottom: 0 }}>
            {PERIODOS.map((p) => (
              <button
                key={p.dias}
                className="aba"
                aria-current={periodo === p.dias ? "page" : undefined}
                onClick={() => setPeriodo(p.dias)}
              >
                {p.nome}
              </button>
            ))}
          </div>
        </div>

        {dados.totalPeriodo === 0 ? (
          <div className="vazio">
            Nenhum estudo registrado no período.
            <br />
            Dia sem registro não é falta — é só dia sem registro.
          </div>
        ) : (
          <>
            <div
              className="grafico"
              role="img"
              aria-label={`Estudo por dia nos últimos ${periodo} dias. Melhor dia: ${melhor.dia.toLocaleDateString(
                "pt-BR"
              )}, ${durCurta(melhor.ms)}.`}
            >
              <div className="grafico-topo">
                <span className="grafico-marca">{durCurta(maxDia)}</span>
              </div>
              <div className="barras" onMouseLeave={() => setFoco(null)}>
                {dados.serie.map((s, i) => (
                  <div
                    key={i}
                    className="barra-alvo"
                    onMouseEnter={() => setFoco(i)}
                    tabIndex={0}
                    onFocus={() => setFoco(i)}
                    onBlur={() => setFoco(null)}
                    aria-label={`${s.dia.toLocaleDateString("pt-BR")}: ${durCurta(s.ms)}`}
                  >
                    {foco === i && (
                      <div className="dica" role="status">
                        <b>{durCurta(s.ms)}</b>
                        <span>
                          {s.dia.toLocaleDateString("pt-BR", {
                            weekday: "short",
                            day: "2-digit",
                            month: "2-digit",
                          })}
                        </span>
                      </div>
                    )}
                    <div
                      className={`barra${foco === i ? " ativa" : ""}`}
                      style={{ height: `${(s.ms / maxDia) * 100}%` }}
                    />
                  </div>
                ))}
              </div>
              <div className="eixo">
                {dados.serie.map((s, i) => (
                  <span key={i}>
                    {/* Em 7 e 14 dias a inicial do dia da semana orienta; em 30
                        ela vira ruído, porque uma letra a cada cinco dias não
                        diz de que dia se trata. Aí o eixo mostra data. */}
                    {periodo <= 14
                      ? s.dia.toLocaleDateString("pt-BR", { weekday: "narrow" })
                      : i % 5 === 0
                      ? s.dia.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
                      : ""}
                  </span>
                ))}
              </div>
            </div>
            <p className="nota">
              Melhor dia do período:{" "}
              <b>
                {melhor.dia.toLocaleDateString("pt-BR", {
                  weekday: "long",
                  day: "2-digit",
                  month: "2-digit",
                })}
              </b>
              , {durCurta(melhor.ms)}.
            </p>
          </>
        )}
      </section>

      <div className="duas">
        <section className="card">
          <h2>Onde foi o estudo</h2>
          {dados.porCurso.length === 0 ? (
            <p className="nota" style={{ margin: 0 }}>Nada no período.</p>
          ) : (
            dados.porCurso.map(([nome, ms]) => (
              <div key={nome} className="ranking">
                <span className="ranking-nome" title={nome}>{nome}</span>
                <span className="ranking-trilho">
                  <span
                    className="ranking-barra"
                    style={{ width: `${(ms / maxCurso) * 100}%` }}
                  />
                </span>
                <span className="ranking-valor num">{durCurta(ms)}</span>
              </div>
            ))
          )}
        </section>

        <section className="card">
          <h2>A rotina inteira</h2>
          {dados.porAtiv.length === 0 ? (
            <p className="nota" style={{ margin: 0 }}>Nada no período.</p>
          ) : (
            dados.porAtiv.map((a) => (
              <div key={a.nome} className="ranking">
                <span className="chip-cor" style={{ background: a.cor }} />
                <span className="ranking-nome" title={a.nome}>{a.nome}</span>
                <span className="ranking-valor num">{durCurta(a.ms)}</span>
              </div>
            ))
          )}
          <p className="nota">
            Exercício e descanso aparecem aqui, mas nunca somam nas horas
            estudadas.
          </p>
        </section>
      </div>

      {parados.length > 0 && (
        <section className="card">
          <div className="card-cab">
            <h2>Cursos parados</h2>
            <button className="btn btn-fantasma" onClick={() => irPara("cursos")}>
              Ver cursos
            </button>
          </div>
          {parados.map((c) => (
            <div key={c.id} className="ranking">
              <span className="ranking-nome">{c.titulo}</span>
              <span className="ranking-valor" style={{ color: "var(--tx-2)" }}>
                {Math.floor((Date.now() - c.ultima_url_em!) / DIA_MS)} dias
              </span>
            </div>
          ))}
          <p className="nota">
            Sem atividade há mais de duas semanas. Não é cobrança — pode ser hora
            de arquivar.
          </p>
        </section>
      )}

      <div className="atalhos">
        <button className="btn" onClick={() => irPara("plano")}>
          <I.Lista /> Ver planejamento
        </button>
        <button className="btn" onClick={() => irPara("hoje")}>
          <I.Calendario /> Ver o dia
        </button>
      </div>
    </>
  );
}

function Tile({
  valor,
  rotulo,
  destaque,
}: {
  valor: string;
  rotulo: string;
  destaque?: boolean;
}) {
  return (
    <div className="tile">
      <div className={`tile-valor${destaque ? " tile-destaque" : ""}`}>{valor}</div>
      <div className="tile-rotulo">{rotulo}</div>
    </div>
  );
}
