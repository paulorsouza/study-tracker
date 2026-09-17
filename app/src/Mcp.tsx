import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import * as I from "./icones";

type Ferramentas = {
  criar_tarefa: boolean;
  concluir_tarefa: boolean;
  criar_nota: boolean;
  controlar_cronometro: boolean;
};

type ConfigMcp = {
  habilitado: boolean;
  leitura: boolean;
  escrita: boolean;
  ferramentas: Ferramentas;
};

type Info = { porta: number; token: string; config: ConfigMcp };

type Evento = {
  id: string;
  origem: string;
  acao: string;
  detalhe: string | null;
  resultado: string;
  created_at: number;
};

const FERRAMENTAS: [keyof Ferramentas, string][] = [
  ["criar_tarefa", "Criar tarefa no planejamento"],
  ["concluir_tarefa", "Concluir tarefa"],
  ["criar_nota", "Criar nota"],
  ["controlar_cronometro", "Iniciar e parar o cronômetro"],
];

export default function Mcp({
  onErro,
}: {
  onErro: (e: string | null) => void;
}) {
  const [info, setInfo] = useState<Info | null>(null);
  const [cfg, setCfg] = useState<ConfigMcp | null>(null);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [mostrarToken, setMostrarToken] = useState(false);
  const [verAuditoria, setVerAuditoria] = useState(false);
  const [confirmandoRevoga, setConfirmandoRevoga] = useState(false);

  const carregar = useCallback(() => {
    invoke<Info>("mcp_info")
      .then((i) => {
        setInfo(i);
        setCfg(i.config);
      })
      .catch((e) => onErro(String(e)));
    invoke<Evento[]>("listar_auditoria").then(setEventos).catch(() => {});
  }, [onErro]);

  useEffect(carregar, [carregar]);

  const salvar = (novo: ConfigMcp) => {
    setCfg(novo);
    invoke("mcp_salvar_config", { config: novo })
      .then(() => onErro(null))
      .catch((e) => onErro(String(e)));
  };

  if (!info || !cfg) {
    return (
      <section className="card">
        <h2>Claude Desktop</h2>
        <p className="nota" style={{ margin: 0 }}>carregando…</p>
      </section>
    );
  }

  // Caminho no formato do sistema em que a tela está: barra invertida só
  // faz sentido no Windows.
  const caminho = /windows/i.test(navigator.userAgent)
    ? "C:\\\\caminho\\\\do\\\\repositorio\\\\mcp\\\\servidor.js"
    : "/caminho/do/repositorio/mcp/servidor.js";
  const trecho = `{
  "mcpServers": {
    "estudos": {
      "command": "node",
      "args": ["${caminho}"],
      "env": {
        "ESTUDOS_TOKEN": "${mostrarToken ? info.token : "cole-o-token-aqui"}",
        "ESTUDOS_PORTA": "${info.porta}"
      }
    }
  }
}`;

  return (
    <section className="card">
      <div className="card-cab">
        <h2>Claude Desktop (MCP)</h2>
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={cfg.habilitado}
            onChange={(e) => salvar({ ...cfg, habilitado: e.target.checked })}
            style={{ width: 15, height: 15, accentColor: "var(--acc)" }}
          />
          Ativa
        </label>
      </div>

      {!cfg.habilitado ? (
        null
      ) : (
        <>
          <div className="perm">
            <label className="perm-linha">
              <input
                type="checkbox"
                checked={cfg.leitura}
                onChange={(e) => salvar({ ...cfg, leitura: e.target.checked })}
                style={{ width: 15, height: 15, accentColor: "var(--acc)" }}
              />
              <span>
                <b>Leitura</b>
                <span className="nota" style={{ display: "block", margin: 0 }}>
                  Planejamento, cursos, tempo e notas liberadas.
                </span>
              </span>
            </label>

            <label className="perm-linha">
              <input
                type="checkbox"
                checked={cfg.escrita}
                onChange={(e) => salvar({ ...cfg, escrita: e.target.checked })}
                style={{ width: 15, height: 15, accentColor: "var(--acc)" }}
              />
              <span>
                <b>Escrita</b>
              </span>
            </label>
          </div>

          {cfg.escrita && (
            <div style={{ marginTop: 4, paddingLeft: 24 }}>
              {FERRAMENTAS.map(([k, rot]) => (
                <label
                  key={k}
                  style={{ display: "flex", gap: 9, alignItems: "center", padding: "4px 0" }}
                >
                  <input
                    type="checkbox"
                    checked={cfg.ferramentas[k]}
                    onChange={(e) =>
                      salvar({
                        ...cfg,
                        ferramentas: { ...cfg.ferramentas, [k]: e.target.checked },
                      })
                    }
                    style={{ width: 15, height: 15, accentColor: "var(--acc)" }}
                  />
                  {rot}
                </label>
              ))}
            </div>
          )}

          <hr />

          <div className="grade">
            <div className="campo cresce">
              <label htmlFor="mtok">Token do MCP</label>
              <input
                id="mtok"
                readOnly
                value={mostrarToken ? info.token : "•".repeat(32)}
                onFocus={(e) => e.currentTarget.select()}
                style={{ fontFamily: '"Cascadia Mono", Consolas, monospace' }}
              />
            </div>
            <button className="btn" onClick={() => setMostrarToken((v) => !v)}>
              {mostrarToken ? "Ocultar" : "Mostrar"}
            </button>
            <button
              className="btn"
              onClick={() =>
                navigator.clipboard.writeText(info.token).catch(() => onErro("não consegui copiar"))
              }
            >
              Copiar
            </button>
          </div>

          <details className="detalhe">
            <summary>Como ligar no Claude Desktop</summary>
            <p className="nota">
              No arquivo <code>claude_desktop_config.json</code>, acrescente o
              bloco abaixo. Rode <code>npm install</code> dentro de{" "}
              <code>mcp/</code> uma vez antes.
            </p>
            <pre className="bloco-codigo">{trecho}</pre>
          </details>

          <div className="linha" style={{ marginTop: 14 }}>
            <button
              className="btn"
              onClick={() => {
                setVerAuditoria((v) => !v);
                carregar();
              }}
            >
              {verAuditoria ? "Ocultar" : "Ver"} auditoria ({eventos.length})
            </button>
            {confirmandoRevoga ? (
              <>
                <button
                  className="btn btn-perigo"
                  onClick={() =>
                    invoke<string>("mcp_revogar")
                      .then(() => {
                        setConfirmandoRevoga(false);
                        setMostrarToken(false);
                        carregar();
                      })
                      .catch((e) => onErro(String(e)))
                  }
                >
                  Confirmar revogação
                </button>
                <button className="btn btn-fantasma" onClick={() => setConfirmandoRevoga(false)}>
                  Cancelar
                </button>
                <span className="nota" style={{ margin: 0 }}>
                  O Claude Desktop para de conectar até você colar o token novo.
                </span>
              </>
            ) : (
              <button className="btn btn-fantasma btn-perigo" onClick={() => setConfirmandoRevoga(true)}>
                Revogar token
              </button>
            )}
          </div>

          {verAuditoria && (
            <div style={{ marginTop: 12 }}>
              {eventos.length === 0 ? (
                <p className="nota">Nada registrado ainda.</p>
              ) : (
                eventos.map((e) => (
                  <div key={e.id} className="lanc">
                    <span
                      className="lanc-cor"
                      style={{
                        background:
                          e.resultado === "ok" ? "var(--ok)" : "var(--warn)",
                      }}
                    />
                    <span className="lanc-hora num">
                      {new Date(e.created_at).toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span className="lanc-texto">
                      <b>{e.acao}</b>
                      <span className="lanc-curso"> · {e.origem}</span>
                      {e.detalhe && e.detalhe !== "{}" && (
                        <span className="lanc-curso"> · {e.detalhe}</span>
                      )}
                    </span>
                    <span
                      className="nota"
                      style={{
                        margin: 0,
                        color: e.resultado === "ok" ? undefined : "var(--warn)",
                      }}
                    >
                      {e.resultado}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}

      <div className="aviso" style={{ marginTop: 16, marginBottom: 0 }}>
        <I.Alerta />
        <div>
          <strong>Nota só chega à IA se você marcar</strong>
        </div>
      </div>
    </section>
  );
}
