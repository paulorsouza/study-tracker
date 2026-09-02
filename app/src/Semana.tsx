import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { durCurta } from "./App";
import { Lancamento, corDe, segundaDe, DIA } from "./tempo-comum";
import * as I from "./icones";

const DIAS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

/**
 * Folha de horas: categorias nas linhas, dias nas colunas.
 *
 * "Sem obrigação de preenchimento" (§3.5) é o ponto inteiro — célula vazia fica
 * vazia, não vira zero. Um zero afirma que nada aconteceu; o vazio só diz que
 * nada foi registrado, e as duas coisas são diferentes num app que o usuário
 * pode simplesmente esquecer de ligar.
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
    const linhas = new Map<
      string,
      { nome: string; cor: string; cor_escura: string | null; estudo: boolean; dias: number[] }
    >();
    for (const l of itens) {
      const i = Math.floor((l.started_at - seg.getTime()) / DIA);
      if (i < 0 || i > 6) continue;
      let r = linhas.get(l.activity_type_id);
      if (!r) {
        r = {
          nome: l.atividade,
          cor: l.cor,
          cor_escura: l.cor_escura,
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

      <section className="card">
        <div className="totais" style={{ marginBottom: 18 }}>
          <div>
            <div className="total-valor tile-destaque">{durCurta(estudoSemana)}</div>
            <div className="total-rotulo">estudo na semana</div>
          </div>
          <div>
            <div className="total-valor">{durCurta(totalSemana)}</div>
            <div className="total-rotulo">registrado ao todo</div>
          </div>
          <div>
            <div className="total-valor">
              {grade.estudoPorDia.filter((x) => x > 0).length}
            </div>
            <div className="total-rotulo">
              dia{grade.estudoPorDia.filter((x) => x > 0).length === 1 ? "" : "s"} com estudo
            </div>
          </div>
        </div>

        <div className="folha-rolagem">
          <table className="folha">
            <thead>
              <tr>
                <th scope="col">Categoria</th>
                {DIAS.map((d, i) => {
                  const data = new Date(seg.getTime() + i * DIA);
                  const ehHoje = data.getTime() === hoje.getTime();
                  return (
                    <th
                      key={d}
                      scope="col"
                      className={ehHoje ? "folha-hoje" : undefined}
                      aria-current={ehHoje ? "date" : undefined}
                    >
                      <button className="folha-dia" onClick={() => onAbrirDia(data)}>
                        <span>{d}</span>
                        <span className="num">{data.getDate()}</span>
                      </button>
                    </th>
                  );
                })}
                <th scope="col">Total</th>
              </tr>
            </thead>
            <tbody>
              {grade.linhas.length === 0 ? (
                <tr>
                  <td colSpan={9} className="vazio" style={{ borderBottom: 0 }}>
                    Nada registrado nesta semana.
                  </td>
                </tr>
              ) : (
                grade.linhas.map((r) => (
                  <tr key={r.nome}>
                    <th scope="row">
                      <span
                        className="ponto"
                        style={{ background: corDe(r, tema), border: 0 }}
                      />
                      {r.nome}
                    </th>
                    {r.dias.map((ms, i) => (
                      <td key={i} className="num">
                        {ms > 0 ? durCurta(ms) : <span className="folha-vazia">·</span>}
                      </td>
                    ))}
                    <td className="num folha-total">
                      {durCurta(r.dias.reduce((a, b) => a + b, 0))}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {grade.linhas.length > 0 && (
              <tfoot>
                <tr>
                  <th scope="row">Estudo</th>
                  {grade.estudoPorDia.map((ms, i) => (
                    <td key={i} className="num">
                      {ms > 0 ? (
                        <>
                          {durCurta(ms)}
                          <span
                            className="folha-barra"
                            style={{ width: `${(ms / pico) * 100}%` }}
                          />
                        </>
                      ) : (
                        <span className="folha-vazia">·</span>
                      )}
                    </td>
                  ))}
                  <td className="num folha-total">{durCurta(estudoSemana)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <p className="nota">
          Célula vazia é dia sem registro, não dia zerado — a folha não cobra
          preenchimento. Clique no dia para abrir a lista dele.
        </p>
      </section>
    </>
  );
}
