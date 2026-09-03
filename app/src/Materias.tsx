import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { durCurta } from "./App";
import * as I from "./icones";

export type Materia = {
  id: string;
  nome: string;
  cor: string | null;
  total_ms: number;
};

/**
 * Matérias, ou áreas de conhecimento.
 *
 * Existem ao lado do curso e não dentro dele: "Modelagem 3D" atravessa dois
 * cursos, e amarrá-la a um só perderia metade do tempo na hora de somar. A
 * tabela está no banco desde a primeira migração e nunca teve tela — o plano
 * cita "matéria" em oito lugares, e todos eles dependiam disto.
 */
export default function Materias({
  onErro,
  onMudou,
}: {
  onErro: (e: string | null) => void;
  onMudou: () => void;
}) {
  const [itens, setItens] = useState<Materia[]>([]);
  const [novo, setNovo] = useState("");
  const [editando, setEditando] = useState<string | null>(null);
  const [nome, setNome] = useState("");

  const carregar = useCallback(() => {
    invoke<Materia[]>("listar_materias").then(setItens).catch(() => {});
  }, []);

  useEffect(carregar, [carregar]);

  const acao = (cmd: string, args: Record<string, unknown>) =>
    invoke(cmd, args)
      .then(() => {
        onErro(null);
        carregar();
        onMudou();
      })
      .catch((e) => onErro(String(e)));

  return (
    <section className="card">
      <h2>Matérias</h2>
      <p className="legenda" style={{ marginBottom: 14 }}>
        Áreas de conhecimento, ao lado do curso e não dentro dele — a mesma
        matéria costuma atravessar mais de um curso.
      </p>

      <div className="grade" style={{ marginBottom: itens.length ? 18 : 0 }}>
        <div className="campo cresce">
          <label htmlFor="mn">Nova matéria</label>
          <input
            id="mn"
            value={novo}
            onChange={(e) => setNovo(e.target.value)}
            onKeyDown={(e) =>
              e.key === "Enter" &&
              novo.trim() &&
              acao("criar_materia", { nome: novo, cor: null }).then(() => setNovo(""))
            }
            placeholder="Modelagem 3D"
          />
        </div>
        <button
          className="btn"
          disabled={!novo.trim()}
          onClick={() =>
            acao("criar_materia", { nome: novo, cor: null }).then(() => setNovo(""))
          }
        >
          <I.Mais /> Adicionar
        </button>
      </div>

      {itens.length === 0 ? (
        <div className="vazio">Nenhuma matéria ainda.</div>
      ) : (
        itens.map((m) =>
          editando === m.id ? (
            <div key={m.id} className="grade" style={{ margin: "8px 0" }}>
              <div className="campo cresce">
                <input
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setEditando(null);
                    if (e.key === "Enter")
                      acao("editar_materia", { id: m.id, nome, cor: m.cor }).then(() =>
                        setEditando(null)
                      );
                  }}
                  autoFocus
                />
              </div>
              <button
                className="btn btn-primario"
                onClick={() =>
                  acao("editar_materia", { id: m.id, nome, cor: m.cor }).then(() =>
                    setEditando(null)
                  )
                }
              >
                Salvar
              </button>
              <button className="btn btn-fantasma" onClick={() => setEditando(null)}>
                Cancelar
              </button>
            </div>
          ) : (
            <div key={m.id} className="lanc">
              <span className="lanc-texto" style={{ fontWeight: 500 }}>{m.nome}</span>
              <span className="lanc-dur num">
                {m.total_ms > 0 ? durCurta(m.total_ms) : "—"}
              </span>
              <span className="lanc-acoes">
                <button
                  className="btn btn-fantasma btn-icone"
                  onClick={() => {
                    setEditando(m.id);
                    setNome(m.nome);
                  }}
                  aria-label={`Editar ${m.nome}`}
                >
                  <I.Lapis />
                </button>
                <button
                  className="btn btn-fantasma btn-icone btn-perigo"
                  onClick={() => acao("excluir_materia", { id: m.id })}
                  aria-label={`Excluir ${m.nome}`}
                >
                  <I.Lixeira />
                </button>
              </span>
            </div>
          )
        )
      )}

      <p className="nota">
        Excluir uma matéria não apaga o tempo gasto nela — só a etiqueta. Os
        lançamentos ficam.
      </p>
    </section>
  );
}
