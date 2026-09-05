import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Curso, Favorito } from "./App";
import { ehMovel } from "./dispositivo";
import Modal from "./Modal";
import * as I from "./icones";

type Tipo = { id: string; nome: string; cor: string };

/** Ações que aceitam atalho. A lista mora aqui e no ouvinte de `App.tsx`. */
export const ACOES: { id: string; nome: string; padrao: string }[] = [
  { id: "iniciar", nome: "Iniciar ou parar o cronômetro", padrao: "Ctrl+Enter" },
  { id: "pausar", nome: "Pausar ou retomar", padrao: "Ctrl+P" },
  { id: "nota", nome: "Nota da sessão", padrao: "Ctrl+M" },
  { id: "compacto", nome: "Modo compacto", padrao: "Ctrl+Shift+C" },
  { id: "hoje", nome: "Ir para Tempo", padrao: "Ctrl+1" },
  { id: "foco", nome: "Ir para Foco", padrao: "Ctrl+2" },
];

/** A combinação como o ouvinte a enxerga. Ordem fixa, para comparar por igual. */
export function combo(e: KeyboardEvent): string {
  const p: string[] = [];
  if (e.ctrlKey || e.metaKey) p.push("Ctrl");
  if (e.altKey) p.push("Alt");
  if (e.shiftKey) p.push("Shift");
  const k = e.key.length === 1 ? e.key.toUpperCase() : e.key;
  if (!["Control", "Alt", "Shift", "Meta"].includes(k)) p.push(k);
  return p.join("+");
}

export default function Cronometro({
  cursos,
  onErro,
  onMudou,
}: {
  cursos: Curso[];
  onErro: (e: string | null) => void;
  onMudou: () => void;
}) {
  const [favoritos, setFavoritos] = useState<Favorito[]>([]);
  const [tipos, setTipos] = useState<Tipo[]>([]);
  const [atalhos, setAtalhos] = useState<Record<string, string>>({});
  const [capturando, setCapturando] = useState<string | null>(null);
  const [novo, setNovo] = useState(false);
  const [rotulo, setRotulo] = useState("");
  const [desc, setDesc] = useState("");
  const [tipo, setTipo] = useState("");
  const [curso, setCurso] = useState("");

  const carregar = useCallback(() => {
    invoke<Favorito[]>("listar_favoritos").then(setFavoritos).catch(() => {});
    invoke<Tipo[]>("listar_tipos")
      .then((t) => {
        setTipos(t);
        setTipo((a) => a || t[0]?.id || "");
      })
      .catch(() => {});
    invoke<string>("atalhos_ler")
      .then((j) => setAtalhos(JSON.parse(j)))
      .catch(() => {});
  }, []);

  useEffect(carregar, [carregar]);

  const gravarAtalhos = (mapa: Record<string, string>) => {
    setAtalhos(mapa);
    invoke("atalhos_salvar", { mapa: JSON.stringify(mapa) })
      .then(() => {
        onErro(null);
        onMudou();
      })
      .catch((e) => onErro(String(e)));
  };

  // A captura escuta a janela inteira: pedir para o usuário digitar o nome da
  // tecla seria pior de usar e ainda deixaria entrar combinação impossível.
  useEffect(() => {
    if (!capturando) return;
    const ouvir = (e: KeyboardEvent) => {
      e.preventDefault();
      if (e.key === "Escape") {
        setCapturando(null);
        return;
      }
      if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) return;
      gravarAtalhos({ ...atalhos, [capturando]: combo(e) });
      setCapturando(null);
    };
    window.addEventListener("keydown", ouvir, true);
    return () => window.removeEventListener("keydown", ouvir, true);
  });

  const criar = () =>
    invoke("criar_favorito", {
      rotulo,
      descricao: desc.trim() || null,
      activityTypeId: tipo,
      cursoId: curso || null,
      tarefaId: null,
    })
      .then(() => {
        setRotulo("");
        setDesc("");
        setCurso("");
        setNovo(false);
        onErro(null);
        carregar();
        onMudou();
      })
      .catch((e) => onErro(String(e)));

  return (
    <>
      <section className="card">
        <div className="card-cab">
          <h2>Combinações favoritas</h2>
          <button className="btn" onClick={() => setNovo(true)}>
            <I.Mais /> Nova
          </button>
        </div>
        <p className="legenda" style={{ marginBottom: 14 }}>
          Atalhos para o que você começa sempre igual. Aparecem no cronômetro da
          barra lateral, ordenados pelo que você mais aciona.
        </p>

        {favoritos.length === 0 ? (
          <div className="vazio">Nenhuma combinação favorita ainda.</div>
        ) : (
          favoritos.map((f) => (
            <div key={f.id} className="lanc">
              <span className="lanc-cor" style={{ background: f.cor }} />
              <span className="lanc-texto" style={{ fontWeight: 500 }}>{f.rotulo}</span>
              <span className="lanc-curso">
                {[f.descricao, f.curso, f.atividade].filter(Boolean).join(" · ")}
              </span>
              <span className="lanc-acoes">
                <button
                  className="btn btn-fantasma btn-icone btn-perigo"
                  onClick={() =>
                    invoke("excluir_favorito", { id: f.id })
                      .then(() => { carregar(); onMudou(); })
                      .catch((e) => onErro(String(e)))
                  }
                  aria-label={`Excluir ${f.rotulo}`}
                  title="Excluir"
                >
                  <I.Lixeira />
                </button>
              </span>
            </div>
          ))
        )}
      </section>

      <Modal
        titulo="Nova combinação favorita"
        aberto={novo}
        onFechar={() => setNovo(false)}
        pe={
          <>
            <button className="btn btn-fantasma" onClick={() => setNovo(false)}>Cancelar</button>
            <button className="btn btn-primario" onClick={criar}>Salvar</button>
          </>
        }
      >
        <div className="campos" onKeyDown={(e) => e.key === "Enter" && criar()}>
          <div className="campo campo-largo">
            <label htmlFor="fr">Nome</label>
            <input
              id="fr"
              value={rotulo}
              onChange={(e) => setRotulo(e.target.value)}
              placeholder="Blender de manhã"
            />
          </div>
          <div className="campo campo-largo">
            <label htmlFor="fd">Descrição do lançamento</label>
            <input
              id="fd"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="usa o nome, se vazio"
            />
          </div>
          <div className="campo">
            <label htmlFor="ft">Categoria</label>
            <select id="ft" value={tipo} onChange={(e) => setTipo(e.target.value)}>
              {tipos.map((t) => (
                <option key={t.id} value={t.id}>{t.nome}</option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="fc">Curso</label>
            <select id="fc" value={curso} onChange={(e) => setCurso(e.target.value)}>
              <option value="">— nenhum —</option>
              {cursos.map((c) => (
                <option key={c.id} value={c.id}>{c.titulo}</option>
              ))}
            </select>
          </div>
        </div>
      </Modal>

      {/* Atalho de teclado é conceito de computador com teclado. No celular a
          seção seria uma lista de combinações que ninguém consegue apertar. */}
      {!ehMovel && (
      <section className="card">
        <h2>Atalhos de teclado</h2>
        <p className="legenda" style={{ marginBottom: 14 }}>
          Valem dentro do app, não no sistema inteiro. Um atalho global roubaria
          a tecla de dentro do Chrome, que é onde você estuda.
        </p>

        <table className="medidas">
          <tbody>
            {ACOES.map((a) => (
              <tr key={a.id}>
                <td style={{ width: "auto" }}>{a.nome}</td>
                <td style={{ textAlign: "right" }}>
                  <button
                    className={`tecla${capturando === a.id ? " tecla-capturando" : ""}`}
                    onClick={() => setCapturando(a.id)}
                  >
                    {capturando === a.id
                      ? "pressione…"
                      : atalhos[a.id] ?? a.padrao}
                  </button>
                  {atalhos[a.id] && (
                    <button
                      className="btn btn-fantasma btn-icone"
                      style={{ marginLeft: 6 }}
                      onClick={() => {
                        const { [a.id]: _, ...resto } = atalhos;
                        gravarAtalhos(resto);
                      }}
                      aria-label={`Voltar ${a.nome} ao padrão`}
                      title="Voltar ao padrão"
                    >
                      <I.Fechar size={13} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      )}
    </>
  );
}
