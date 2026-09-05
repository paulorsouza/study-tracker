import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Curso } from "./App";
import * as I from "./icones";

export type Nota = {
  id: string;
  titulo: string | null;
  conteudo: string;
  modelo: string;
  course_id: string | null;
  curso: string | null;
  task_id: string | null;
  tarefa: string | null;
  time_entry_id: string | null;
  revisar_em: string | null;
  revisada_em: number | null;
  disponivel_para_ia: boolean;
  fixada: boolean;
  created_at: number;
  updated_at: number;
  tags: string[];
};

/** Esqueleto inicial do texto. Só isso — não muda comportamento nenhum. */
const MODELOS: { id: string; nome: string; corpo: string }[] = [
  { id: "livre", nome: "Livre", corpo: "" },
  {
    id: "resumo",
    nome: "Resumo",
    corpo: "## O que eu aprendi\n\n\n## Em uma frase\n\n",
  },
  {
    id: "duvidas",
    nome: "Dúvidas",
    corpo: "## O que não entendi\n\n\n## Onde procurar\n\n",
  },
  {
    id: "conceitos",
    nome: "Conceitos",
    corpo: "## Conceito\n\n\n## Com minhas palavras\n\n\n## Exemplo\n\n",
  },
  {
    id: "exercicios",
    nome: "Exercícios",
    corpo: "## Enunciado\n\n\n## Como resolvi\n\n\n## Onde travei\n\n",
  },
  {
    id: "proxima_acao",
    nome: "Próxima ação",
    corpo: "## Próximo passo\n\n\n## Por quê\n\n",
  },
];

const p2 = (n: number) => String(n).padStart(2, "0");
const hoje = () => {
  const d = new Date();
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
};

const quando = (ms: number) => {
  const dias = Math.floor((Date.now() - ms) / 86_400_000);
  if (dias === 0) return "hoje";
  if (dias === 1) return "ontem";
  if (dias < 30) return `há ${dias} dias`;
  return new Date(ms).toLocaleDateString("pt-BR");
};

export type NotaRapida = { entryId: string; descricao: string } | null;

export default function Notas({
  cursos,
  rapida,
  onRapidaUsada,
  onErro,
}: {
  cursos: Curso[];
  rapida: NotaRapida;
  onRapidaUsada: () => void;
  onErro: (e: string | null) => void;
}) {
  const [notas, setNotas] = useState<Nota[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [busca, setBusca] = useState("");
  const [tag, setTag] = useState("");
  const [curso, setCurso] = useState("");
  const [aRevisar, setARevisar] = useState(false);
  const [aberta, setAberta] = useState<Nota | "nova" | null>(null);

  const carregar = useCallback(() => {
    invoke<Nota[]>("listar_notas", {
      busca: busca || null,
      tag: tag || null,
      cursoId: curso || null,
      revisarAte: aRevisar ? hoje() : null,
    })
      .then(setNotas)
      .catch((e) => onErro(String(e)));
    invoke<string[]>("listar_tags").then(setTags).catch(() => {});
  }, [busca, tag, curso, aRevisar, onErro]);

  useEffect(() => {
    const t = setTimeout(carregar, 180); // não consulta a cada tecla
    return () => clearTimeout(t);
  }, [carregar]);

  // A nota rápida chega do cronômetro: abre o editor já amarrado à sessão.
  useEffect(() => {
    if (rapida) setAberta("nova");
  }, [rapida]);

  if (aberta) {
    return (
      <Editor
        nota={aberta === "nova" ? null : aberta}
        rapida={aberta === "nova" ? rapida : null}
        cursos={cursos}
        onFechar={() => {
          setAberta(null);
          onRapidaUsada();
        }}
        onSalvo={() => {
          setAberta(null);
          onRapidaUsada();
          carregar();
        }}
        onErro={onErro}
      />
    );
  }

  return (
    <>
      <div className="pagina-cab">
        <div>
          <h1 className="titulo-pagina">Notas</h1>
          <p className="legenda">
            O que ficou da sessão. Uma nota pode se amarrar ao curso, à tarefa e
            ao instante em que foi escrita.
          </p>
        </div>
        <div className="pagina-acoes">
          <button className="btn btn-primario" onClick={() => setAberta("nova")}>
            <I.Mais /> Nova nota
          </button>
        </div>
      </div>

      <div className="filtros">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar no texto"
          aria-label="Buscar no texto"
          style={{ flex: 1 }}
        />
        <select value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Tag" style={{ width: 150 }}>
          <option value="">todas as tags</option>
          {tags.map((t) => (
            <option key={t} value={t}>#{t}</option>
          ))}
        </select>
        <select value={curso} onChange={(e) => setCurso(e.target.value)} aria-label="Curso" style={{ width: 180 }}>
          <option value="">todos os cursos</option>
          {cursos.map((c) => (
            <option key={c.id} value={c.id}>{c.titulo}</option>
          ))}
        </select>
        <button
          className={`btn${aRevisar ? " btn-suave" : ""}`}
          onClick={() => setARevisar((v) => !v)}
          aria-pressed={aRevisar}
        >
          A revisar
        </button>
      </div>

      {notas.length === 0 ? (
        <div className="vazio">
          {busca || tag || curso || aRevisar
            ? "Nada com esses filtros."
            : "Nenhuma nota ainda. Com o cronômetro rodando, o botão Nota na lateral já amarra o que você escrever àquela sessão."}
        </div>
      ) : (
        <div className="notas-grade">
        {notas.map((n) => (
          <button
            key={n.id}
            className="nota-card"
            onClick={() => setAberta(n)}
          >
            <div className="nota-cab">
              {n.fixada && <I.Estrela size={13} cheia />}
              <strong>{n.titulo || primeiraLinha(n.conteudo)}</strong>
              <span className="nota-data">{quando(n.updated_at)}</span>
            </div>
            <p className="nota-previa">{previa(n.conteudo)}</p>
            <div className="nota-pes">
              {n.curso && <span className="nota-marca">{n.curso}</span>}
              {n.tags.map((t) => (
                <span key={t} className="nota-tag">#{t}</span>
              ))}
              {n.revisar_em && !n.revisada_em && (
                <span className="nota-marca nota-revisar">
                  revisar em {n.revisar_em.split("-").reverse().join("/")}
                </span>
              )}
              {n.disponivel_para_ia && (
                <span className="nota-marca">visível para a IA</span>
              )}
            </div>
          </button>
        ))}
        </div>
      )}
    </>
  );
}

const primeiraLinha = (c: string) =>
  c.split("\n").find((l) => l.trim())?.replace(/^#+\s*/, "").slice(0, 70) || "sem título";

const previa = (c: string) =>
  c.replace(/^#+\s*/gm, "").replace(/\n+/g, " · ").slice(0, 160);

function Editor({
  nota,
  rapida,
  cursos,
  onFechar,
  onSalvo,
  onErro,
}: {
  nota: Nota | null;
  rapida: NotaRapida;
  cursos: Curso[];
  onFechar: () => void;
  onSalvo: () => void;
  onErro: (e: string | null) => void;
}) {
  const [titulo, setTitulo] = useState(nota?.titulo ?? "");
  const [conteudo, setConteudo] = useState(nota?.conteudo ?? "");
  const [modelo, setModelo] = useState(nota?.modelo ?? "livre");
  const [curso, setCurso] = useState(nota?.course_id ?? "");
  const [tagsTxt, setTagsTxt] = useState((nota?.tags ?? []).join(", "));
  const [revisar, setRevisar] = useState(nota?.revisar_em ?? "");
  const [ia, setIa] = useState(nota?.disponivel_para_ia ?? false);

  // Trocar de modelo só preenche quando não há texto a perder.
  const aplicarModelo = (id: string) => {
    setModelo(id);
    const m = MODELOS.find((x) => x.id === id);
    if (m && !conteudo.trim()) setConteudo(m.corpo);
  };

  const salvar = () =>
    invoke<string>("salvar_nota", {
      id: nota?.id ?? null,
      titulo: titulo.trim() || null,
      conteudo,
      modelo,
      cursoId: curso || null,
      tarefaId: nota?.task_id ?? null,
      timeEntryId: nota?.time_entry_id ?? rapida?.entryId ?? null,
      revisarEm: revisar || null,
      disponivelParaIa: ia,
      tags: tagsTxt.split(",").map((t) => t.trim()).filter(Boolean),
    })
      .then(() => {
        onErro(null);
        onSalvo();
      })
      .catch((e) => onErro(String(e)));

  return (
    <>
      <div className="pagina-cab" style={{ alignItems: "center" }}>
        <button className="btn btn-fantasma btn-icone" onClick={onFechar} aria-label="Voltar">
          <I.Seta />
        </button>
        <div>
          <h1 className="titulo-pagina" style={{ margin: 0 }}>
            {nota ? "Editar nota" : "Nova nota"}
          </h1>
        </div>
        {nota && (
          <>
            <button
              className="btn btn-fantasma btn-icone"
              onClick={() =>
                invoke("fixar_nota", { id: nota.id, fixada: !nota.fixada })
                  .then(onSalvo)
                  .catch((e) => onErro(String(e)))
              }
              aria-label={nota.fixada ? "Desafixar" : "Fixar no topo"}
            >
              <I.Estrela cheia={nota.fixada} />
            </button>
            <button
              className="btn btn-fantasma btn-icone btn-perigo"
              onClick={() =>
                invoke("excluir_nota", { id: nota.id })
                  .then(onSalvo)
                  .catch((e) => onErro(String(e)))
              }
              aria-label="Excluir nota"
            >
              <I.Lixeira />
            </button>
          </>
        )}
      </div>

      {rapida && (
        <div className="aviso">
          <I.Relogio />
          <div>
            <strong>Amarrada à sessão em andamento</strong>
            <p>“{rapida.descricao || "sem descrição"}” — a nota vai ficar ligada a esse lançamento de tempo.</p>
          </div>
        </div>
      )}

      <section className="card">
        <div className="grade">
          <div className="campo cresce">
            <label htmlFor="nt">Título</label>
            <input
              id="nt"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="opcional — a primeira linha serve"
              autoFocus
            />
          </div>
          <div className="campo" style={{ width: 150 }}>
            <label htmlFor="nm">Modelo</label>
            <select id="nm" value={modelo} onChange={(e) => aplicarModelo(e.target.value)}>
              {MODELOS.map((m) => (
                <option key={m.id} value={m.id}>{m.nome}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="campo" style={{ marginTop: 12 }}>
          <label htmlFor="nc">Conteúdo</label>
          <textarea
            id="nc"
            className="editor-texto"
            value={conteudo}
            onChange={(e) => setConteudo(e.target.value)}
            placeholder="Markdown simples: ## título, - lista, **negrito**"
            rows={14}
          />
        </div>

        <div className="grade" style={{ marginTop: 12 }}>
          <div className="campo" style={{ width: 200 }}>
            <label htmlFor="ncur">Curso</label>
            <select id="ncur" value={curso} onChange={(e) => setCurso(e.target.value)}>
              <option value="">— nenhum —</option>
              {cursos.map((c) => (
                <option key={c.id} value={c.id}>{c.titulo}</option>
              ))}
            </select>
          </div>
          <div className="campo cresce">
            <label htmlFor="ntag">Tags</label>
            <input
              id="ntag"
              value={tagsTxt}
              onChange={(e) => setTagsTxt(e.target.value)}
              placeholder="separadas por vírgula"
            />
          </div>
          <div className="campo" style={{ width: 160 }}>
            <label htmlFor="nrev">Revisar em</label>
            <input
              id="nrev"
              type="date"
              value={revisar}
              onChange={(e) => setRevisar(e.target.value)}
            />
          </div>
        </div>

        <label style={{ display: "flex", gap: 9, alignItems: "flex-start", marginTop: 16 }}>
          <input
            type="checkbox"
            checked={ia}
            onChange={(e) => setIa(e.target.checked)}
            style={{ width: 15, height: 15, marginTop: 2, accentColor: "var(--acc)" }}
          />
          <span>
            Disponível para a IA
            <span className="nota" style={{ display: "block", margin: 0 }}>
              Só notas marcadas aqui podem ser lidas pelo Claude Desktop. O padrão
              é o silêncio: nota pessoal não vira contexto de IA por esquecimento.
            </span>
          </span>
        </label>

        <div className="linha" style={{ marginTop: 18 }}>
          <button className="btn btn-primario" onClick={salvar}>
            Salvar
          </button>
          <button className="btn btn-fantasma" onClick={onFechar}>
            Cancelar
          </button>
          {nota?.revisar_em && !nota.revisada_em && (
            <button
              className="btn"
              onClick={() =>
                invoke("revisar_nota", { id: nota.id, proxima: null })
                  .then(onSalvo)
                  .catch((e) => onErro(String(e)))
              }
            >
              Marcar como revisada
            </button>
          )}
        </div>
      </section>
    </>
  );
}
