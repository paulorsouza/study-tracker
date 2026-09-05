import { CSSProperties, ReactNode } from "react";
import { Lancamento, corDe, hhmm } from "./tempo-comum";
import { durCurta } from "./App";
import * as I from "./icones";

/**
 * Um lançamento como cartão numa linha do tempo: a hora à esquerda, o cartão
 * com a cor da categoria na borda. O Dia e o Histórico usam o mesmo, para o
 * mesmo dado ter a mesma cara nas duas telas.
 */
export default function LancamentoCard({
  l,
  tema,
  acoes,
  selecionavel,
  selecionado,
  onSelecionar,
  rodape,
}: {
  l: Lancamento;
  tema: string;
  /** Botões que aparecem quando o ponteiro chega. */
  acoes?: ReactNode;
  selecionavel?: boolean;
  selecionado?: boolean;
  onSelecionar?: (v: boolean) => void;
  /** Conteúdo extra embaixo do cartão, como o corte inline. */
  rodape?: ReactNode;
}) {
  const cor = corDe(l, tema);
  const aberto = l.ended_at === null;

  return (
    <div className={`lt-item${l.sobrepoe ? " sobreposto" : ""}${aberto ? " aberto" : ""}`}>
      <div className="lt-hora num">
        <span>{hhmm(l.started_at)}</span>
        <span className="lt-hora-fim">{aberto ? "agora" : hhmm(l.ended_at!)}</span>
      </div>
      <div className="lt-card" style={{ "--cor": cor } as CSSProperties}>
        {selecionavel && (
          <input
            type="checkbox"
            className="lt-sel"
            checked={!!selecionado}
            disabled={aberto}
            onChange={(e) => onSelecionar?.(e.target.checked)}
            aria-label={`Selecionar ${l.description || l.atividade}`}
          />
        )}
        <span className="lt-icone" title={l.atividade}>
          <I.IconeCategoria nome={l.icone} size={16} />
        </span>
        <div className="lt-corpo">
          <div className="lt-titulo">
            {l.description || <span className="lt-atividade">{l.atividade}</span>}
          </div>
          <div className="lt-meta">
            <span>{l.atividade}</span>
            {l.curso && <span>· {l.curso}</span>}
            {l.materia && <span className="pill">{l.materia}</span>}
            {l.aula && <span className="pill">{l.aula}</span>}
            {l.distancia_m != null && (
              <span className="pill">{(l.distancia_m / 1000).toFixed(1)} km</span>
            )}
            {l.treino && <span className="pill">{l.treino}</span>}
            {l.observacao && (
              <span className="pill" title={l.observacao}>
                <I.Nota size={10} /> obs.
              </span>
            )}
            {l.sobrepoe && (
              <span className="pill pill-warn" title="Divide relógio com outro lançamento">
                sobreposto
              </span>
            )}
          </div>
          {rodape}
        </div>
        <div className="lt-direita">
          {aberto && <span className="pulso" title="contando agora" />}
          <span className="lt-dur num">{durCurta((l.ended_at ?? Date.now()) - l.started_at)}</span>
          {acoes && <span className="lanc-acoes">{acoes}</span>}
        </div>
      </div>
    </div>
  );
}
