import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import Modal from "./Modal";
import Menu from "./Menu";
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

type Form = { modo: "nova" } | { modo: "editar"; t: Tipo } | null;

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
  const [form, setForm] = useState<Form>(null);
  const [metaDeTipo, setMetaDeTipo] = useState<Tipo | null>(null);
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
          <button className="btn" onClick={() => setForm({ modo: "nova" })}>
            <I.Mais /> Nova categoria
          </button>
        </div>

        {tipos.map((t) => (
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
            {/* A meta é a própria etiqueta: clicar nela abre o ajuste. Um
                cartão inteiro de campos por categoria virava planilha. */}
            <button
              className={`btn btn-pequeno${metaDe(t.id) ? " btn-suave" : " btn-fantasma"}`}
              onClick={() => setMetaDeTipo(t)}
              title="Ajustar a meta de tempo"
            >
              <I.Alvo size={13} /> {resumoMeta(metaDe(t.id))}
            </button>
            <span className="lanc-acoes">
              <Menu
                itens={[
                  { rotulo: "Editar", icone: <I.Lapis />, onClick: () => setForm({ modo: "editar", t }) },
                  { rotulo: "Meta de tempo", icone: <I.Alvo />, onClick: () => setMetaDeTipo(t) },
                  {
                    rotulo: "Excluir",
                    icone: <I.Lixeira />,
                    perigo: true,
                    onClick: () => acao("excluir_tipo", { id: t.id }),
                  },
                ]}
              />
            </span>
          </div>
        ))}

        <p className="nota">
          Arraste para reordenar. A ordem não é cosmética: as cores foram
          validadas para daltonismo <b>por pares vizinhos</b>, então quem fica ao
          lado de quem faz parte da acessibilidade. Clique na meta para ajustar
          piso e teto.
        </p>
      </section>

      <FormTipo
        key={form ? (form.modo === "editar" ? form.t.id : "nova") : "tipo-fechado"}
        form={form}
        paleta={paleta}
        tema={tema}
        onFechar={() => setForm(null)}
        onSalvar={(d) =>
          acao(
            form?.modo === "editar" ? "editar_tipo" : "criar_tipo",
            form?.modo === "editar" ? { id: form.t.id, ...d } : d
          ).then(() => setForm(null))
        }
      />

      <FormMeta
        key={metaDeTipo ? `meta-${metaDeTipo.id}` : "meta-fechado"}
        tipo={metaDeTipo}
        meta={metaDeTipo ? metaDe(metaDeTipo.id) : undefined}
        tema={tema}
        onFechar={() => setMetaDeTipo(null)}
        onSalvar={(periodo, min, max) =>
          metaDeTipo &&
          acao("salvar_meta", {
            activityTypeId: metaDeTipo.id,
            periodo,
            minMinutos: min,
            maxMinutos: max,
          }).then(() => setMetaDeTipo(null))
        }
        onExcluir={(id) => acao("excluir_meta", { id }).then(() => setMetaDeTipo(null))}
      />
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

function FormTipo({
  form,
  paleta,
  tema,
  onFechar,
  onSalvar,
}: {
  form: Form;
  paleta: Cor[];
  tema: string;
  onFechar: () => void;
  onSalvar: (d: {
    nome: string;
    cor: string;
    corEscura: string;
    contaComoEstudo: boolean;
    icone: string | null;
    camposExtra: string | null;
  }) => void;
}) {
  const inicial = form?.modo === "editar" ? form.t : undefined;
  const [nome, setNome] = useState(inicial?.nome ?? "");
  const [cor, setCor] = useState(inicial?.cor ?? paleta[0]?.clara ?? "");
  const [estudo, setEstudo] = useState(inicial?.conta_como_estudo ?? false);
  const [icone, setIcone] = useState(inicial?.icone ?? "circulo");
  const [extra, setExtra] = useState(inicial?.campos_extra ?? "");

  // A paleta pode chegar depois do primeiro render do formulário novo.
  useEffect(() => {
    if (!cor && paleta[0]) setCor(paleta[0].clara);
  }, [paleta, cor]);

  const escolhida = paleta.find((p) => p.clara === cor) ?? paleta[0];

  const salvar = () =>
    escolhida &&
    onSalvar({
      nome,
      cor: escolhida.clara,
      corEscura: escolhida.escura,
      contaComoEstudo: estudo,
      icone,
      camposExtra: extra || null,
    });

  return (
    <Modal
      titulo={inicial ? "Editar categoria" : "Nova categoria"}
      aberto={!!form}
      onFechar={onFechar}
      pe={
        <>
          <button className="btn btn-fantasma" onClick={onFechar}>Cancelar</button>
          <button className="btn btn-primario" onClick={salvar}>Salvar</button>
        </>
      }
    >
      <div className="campos" onKeyDown={(e) => e.key === "Enter" && salvar()}>
        <div className="campo campo-largo">
          <label htmlFor="cat-nome">Nome</label>
          <input
            id="cat-nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Lazer"
          />
        </div>
        <div className="campo campo-largo">
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
        <div className="campo campo-largo">
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
        <div className="campo">
          <label htmlFor="cat-extra">Campo extra no lançamento</label>
          <select id="cat-extra" value={extra} onChange={(e) => setExtra(e.target.value)}>
            <option value="">nenhum</option>
            <option value="distancia">distância</option>
            <option value="treino">treino</option>
          </select>
        </div>
        <label className="campo" style={{ justifyContent: "flex-end", flexDirection: "row", alignItems: "center", gap: 9, paddingTop: 22 }}>
          <input
            type="checkbox"
            checked={estudo}
            onChange={(e) => setEstudo(e.target.checked)}
            style={{ width: 15, height: 15, accentColor: "var(--acc)" }}
          />
          Conta como tempo de estudo
        </label>
      </div>
      <p className="nota">
        A cor sai de uma paleta fechada de oito, validada para daltonismo nos
        dois temas. O campo extra aparece só nos lançamentos desta categoria, e
        continua opcional.
      </p>
    </Modal>
  );
}

function FormMeta({
  tipo,
  meta,
  tema,
  onFechar,
  onSalvar,
  onExcluir,
}: {
  tipo: Tipo | null;
  meta?: Meta;
  tema: string;
  onFechar: () => void;
  onSalvar: (p: string, min: number | null, max: number | null) => void;
  onExcluir: (id: string) => void;
}) {
  const [periodo, setPeriodo] = useState<string>(meta?.periodo ?? "semana");
  const [min, setMin] = useState(paraHoras(meta?.min_minutos ?? null));
  const [max, setMax] = useState(paraHoras(meta?.max_minutos ?? null));

  const salvar = () => onSalvar(periodo, paraMin(min), paraMin(max));

  return (
    <Modal
      titulo={tipo ? `Meta de ${tipo.nome}` : "Meta"}
      aberto={!!tipo}
      onFechar={onFechar}
      pe={
        <>
          {meta && (
            <button className="btn btn-fantasma btn-perigo esquerda" onClick={() => onExcluir(meta.id)}>
              <I.Lixeira /> Remover meta
            </button>
          )}
          <button className="btn btn-fantasma" onClick={onFechar}>Cancelar</button>
          <button className="btn btn-primario" onClick={salvar}>Salvar</button>
        </>
      }
    >
      {tipo && (
        <div className="linha" style={{ marginBottom: 0 }}>
          <span className="chip-cor" style={{ background: corDe(tipo, tema) }} />
          <span className="nota" style={{ margin: 0 }}>
            Piso, teto, ou os dois. Estudo costuma querer piso; lazer, teto;
            academia, os dois.
          </span>
        </div>
      )}
      <div className="campos" onKeyDown={(e) => e.key === "Enter" && salvar()}>
        <div className="campo">
          <label htmlFor="meta-min">Mínimo (horas)</label>
          <input
            id="meta-min"
            inputMode="decimal"
            value={min}
            onChange={(e) => setMin(e.target.value)}
            placeholder="—"
          />
        </div>
        <div className="campo">
          <label htmlFor="meta-max">Máximo (horas)</label>
          <input
            id="meta-max"
            inputMode="decimal"
            value={max}
            onChange={(e) => setMax(e.target.value)}
            placeholder="—"
          />
        </div>
        <div className="campo campo-largo">
          <label htmlFor="meta-per">Por</label>
          <select id="meta-per" value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
            <option value="semana">semana</option>
            <option value="dia">dia</option>
          </select>
        </div>
      </div>
      <p className="nota">
        Piso e teto são referência, não cobrança. Semana é o padrão: dia é
        rígido demais para rotina real.
      </p>
    </Modal>
  );
}
