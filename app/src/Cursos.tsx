import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Curso } from "./App";
import * as I from "./icones";

function quando(ms: number | null) {
  if (!ms) return "sem rota salva";
  const dias = Math.floor((Date.now() - ms) / 86_400_000);
  if (dias === 0) return "aberto hoje";
  if (dias === 1) return "aberto ontem";
  if (dias < 30) return `aberto há ${dias} dias`;
  return `parado há ${Math.floor(dias / 30)} ${Math.floor(dias / 30) === 1 ? "mês" : "meses"}`;
}

export default function Cursos({
  cursos,
  onErro,
  onMudou,
}: {
  cursos: Curso[];
  onErro: (e: string | null) => void;
  onMudou: () => void;
}) {
  const [titulo, setTitulo] = useState("");
  const [url, setUrl] = useState("");
  const [aberto, setAberto] = useState(false);

  const acao = (cmd: string, args: Record<string, unknown>) =>
    invoke(cmd, args)
      .then(() => {
        onErro(null);
        onMudou();
      })
      .catch((e) => onErro(String(e)));

  const abrir = (c: Curso) => {
    const alvo = c.ultima_url ?? c.url_principal;
    if (!alvo) {
      onErro(`"${c.titulo}" não tem rota salva. Estando na aula, salve pela extensão.`);
      return;
    }
    acao("abrir_no_navegador", { url: alvo });
  };

  return (
    <>
      <h1 className="titulo-pagina">Cursos</h1>
      <p className="legenda">
        Cada curso guarda a rota da última aula. Abrir leva direto para lá, no
        seu Chrome.
      </p>

      <section className="card">
        <div className="card-cab">
          <h2>{cursos.length ? `${cursos.length} curso${cursos.length > 1 ? "s" : ""}` : "Nenhum curso"}</h2>
          {!aberto && (
            <button className="btn" onClick={() => setAberto(true)}>
              <I.Mais /> Adicionar
            </button>
          )}
        </div>

        {aberto && (
          <div className="grade" style={{ marginBottom: cursos.length ? 18 : 0 }}>
            <div className="campo" style={{ width: 220 }}>
              <label htmlFor="ct">Nome</label>
              <input id="ct" value={titulo} onChange={(e) => setTitulo(e.target.value)} autoFocus />
            </div>
            <div className="campo cresce">
              <label htmlFor="cu">URL (opcional)</label>
              <input
                id="cu"
                placeholder="https://…"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
            <button
              className="btn btn-primario"
              onClick={() =>
                acao("criar_curso", { titulo, url: url.trim() || null }).then(() => {
                  setTitulo("");
                  setUrl("");
                  setAberto(false);
                })
              }
            >
              Salvar
            </button>
            <button className="btn btn-fantasma" onClick={() => setAberto(false)}>
              Cancelar
            </button>
          </div>
        )}

        {cursos.length === 0 && !aberto ? (
          <div className="vazio">
            Nenhum curso ainda.
            <br />
            Estando na aula no Chrome, use a extensão para salvar a rota — ela
            aparece aqui sozinha.
          </div>
        ) : (
          cursos.map((c) => (
            <div key={c.id} className="lanc">
              <span
                className="lanc-cor"
                style={{ background: c.favorito ? "var(--warn)" : "var(--line-2)" }}
              />
              <span className="lanc-texto" style={{ fontWeight: 500 }}>
                {c.titulo}
              </span>
              <span className="lanc-curso" style={{ fontSize: 12.5 }}>
                {quando(c.ultima_url_em)}
              </span>
              <button className="btn" onClick={() => abrir(c)}>
                <I.Externo /> Abrir
              </button>
              <span className="lanc-acoes">
                <button
                  className="btn btn-fantasma btn-icone"
                  onClick={() => acao("favoritar_curso", { id: c.id, favorito: !c.favorito })}
                  aria-label={c.favorito ? "Desfavoritar" : "Favoritar"}
                >
                  <I.Estrela cheia={c.favorito} />
                </button>
                <button
                  className="btn btn-fantasma btn-icone btn-perigo"
                  onClick={() => acao("excluir_curso", { id: c.id })}
                  aria-label="Remover curso"
                >
                  <I.Lixeira />
                </button>
              </span>
            </div>
          ))
        )}
      </section>
    </>
  );
}
