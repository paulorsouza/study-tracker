import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { Curso } from "./App";
import * as I from "./icones";

type Pacote = {
  caminho: string;
  bytes: number;
  sessoes: number;
  notas: number;
  notas_ocultas: number;
  tarefas: number;
};

const PERIODOS = [
  { id: "30", nome: "30 dias", dias: 30 },
  { id: "90", nome: "3 meses", dias: 90 },
  { id: "365", nome: "1 ano", dias: 365 },
  { id: "tudo", nome: "Tudo", dias: null as number | null },
];

/**
 * Pacote de fontes para o NotebookLM (§4.3).
 *
 * "Integração baseada em formatos suportados, não em automação de cliques." O
 * app escreve um Markdown e abre o site; quem adiciona a fonte é o usuário. Não
 * existe interface oficial estável para subir fonte, e o plano é explícito em só
 * adotar integração direta quando existir.
 */
export default function NotebookLM({
  cursos,
  onErro,
}: {
  cursos: Curso[];
  onErro: (e: string | null) => void;
}) {
  const [curso, setCurso] = useState("");
  const [periodo, setPeriodo] = useState("90");
  const [pacote, setPacote] = useState<Pacote | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // Fechar a tela e voltar não deveria fazer o recibo do último pacote sumir,
  // mas também não vale guardá-lo entre sessões: o arquivo pode nem existir
  // mais quando o app abrir de novo.
  useEffect(() => setPacote(null), [curso, periodo]);

  const gerar = async () => {
    const dias = PERIODOS.find((p) => p.id === periodo)?.dias ?? null;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const ate = hoje.getTime() + 86_400_000;
    const desde = dias === null ? 0 : ate - dias * 86_400_000;

    const nome = cursos.find((c) => c.id === curso)?.titulo ?? "estudos";
    const caminho = await save({
      title: "Salvar o pacote",
      defaultPath: `${nome
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")}-${new Date().toISOString().slice(0, 10)}.md`,
      filters: [{ name: "Markdown", extensions: ["md"] }],
    });
    if (!caminho) return;

    setOcupado(true);
    try {
      setPacote(
        await invoke<Pacote>("gerar_pacote", {
          caminho,
          cursoId: curso || null,
          desde,
          ate,
        })
      );
      onErro(null);
    } catch (e) {
      onErro(String(e));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <section className="card">
      <h2>NotebookLM</h2>
      <p className="legenda" style={{ marginBottom: 14 }}>
        Junta sessões, notas, dúvidas, tarefas e links num arquivo Markdown para
        você adicionar como fonte. O app não sobe nada sozinho.
      </p>

      <div className="grade">
        <div className="campo cresce">
          <label htmlFor="nlc">Curso</label>
          <select id="nlc" value={curso} onChange={(e) => setCurso(e.target.value)}>
            <option value="">todos</option>
            {cursos.map((c) => (
              <option key={c.id} value={c.id}>{c.titulo}</option>
            ))}
          </select>
        </div>
        <div className="campo" style={{ width: 130 }}>
          <label htmlFor="nlp">Período</label>
          <select id="nlp" value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
            {PERIODOS.map((p) => (
              <option key={p.id} value={p.id}>{p.nome}</option>
            ))}
          </select>
        </div>
        <button className="btn btn-primario" onClick={gerar} disabled={ocupado}>
          <I.Nota size={15} /> Gerar pacote
        </button>
      </div>

      {pacote && (
        <>
          <hr />
          <p className="nota" style={{ marginTop: 0 }}>
            {pacote.caminho} · {Math.max(1, Math.round(pacote.bytes / 1024))} KB
          </p>
          <div className="totais" style={{ marginBottom: 14 }}>
            <div>
              <div className="total-valor">{pacote.sessoes}</div>
              <div className="total-rotulo">sessões</div>
            </div>
            <div>
              <div className="total-valor">{pacote.notas}</div>
              <div className="total-rotulo">notas</div>
            </div>
            <div>
              <div className="total-valor">{pacote.tarefas}</div>
              <div className="total-rotulo">tarefas</div>
            </div>
          </div>

          {pacote.notas_ocultas > 0 && (
            <p className="nota" style={{ marginTop: 0 }}>
              {pacote.notas_ocultas} nota
              {pacote.notas_ocultas === 1 ? "" : "s"} ficou de fora por estar
              marcada como indisponível para IA.
            </p>
          )}

          <ol className="passos">
            <li>Abra o NotebookLM e crie ou escolha um caderno.</li>
            <li>
              Em <b>Fontes</b>, use <b>Adicionar</b> e escolha o arquivo acima.
            </li>
            <li>
              Gerar de novo cria um arquivo novo — o NotebookLM não atualiza a
              fonte sozinho, então a antiga precisa ser removida à mão.
            </li>
          </ol>

          <button
            className="btn"
            onClick={() =>
              invoke("abrir_notebooklm").catch((e) => onErro(String(e)))
            }
          >
            <I.Externo /> Abrir o NotebookLM
          </button>
        </>
      )}

      <p className="nota">
        Nota marcada como <b>indisponível para IA</b> nunca entra no pacote — o
        NotebookLM é IA, e essa marca existe justamente para isso.
      </p>
    </section>
  );
}
