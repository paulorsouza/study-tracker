import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import Categorias from "./Categorias";
import Mcp from "./Mcp";
import * as I from "./icones";

type Ponte = { porta: number; token: string };

export default function Config({
  tema,
  setTema,
  onErro,
  onMudou,
}: {
  tema: "escuro" | "claro";
  setTema: (t: "escuro" | "claro") => void;
  onErro: (e: string | null) => void;
  onMudou: () => void;
}) {
  const [ponte, setPonte] = useState<Ponte | null>(null);
  const [mostrar, setMostrar] = useState(false);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    invoke<Ponte>("ponte_info").then(setPonte).catch(() => {});
  }, []);

  return (
    <>
      <h1 className="titulo-pagina">Configurações</h1>
      <p className="legenda">Aparência e ligação com o navegador.</p>

      <section className="card">
        <h2>Tema</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className={`btn ${tema === "escuro" ? "btn-primario" : ""}`}
            onClick={() => setTema("escuro")}
          >
            <I.Lua /> Escuro
          </button>
          <button
            className={`btn ${tema === "claro" ? "btn-primario" : ""}`}
            onClick={() => setTema("claro")}
          >
            <I.Sol /> Claro
          </button>
        </div>
      </section>

      <Categorias tema={tema} onErro={onErro} onMudou={onMudou} />

      <Mcp onErro={onErro} />

      <section className="card">
        <h2>Extensão do Chrome</h2>
        {!ponte ? (
          <p className="nota" style={{ margin: 0 }}>carregando…</p>
        ) : (
          <>
            <div className="grade">
              <div className="campo cresce">
                <label htmlFor="tok">Token de pareamento</label>
                <input
                  id="tok"
                  readOnly
                  value={mostrar ? ponte.token : "•".repeat(32)}
                  onFocus={(e) => e.currentTarget.select()}
                  style={{ fontFamily: '"Cascadia Mono", Consolas, monospace' }}
                />
              </div>
              <button className="btn" onClick={() => setMostrar((v) => !v)}>
                {mostrar ? "Ocultar" : "Mostrar"}
              </button>
              <button
                className="btn btn-primario"
                onClick={() =>
                  navigator.clipboard
                    .writeText(ponte.token)
                    .then(() => {
                      setCopiado(true);
                      setTimeout(() => setCopiado(false), 2000);
                    })
                    .catch(() => onErro("não consegui copiar"))
                }
              >
                {copiado ? "Copiado" : "Copiar"}
              </button>
            </div>

            <p className="nota">
              A ponte escuta em <code>127.0.0.1:{ponte.porta}</code> — só nesta
              máquina, nunca na rede. O token autoriza a extensão; trocá-lo
              desconecta ela na hora.
            </p>

            <hr />

            <h2 style={{ fontSize: 13.5 }}>Instalar a extensão</h2>
            <ol className="nota" style={{ paddingLeft: 18, lineHeight: 1.9 }}>
              <li>
                Abra <code>chrome://extensions</code> e ligue o modo do
                desenvolvedor.
              </li>
              <li>
                <b>Carregar sem compactação</b> → escolha a pasta{" "}
                <code>extensao/</code> do repositório.
              </li>
              <li>Nas opções da extensão, cole o token acima.</li>
            </ol>

            <div className="aviso" style={{ marginTop: 14, marginBottom: 0 }}>
              <I.Alerta />
              <div>
                <strong>A extensão só funciona com este app aberto</strong>
                <p>
                  É consequência do desenho, não defeito: a ponte vive dentro do
                  app. Fechou o app, a extensão perde o contato.
                </p>
              </div>
            </div>
          </>
        )}
      </section>
    </>
  );
}
