import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { durCurta } from "./App";
import { Meta, corDe } from "./Categorias";
import * as I from "./icones";

type Lanc = {
  started_at: number;
  ended_at: number | null;
  activity_type_id: string;
};

function inicioDoDia(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function inicioDaSemana() {
  const x = inicioDoDia();
  // Segunda como primeiro dia: getDay() devolve 0 para domingo.
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

/**
 * Situação da meta. Estar abaixo do piso e estar acima do teto são coisas
 * diferentes, e nenhuma das duas é "erro" — por isso viram texto, nunca só cor.
 * Cor sozinha excluiria quem não distingue as duas, e o plano pede que
 * relatório não classifique o usuário.
 */
function situacao(feito: number, min: number | null, max: number | null) {
  if (min != null && feito < min * 60000)
    return {
      texto: `faltam ${durCurta(min * 60000 - feito)} para o piso`,
      tom: "abaixo" as const,
    };
  if (max != null && feito > max * 60000)
    return {
      texto: `${durCurta(feito - max * 60000)} acima do teto`,
      tom: "acima" as const,
    };
  return { texto: "dentro da faixa", tom: "dentro" as const };
}

export default function Metas({
  itens,
  tema,
  versao,
}: {
  itens: Lanc[];
  tema: string;
  versao: number;
}) {
  const [metas, setMetas] = useState<Meta[]>([]);

  useEffect(() => {
    invoke<Meta[]>("listar_metas").then(setMetas).catch(() => {});
  }, [versao]);

  const linhas = useMemo(() => {
    const d0 = inicioDoDia().getTime();
    const s0 = inicioDaSemana().getTime();

    return metas.map((m) => {
      const desde = m.periodo === "dia" ? d0 : s0;
      // Fatia pelo início do período: sessão que atravessou a virada conta só
      // o pedaço que caiu dentro dele.
      let feito = 0;
      for (const l of itens) {
        if (l.activity_type_id !== m.activity_type_id || !l.ended_at) continue;
        const inter = l.ended_at - Math.max(l.started_at, desde);
        if (inter > 0) feito += Math.min(inter, l.ended_at - l.started_at);
      }
      return { m, feito, sit: situacao(feito, m.min_minutos, m.max_minutos) };
    });
  }, [metas, itens]);

  if (linhas.length === 0) return null;

  return (
    <section className="card">
      <h2>Metas</h2>
      {linhas.map(({ m, feito, sit }) => {
        const min = (m.min_minutos ?? 0) * 60000;
        const max = m.max_minutos != null ? m.max_minutos * 60000 : null;
        // A escala precisa caber o realizado, o teto e uma folga — senão a
        // barra encosta na borda e o excesso fica invisível.
        const escala = Math.max(feito, max ?? min * 1.4, min, 1) * 1.12;
        const pc = (v: number) => `${Math.min((v / escala) * 100, 100)}%`;

        return (
          <div className="meta" key={m.id}>
            <div className="meta-topo">
              <span className="chip-cor" style={{ background: corDe(m, tema) }} />
              <span style={{ flex: 1 }}>{m.atividade}</span>
              <span className="num" style={{ fontWeight: 600 }}>
                {durCurta(feito)}
              </span>
            </div>

            <div className="meta-trilho">
              {(m.min_minutos != null || max != null) && (
                <span
                  className="meta-faixa"
                  style={{
                    left: pc(min),
                    width: `calc(${pc(max ?? escala)} - ${pc(min)})`,
                  }}
                />
              )}
              <span
                className="meta-barra"
                style={{ width: pc(feito), background: corDe(m, tema) }}
              />
            </div>

            <div className="meta-rodape">
              <span>
                {m.min_minutos != null && m.max_minutos != null
                  ? `${durCurta(min)} a ${durCurta(max!)}`
                  : m.min_minutos != null
                  ? `pelo menos ${durCurta(min)}`
                  : `no máximo ${durCurta(max!)}`}{" "}
                por {m.periodo}
              </span>
              <span className={`meta-sit meta-${sit.tom}`}>
                {sit.tom !== "dentro" && <I.Alerta size={13} />}
                {sit.texto}
              </span>
            </div>
          </div>
        );
      })}
      <p className="nota">
        Piso e teto são referência, não cobrança. Ficar fora da faixa num dia
        não significa nada sozinho.
      </p>
    </section>
  );
}
