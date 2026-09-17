import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import Modal from "./Modal";
import * as I from "./icones";
import { Curso } from "./App";
import { Tipo } from "./tempo-comum";

export type Rotina = {
  id: string;
  titulo: string;
  course_id: string | null;
  activity_type_id: string | null;
  duracao_estimada_min: number | null;
  prioridade: number;
  dias: string;
  ativa: boolean;
  inicio: string | null;
  fim: string | null;
};

const DIAS = ["D", "S", "T", "Q", "Q", "S", "S"];
const TODOS = "0123456";
const UTEIS = "12345";

const vazia = (): Rotina => ({
  id: "",
  titulo: "",
  course_id: null,
  activity_type_id: null,
  duracao_estimada_min: 30,
  prioridade: 0,
  dias: TODOS,
  ativa: true,
  inicio: null,
  fim: null,
});

const resumoDias = (d: string) => {
  if (d === TODOS) return "todo dia";
  if (d === UTEIS) return "dias de semana";
  if (d === "06") return "fim de semana";
  return [...d]
    .sort()
    .map((n) => ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"][Number(n)])
    .join(", ");
};

/**
 * Rotinas: a regra que gera as tarefas do dia.
 *
 * Fica no Planejamento, e não em Configurações, porque criar a rotina é parte
 * de planejar — quem acabou de digitar a mesma tarefa pela terceira vez está a
 * um clique de transformá-la em rotina.
 */
export default function Rotinas({
  aberto,
  cursos,
  onFechar,
  onErro,
  onMudou,
}: {
  aberto: boolean;
  cursos: Curso[];
  onFechar: () => void;
  onErro: (e: string | null) => void;
  onMudou: () => void;
}) {
  const [lista, setLista] = useState<Rotina[]>([]);
  const [tipos, setTipos] = useState<Tipo[]>([]);
  const [form, setForm] = useState<Rotina | null>(null);

  const carregar = useCallback(() => {
    invoke<Rotina[]>("listar_rotinas").then(setLista).catch((e) => onErro(String(e)));
    invoke<Tipo[]>("listar_tipos").then(setTipos).catch(() => {});
  }, [onErro]);

  useEffect(() => {
    if (aberto) carregar();
  }, [aberto, carregar]);

  const salvar = () => {
    if (!form) return;
    invoke("salvar_rotina", { r: { ...form, duracao_estimada_min: form.duracao_estimada_min || null } })
      .then(() => {
        setForm(null);
        carregar();
        onMudou();
        onErro(null);
      })
      .catch((e) => onErro(String(e)));
  };

  const excluir = (id: string) =>
    invoke("excluir_rotina", { id })
      .then(() => {
        carregar();
        onMudou();
      })
      .catch((e) => onErro(String(e)));

  const alternarDia = (n: number) => {
    if (!form) return;
    const tem = form.dias.includes(String(n));
    const dias = tem
      ? [...form.dias].filter((d) => d !== String(n)).join("")
      : [...form.dias, String(n)].sort().join("");
    setForm({ ...form, dias });
  };

  return (
    <>
      <Modal
        titulo="Rotinas"
        aberto={aberto && !form}
        onFechar={onFechar}
        larga
        pe={
          <>
            <button className="btn btn-fantasma" onClick={onFechar}>
              Fechar
            </button>
            <button className="btn btn-primario" onClick={() => setForm(vazia())}>
              <I.Mais /> Nova rotina
            </button>
          </>
        }
      >
        {lista.length === 0 ? (
          <div className="vazio" style={{ border: 0 }}>
            Nenhuma rotina.
          </div>
        ) : (
          lista.map((r) => (
            <div key={r.id} className="lanc">
              <span
                className="lanc-cor"
                style={{ background: tipos.find((t) => t.id === r.activity_type_id)?.cor ?? "var(--line-2)" }}
              />
              <div className="lanc-texto">
                <div style={r.ativa ? undefined : { color: "var(--tx-3)" }}>{r.titulo}</div>
                <span className="lanc-curso">
                  {resumoDias(r.dias)}
                  {r.duracao_estimada_min ? ` · ${r.duracao_estimada_min} min` : ""}
                  {r.fim ? ` · até ${r.fim.split("-").reverse().join("/")}` : ""}
                  {r.ativa ? "" : " · pausada"}
                </span>
              </div>
              <button className="btn btn-pequeno" onClick={() => setForm(r)}>
                Editar
              </button>
              <button
                className="btn btn-fantasma btn-icone"
                onClick={() => excluir(r.id)}
                aria-label="Excluir rotina"
                title="Excluir"
              >
                <I.Lixeira />
              </button>
            </div>
          ))
        )}
      </Modal>

      <Modal
        titulo={form?.id ? "Editar rotina" : "Nova rotina"}
        aberto={!!form}
        onFechar={() => setForm(null)}
        larga
        pe={
          <>
            <button className="btn btn-fantasma" onClick={() => setForm(null)}>
              Cancelar
            </button>
            <button className="btn btn-primario" onClick={salvar}>
              Salvar
            </button>
          </>
        }
      >
        {form && (
          <div className="campos">
            <div className="campo campo-largo">
              <label htmlFor="rt">Título</label>
              <input
                id="rt"
                value={form.titulo}
                autoFocus
                onChange={(e) => setForm({ ...form, titulo: e.target.value })}
              />
            </div>

            <div className="campo campo-largo">
              <label>Dias</label>
              <div className="linha" style={{ gap: 6, flexWrap: "wrap" }}>
                {DIAS.map((d, n) => (
                  <button
                    key={n}
                    className={`tecla${form.dias.includes(String(n)) ? " tecla-capturando" : ""}`}
                    style={{ width: 34 }}
                    onClick={() => alternarDia(n)}
                  >
                    {d}
                  </button>
                ))}
                <button className="btn btn-fantasma btn-pequeno" onClick={() => setForm({ ...form, dias: TODOS })}>
                  Todo dia
                </button>
                <button className="btn btn-fantasma btn-pequeno" onClick={() => setForm({ ...form, dias: UTEIS })}>
                  Seg a sex
                </button>
              </div>
            </div>

            <div className="campo">
              <label htmlFor="rd">Minutos por dia</label>
              <input
                id="rd"
                type="number"
                min={0}
                value={form.duracao_estimada_min ?? ""}
                onChange={(e) =>
                  setForm({ ...form, duracao_estimada_min: e.target.value ? Number(e.target.value) : null })
                }
              />
            </div>

            <div className="campo">
              <label htmlFor="rc">Curso</label>
              <select
                id="rc"
                value={form.course_id ?? ""}
                onChange={(e) => setForm({ ...form, course_id: e.target.value || null })}
              >
                <option value="">— sem curso —</option>
                {cursos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.titulo}
                  </option>
                ))}
              </select>
            </div>

            <div className="campo">
              <label htmlFor="ra">Categoria</label>
              <select
                id="ra"
                value={form.activity_type_id ?? ""}
                onChange={(e) => setForm({ ...form, activity_type_id: e.target.value || null })}
              >
                <option value="">— sem categoria —</option>
                {tipos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                  </option>
                ))}
              </select>
            </div>

            <div className="campo">
              <label htmlFor="rf">Até (opcional)</label>
              <input
                id="rf"
                type="date"
                value={form.fim ?? ""}
                onChange={(e) => setForm({ ...form, fim: e.target.value || null })}
              />
            </div>

            <div className="campo campo-largo">
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={form.ativa}
                  onChange={(e) => setForm({ ...form, ativa: e.target.checked })}
                  style={{ width: 15, height: 15, accentColor: "var(--acc)" }}
                />
                Ativa
              </label>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
