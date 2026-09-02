import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import * as I from "./icones";

export type Tipo = {
  id: string;
  nome: string;
  cor: string;
  cor_escura: string | null;
  conta_como_estudo: boolean;
  icone: string | null;
  campos_extra: string | null;
};

export type Meta = {
  id: string;
  activity_type_id: string;
  atividade: string;
  cor: string;
  cor_escura: string | null;
  periodo: "dia" | "semana";
  min_minutos: number | null;
  max_minutos: number | null;
};

type Cor = { nome: string; clara: string; escura: string };

export const corDe = (
  l: { cor: string; cor_escura: string | null },
  tema: string
) => (tema === "escuro" ? l.cor_escura ?? l.cor : l.cor);

/** Horas para a interface, minutos para o banco. `1,5` e `1.5` valem o mesmo. */
const paraMin = (h: string) => {
  const t = h.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 60) : null;
};
const paraHoras = (m: number | null) =>
  m == null ? "" : String(Math.round((m / 60) * 100) / 100);

export default function Categorias({
  tema,
  onErro,
  onMudou,
}: {
  tema: string;
  onErro: (e: string | null) => void;
  onMudou: () => void;
}) {
  const [tipos, setTipos] = useState<Tipo[]>([]);
  const [metas, setMetas] = useState<Meta[]>([]);
  const [paleta, setPaleta] = useState<Cor[]>([]);
  const [editando, setEditando] = useState<string | null>(null);
  const [novo, setNovo] = useState(false);
  const arrastando = useRef<string | null>(null);

  const recarregar = useCallback(() => {
    invoke<Tipo[]>("listar_tipos").then(setTipos).catch((e) => onErro(String(e)));
    invoke<Meta[]>("listar_metas").then(setMetas).catch(() => {});
  }, [onErro]);

  useEffect(() => {
    invoke<Cor[]>("paleta").then(setPaleta).catch(() => {});
    recarregar();
  }, [recarregar]);

  const acao = (cmd: string, args: Record<string, unknown>) =>
    invoke(cmd, args)
      .then(() => {
        onErro(null);
        recarregar();
        onMudou();
      })
      .catch((e) => onErro(String(e)));

  const soltar = (alvo: Tipo) => {
    const origem = arrastando.current;
    arrastando.current = null;
    if (!origem || origem === alvo.id) return;
    const lista = [...tipos];
    const de = lista.findIndex((t) => t.id === origem);
    const para = lista.findIndex((t) => t.id === alvo.id);
    if (de < 0 || para < 0) return;
    const [m] = lista.splice(de, 1);
    lista.splice(para, 0, m);
    setTipos(lista);
    invoke("reordenar_tipos", { ids: lista.map((t) => t.id) })
      .then(onMudou)
      .catch((e) => onErro(String(e)));
  };

  const metaDe = (id: string) => metas.find((m) => m.activity_type_id === id);

  return (
    <>
      <section className="card">
        <div className="card-cab">
          <h2>Categorias de atividade</h2>
          {!novo && (
            <button className="btn" onClick={() => setNovo(true)}>
              <I.Mais /> Nova categoria
            </button>
          )}
        </div>

        {novo && (
          <Editor
            paleta={paleta}
            tema={tema}
            onCancelar={() => setNovo(false)}
            onSalvar={(d) =>
              acao("criar_tipo", d).then(() => setNovo(false))
            }
          />
        )}

        {tipos.map((t) =>
          editando === t.id ? (
            <Editor
              key={t.id}
              inicial={t}
              paleta={paleta}
              tema={tema}
              onCancelar={() => setEditando(null)}
              onSalvar={(d) =>
                acao("editar_tipo", { id: t.id, ...d }).then(() => setEditando(null))
              }
            />
          ) : (
            <div
              key={t.id}
              className="lanc tarefa"
              draggable
              onDragStart={() => (arrastando.current = t.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => soltar(t)}
            >
              <span className="chip-cor" style={{ background: corDe(t, tema) }} />
              <span style={{ color: corDe(t, tema), display: "flex" }}>
                <I.IconeCategoria nome={t.icone} size={16} />
              </span>
              <span className="lanc-texto">
                {t.nome}
                {t.conta_como_estudo && (
                  <span className="lanc-curso"> · conta como estudo</span>
                )}
              </span>
              <span className="nota" style={{ margin: 0, minWidth: 130, textAlign: "right" }}>
                {resumoMeta(metaDe(t.id))}
              </span>
              <span className="lanc-acoes">
                <button
                  className="btn btn-fantasma btn-icone"
                  onClick={() => setEditando(t.id)}
                  aria-label={`Editar ${t.nome}`}
                >
                  <I.Lapis />
                </button>
                <button
                  className="btn btn-fantasma btn-icone btn-perigo"
                  onClick={() => acao("excluir_tipo", { id: t.id })}
                  aria-label={`Excluir ${t.nome}`}
                >
                  <I.Lixeira />
                </button>
              </span>
            </div>
          )
        )}

        <p className="nota">
          Arraste para reordenar. A ordem não é cosmética: as cores foram
          validadas para daltonismo <b>por pares vizinhos</b>, então quem fica ao
          lado de quem faz parte da acessibilidade.
        </p>
      </section>

      <section className="card">
        <h2>Metas por categoria</h2>
        <p className="nota" style={{ marginTop: 0, marginBottom: 14 }}>
          Piso, teto, ou os dois. Estudo costuma querer piso; lazer, teto;
          academia, os dois — treinar de menos e treinar de mais são problemas
          diferentes.
        </p>

        {tipos.map((t) => (
          <LinhaMeta
            key={t.id}
            tipo={t}
            tema={tema}
            meta={metaDe(t.id)}
            onSalvar={(periodo, min, max) =>
              acao("salvar_meta", {
                activityTypeId: t.id,
                periodo,
                minMinutos: min,
                maxMinutos: max,
              })
            }
            onExcluir={(id) => acao("excluir_meta", { id })}
          />
        ))}
      </section>
    </>
  );
}

function resumoMeta(m?: Meta) {
  if (!m) return "sem meta";
  const p = m.periodo === "dia" ? "/dia" : "/semana";
  // "30m" e não "0.5h": hora decimal é precisa e ilegível.
  const h = (v: number) =>
    v < 60 ? `${v}m` : v % 60 === 0 ? `${v / 60}h` : `${Math.floor(v / 60)}h${v % 60}`;
  if (m.min_minutos != null && m.max_minutos != null)
    return `${h(m.min_minutos)}–${h(m.max_minutos)}${p}`;
  if (m.min_minutos != null) return `mín ${h(m.min_minutos)}${p}`;
  return `máx ${h(m.max_minutos!)}${p}`;
}

function Editor({
  inicial,
  paleta,
  tema,
  onCancelar,
  onSalvar,
}: {
  inicial?: Tipo;
  paleta: Cor[];
  tema: string;
  onCancelar: () => void;
  onSalvar: (d: {
    nome: string;
    cor: string;
    corEscura: string;
    contaComoEstudo: boolean;
    icone: string | null;
    camposExtra: string | null;
  }) => void;
}) {
  const [nome, setNome] = useState(inicial?.nome ?? "");
  const [cor, setCor] = useState(inicial?.cor ?? paleta[0]?.clara ?? "");
  const [estudo, setEstudo] = useState(inicial?.conta_como_estudo ?? false);
  const [icone, setIcone] = useState(inicial?.icone ?? "circulo");
  const [extra, setExtra] = useState(inicial?.campos_extra ?? "");

  const escolhida = paleta.find((p) => p.clara === cor) ?? paleta[0];

  return (
    <div className="editor" onKeyDown={(e) => e.key === "Escape" && onCancelar()}>
      <div className="grade">
        <div className="campo cresce">
          <label>Nome</label>
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            autoFocus
            placeholder="Lazer"
          />
        </div>
        <div className="campo">
          <label>Cor</label>
          <div className="paleta">
            {paleta.map((p) => (
              <button
                key={p.clara}
                type="button"
                className={`swatch${p.clara === cor ? " ativo" : ""}`}
                style={{ background: tema === "escuro" ? p.escura : p.clara }}
                onClick={() => setCor(p.clara)}
                aria-label={p.nome}
                aria-pressed={p.clara === cor}
                title={p.nome}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="grade" style={{ marginTop: 12 }}>
        <div className="campo cresce">
          <label>Ícone</label>
          <div className="paleta">
            {Object.keys(I.CATEGORIA).map((n) => (
              <button
                key={n}
                type="button"
                className={`swatch-icone${n === icone ? " ativo" : ""}`}
                onClick={() => setIcone(n)}
                aria-label={n}
                aria-pressed={n === icone}
                title={n}
              >
                <I.IconeCategoria nome={n} size={16} />
              </button>
            ))}
          </div>
        </div>
        <div className="campo" style={{ width: 190 }}>
          <label>Campo extra no lançamento</label>
          <select value={extra} onChange={(e) => setExtra(e.target.value)}>
            <option value="">nenhum</option>
            <option value="distancia">distância</option>
            <option value="treino">treino</option>
          </select>
        </div>
      </div>

      <label style={{ display: "flex", gap: 9, alignItems: "center", marginTop: 12 }}>
        <input
          type="checkbox"
          checked={estudo}
          onChange={(e) => setEstudo(e.target.checked)}
          style={{ width: 15, height: 15, accentColor: "var(--acc)" }}
        />
        Conta como tempo de estudo nos totais
      </label>

      <p className="nota">
        O campo extra aparece só nos lançamentos desta categoria, e continua
        opcional — nada além do tempo é obrigatório.
      </p>

      <div className="linha" style={{ marginTop: 14 }}>
        <button
          className="btn btn-primario"
          onClick={() =>
            escolhida &&
            onSalvar({
              nome,
              cor: escolhida.clara,
              corEscura: escolhida.escura,
              contaComoEstudo: estudo,
              icone,
              camposExtra: extra || null,
            })
          }
        >
          Salvar
        </button>
        <button className="btn btn-fantasma" onClick={onCancelar}>
          Cancelar
        </button>
      </div>

      <p className="nota">
        A cor sai de uma paleta fechada de oito, validada para daltonismo nos
        dois temas. Um seletor livre deixaria escolher tons que ninguém
        distingue num gráfico.
      </p>
    </div>
  );
}

function LinhaMeta({
  tipo,
  tema,
  meta,
  onSalvar,
  onExcluir,
}: {
  tipo: Tipo;
  tema: string;
  meta?: Meta;
  onSalvar: (p: string, min: number | null, max: number | null) => void;
  onExcluir: (id: string) => void;
}) {
  const [periodo, setPeriodo] = useState<string>(meta?.periodo ?? "semana");
  const [min, setMin] = useState(paraHoras(meta?.min_minutos ?? null));
  const [max, setMax] = useState(paraHoras(meta?.max_minutos ?? null));

  useEffect(() => {
    setPeriodo(meta?.periodo ?? "semana");
    setMin(paraHoras(meta?.min_minutos ?? null));
    setMax(paraHoras(meta?.max_minutos ?? null));
  }, [meta]);

  const mudou =
    (meta?.periodo ?? "semana") !== periodo ||
    paraHoras(meta?.min_minutos ?? null) !== min ||
    paraHoras(meta?.max_minutos ?? null) !== max;

  return (
    <div className="linha meta-linha">
      <span className="chip-cor" style={{ background: corDe(tipo, tema) }} />
      {/* Largura fixa em vez de `flex: 1`: com o nome elástico, a linha sem
          meta (que não tem o botão de remover) desalinhava os campos das
          outras. Coluna fixa faz tudo cair no mesmo lugar. */}
      <span className="meta-nome">{tipo.nome}</span>

      <div className="campo" style={{ width: 86 }}>
        <label htmlFor={`min-${tipo.id}`}>mín (h)</label>
        <input
          id={`min-${tipo.id}`}
          inputMode="decimal"
          value={min}
          onChange={(e) => setMin(e.target.value)}
          placeholder="—"
        />
      </div>
      <div className="campo" style={{ width: 86 }}>
        <label htmlFor={`max-${tipo.id}`}>máx (h)</label>
        <input
          id={`max-${tipo.id}`}
          inputMode="decimal"
          value={max}
          onChange={(e) => setMax(e.target.value)}
          placeholder="—"
        />
      </div>
      <div className="campo" style={{ width: 104 }}>
        <label htmlFor={`per-${tipo.id}`}>por</label>
        <select
          id={`per-${tipo.id}`}
          value={periodo}
          onChange={(e) => setPeriodo(e.target.value)}
        >
          <option value="semana">semana</option>
          <option value="dia">dia</option>
        </select>
      </div>

      <button
        className="btn"
        disabled={!mudou}
        onClick={() => onSalvar(periodo, paraMin(min), paraMin(max))}
      >
        Salvar
      </button>
      {meta ? (
        <button
          className="btn btn-fantasma btn-icone btn-perigo"
          onClick={() => onExcluir(meta.id)}
          aria-label={`Remover meta de ${tipo.nome}`}
        >
          <I.Lixeira />
        </button>
      ) : (
        <span className="btn-vago" aria-hidden />
      )}
    </div>
  );
}
