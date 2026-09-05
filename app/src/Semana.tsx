import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { durCurta } from "./App";
import { Lancamento, corDe, segundaDe, DIA } from "./tempo-comum";
import * as I from "./icones";

const DIAS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

type Linha = {
  nome: string;
  cor: string;
  cor_escura: string | null;
  icone: string | null;
  estudo: boolean;
  dias: number[];
};

/**
 * A semana em sete cartões, um por dia: o estudo do dia em destaque, o
 * registrado ao todo, e as categorias que apareceram. "Sem obrigação de
 * preenchimento" (§3.5) continua valendo — dia sem registro é um cartão
 * vazio, não um zero.
 */
export default function Semana({
  versao,
  tema,
  onErro,
  onAbrirDia,
}: {
  versao: number;
  tema: string;
  onErro: (e: string | null) => void;
  onAbrirDia: (d: Date) => void;
}) {
  const [seg, setSeg] = useState(() => segundaDe(new Date()));
  const [itens, setItens] = useState<Lancamento[]>([]);

  const recarregar = useCallback(() => {
    invoke<Lancamento[]>("listar_periodo", {
      inicio: seg.getTime(),
      fim: seg.getTime() + 7 * DIA,
    })
      .then(setItens)
      .catch((e) => onErro(String(e)));
  }, [seg, onErro]);

  useEffect(recarregar, [recarregar, versao]);

  const grade = useMemo(() => {
    // A soma é por dia local, e o dia de um lançamento é o do seu **início**.
    // Uma sessão que atravessa a meia-noite conta inteira no dia em que
    // começou: reparti-la entre dois dias faria a folha divergir da lista de
    // Hoje, que é onde o usuário confere.
    const linhas = new Map<string, Linha>();
    for (const l of itens) {
      const i = Math.floor((l.started_at - seg.getTime()) / DIA);
      if (i < 0 || i > 6) continue;
      let r = linhas.get(l.activity_type_id);
      if (!r) {
        r = {
          nome: l.atividade,
          cor: l.cor,
          cor_escura: l.cor_escura,
          icone: l.icone ?? null,
          estudo: l.conta_como_estudo,
          dias: Array(7).fill(0),
        };
        linhas.set(l.activity_type_id, r);
      }
      r.dias[i] += (l.ended_at ?? Date.now()) - l.started_at;
    }
    const ordenadas = [...linhas.values()].sort(
      (a, b) =>
        Number(b.estudo) - Number(a.estudo) ||
        b.dias.reduce((x, y) => x + y, 0) - a.dias.reduce((x, y) => x + y, 0)
    );
    const porDia = Array(7)
      .fill(0)
      .map((_, i) => ordenadas.reduce((s, r) => s + r.dias[i], 0));
    const estudoPorDia = Array(7)
      .fill(0)
      .map((_, i) => ordenadas.reduce((s, r) => s + (r.estudo ? r.dias[i] : 0), 0));
    return { linhas: ordenadas, porDia, estudoPorDia };
  }, [itens, seg]);

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const totalSemana = grade.porDia.reduce((a, b) => a + b, 0);
  const estudoSemana = grade.estudoPorDia.reduce((a, b) => a + b, 0);
  const pico = Math.max(...grade.estudoPorDia, 1);
  const diasComEstudo = grade.estudoPorDia.filter((x) => x > 0).length;

  const mover = (n: number) => {
    const d = new Date(seg);
    d.setDate(d.getDate() + n * 7);
    setSeg(d);
  };

  const rotulo = `${seg.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} – ${new Date(
    seg.getTime() + 6 * DIA
  ).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}`;

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
        <span className="periodo-rotulo">{rotulo}</span>
      </div>

      <div className="tiles">
        <div className="tile">
          <div className="tile-valor tile-destaque">{durCurta(estudoSemana)}</div>
          <div className="tile-rotulo">estudo na semana</div>
        </div>
        <div className="tile">
          <div className="tile-valor">{durCurta(totalSemana)}</div>
          <div className="tile-rotulo">registrado ao todo</div>
        </div>
        <div className="tile">
          <div className="tile-valor">{diasComEstudo}</div>
          <div className="tile-rotulo">dia{diasComEstudo === 1 ? "" : "s"} com estudo</div>
        </div>
      </div>

      <div className="semana-grade">
        {DIAS.map((d, i) => {
          const data = new Date(seg.getTime() + i * DIA);
          const ehHoje = data.getTime() === hoje.getTime();
          const futuro = data.getTime() > hoje.getTime();
          const estudo = grade.estudoPorDia[i];
          const total = grade.porDia[i];
          const cats = grade.linhas.filter((r) => r.dias[i] > 0);
          return (
            <button
              key={d}
              className={`dia-card${ehHoje ? " hoje" : ""}${futuro ? " futuro" : ""}`}
              onClick={() => onAbrirDia(data)}
              title="Abrir o dia"
            >
              <div className="dia-card-cab">
                <span>{d}</span>
                <span className="num dia-card-num">{data.getDate()}</span>
              </div>
              {total === 0 ? (
                <div className="dia-card-vazio">{futuro ? "" : "·"}</div>
              ) : (
                <>
                  <div className="dia-card-estudo num">{estudo > 0 ? durCurta(estudo) : "—"}</div>
                  <div className="dia-card-total num">{durCurta(total)} ao todo</div>
                  <div className="dia-card-barra" aria-hidden>
                    <span style={{ width: `${(estudo / pico) * 100}%` }} />
                  </div>
                  <div className="dia-card-cats">
                    {cats.map((r) => (
                      <div key={r.nome} className="dia-card-cat" title={r.nome}>
                        <span className="chip-cor" style={{ background: corDe(r, tema) }} />
                        <span className="dia-card-cat-nome">{r.nome}</span>
                        <span className="num">{durCurta(r.dias[i])}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </button>
          );
        })}
      </div>

      <p className="nota">
        Cartão vazio é dia sem registro, não dia zerado — a semana não cobra
        preenchimento. Clique no dia para abrir a lista dele.
      </p>
    </>
  );
}
