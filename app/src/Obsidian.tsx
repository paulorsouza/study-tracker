import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import * as I from "./icones";

type Config = {
  pasta: string | null;
  somente_criar: boolean;
  exportar_diario: boolean;
  exportar_cursos: boolean;
  exportar_notas: boolean;
  modelo_diario: string;
};

type Resultado = {
  criados: string[];
  atualizados: string[];
  preservados: string[];
  erros: string[];
};

type Conflito = { caminho: string; conflito_em: number };

const p2 = (n: number) => String(n).padStart(2, "0");

/** Fronteiras do dia em hora local — a interface é quem sabe o fuso. */
function limitesDoDia(d = new Date()) {
  const ini = new Date(d);
  ini.setHours(0, 0, 0, 0);
  const fim = new Date(ini);
  fim.setDate(fim.getDate() + 1);
  return {
    dia: `${ini.getFullYear()}-${p2(ini.getMonth() + 1)}-${p2(ini.getDate())}`,
    inicio: ini.getTime(),
    fim: fim.getTime(),
  };
}

export default function Obsidian({
  onErro,
}: {
  onErro: (e: string | null) => void;
}) {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [res, setRes] = useState<Resultado | null>(null);
  const [conflitos, setConflitos] = useState<Conflito[]>([]);
  const [editandoModelo, setEditandoModelo] = useState(false);
  const [exportando, setExportando] = useState(false);

  const carregar = useCallback(() => {
    invoke<Config>("obsidian_config").then(setCfg).catch((e) => onErro(String(e)));
    invoke<Conflito[]>("obsidian_conflitos").then(setConflitos).catch(() => {});
  }, [onErro]);

  useEffect(carregar, [carregar]);

  const salvar = (novo: Config) => {
    setCfg(novo);
    invoke("obsidian_salvar_config", { config: novo })
      .then(() => onErro(null))
      .catch((e) => onErro(String(e)));
  };

  const escolherPasta = async () => {
    try {
      const p = await open({ directory: true, multiple: false, title: "Pasta dentro do vault" });
      if (typeof p === "string" && cfg) salvar({ ...cfg, pasta: p });
    } catch (e) {
      onErro(String(e));
    }
  };

  const exportar = () => {
    const { dia, inicio, fim } = limitesDoDia();
    setExportando(true);
    invoke<Resultado>("obsidian_exportar", { dia, inicio, fim })
      .then((r) => {
        setRes(r);
        onErro(null);
        carregar();
      })
      .catch((e) => onErro(String(e)))
      .finally(() => setExportando(false));
  };

  if (!cfg) {
    return (
      <section className="card">
        <h2>Obsidian</h2>
        <p className="nota" style={{ margin: 0 }}>carregando…</p>
      </section>
    );
  }

  return (
    <section className="card">
      <h2>Obsidian</h2>

      <div className="grade">
        <div className="campo cresce">
          <label htmlFor="vault">Pasta dentro do vault</label>
          <input
            id="vault"
            readOnly
            value={cfg.pasta ?? ""}
            placeholder="nenhuma escolhida"
            style={{ fontFamily: '"Cascadia Mono", Consolas, monospace', fontSize: 12 }}
          />
        </div>
        <button className="btn" onClick={escolherPasta}>
          Escolher…
        </button>
        {cfg.pasta && (
          <button
            className="btn btn-fantasma btn-perigo"
            onClick={() => salvar({ ...cfg, pasta: null })}
          >
            Desligar
          </button>
        )}
      </div>

      <p className="nota">
        Escolha uma <b>subpasta</b>, não a raiz do vault. O app só escreve
        dentro dela, e recusa qualquer caminho que tente sair — inclusive por
        link simbólico.
      </p>

      {cfg.pasta && (
        <>
          <hr />

          <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {(
              [
                ["exportar_diario", "Nota diária com sessões, tarefas e notas do dia"],
                ["exportar_cursos", "Uma nota por curso, com tempo acumulado"],
                ["exportar_notas", "As notas do app como arquivos soltos"],
              ] as const
            ).map(([k, rot]) => (
              <label key={k} style={{ display: "flex", gap: 9, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={cfg[k]}
                  onChange={(e) => salvar({ ...cfg, [k]: e.target.checked })}
                  style={{ width: 15, height: 15, accentColor: "var(--acc)" }}
                />
                {rot}
              </label>
            ))}

            <label className="perm-linha" style={{ marginTop: 4 }}>
              <input
                type="checkbox"
                checked={cfg.somente_criar}
                onChange={(e) => salvar({ ...cfg, somente_criar: e.target.checked })}
                style={{ width: 15, height: 15, accentColor: "var(--acc)" }}
              />
              <span>
                <b>Somente criar</b>
                <span className="nota" style={{ display: "block", margin: 0 }}>
                  O app cria arquivos novos e nunca mexe em nenhum já existente.
                  É o modo sem risco algum — ao custo de o diário não se
                  atualizar durante o dia.
                </span>
              </span>
            </label>
          </div>

          <details className="detalhe" open={editandoModelo}>
            <summary onClick={() => setEditandoModelo((v) => !v)}>
              Modelo da nota diária
            </summary>
            <textarea
              className="editor-texto"
              rows={10}
              value={cfg.modelo_diario}
              onChange={(e) => setCfg({ ...cfg, modelo_diario: e.target.value })}
              onBlur={() => salvar(cfg)}
            />
            <p className="nota">
              Trocados na exportação: <code>{"{{data}}"}</code>{" "}
              <code>{"{{estudo}}"}</code> <code>{"{{estudo_min}}"}</code>{" "}
              <code>{"{{total}}"}</code> <code>{"{{sessoes}}"}</code>{" "}
              <code>{"{{tarefas}}"}</code> <code>{"{{notas}}"}</code>. O resto
              passa intacto, incluindo propriedades no topo.
            </p>
          </details>

          <div className="linha" style={{ marginTop: 16 }}>
            <button className="btn btn-primario" onClick={exportar} disabled={exportando}>
              <I.Externo /> {exportando ? "Exportando…" : "Exportar hoje"}
            </button>
            <span className="nota" style={{ margin: 0 }}>
              Exportação é manual por enquanto.
            </span>
          </div>

          {res && (
            <div className="aviso" style={{ marginTop: 14 }}>
              <div style={{ flex: 1 }}>
                <strong>
                  {res.criados.length} criado(s), {res.atualizados.length}{" "}
                  atualizado(s)
                </strong>
                {res.preservados.length > 0 && (
                  <p>
                    <b>{res.preservados.length}</b> arquivo(s) preservados por
                    terem sido editados no vault — o app não sobrescreveu nada.
                  </p>
                )}
                {res.erros.length > 0 && (
                  <p style={{ color: "var(--danger)" }}>{res.erros.join(" · ")}</p>
                )}
                {res.criados.length + res.atualizados.length === 0 &&
                  res.preservados.length === 0 && <p>Nada mudou desde a última vez.</p>}
              </div>
            </div>
          )}

          {conflitos.length > 0 && (
            <>
              <hr />
              <h2 style={{ fontSize: 13.5 }}>Editados no vault</h2>
              <p className="nota" style={{ marginTop: 0 }}>
                O app parou de atualizar estes arquivos. Se a versão do vault é
                a boa, assuma-a — a próxima exportação volta a mantê-los.
              </p>
              {conflitos.map((c) => (
                <div key={c.caminho} className="lanc">
                  <span className="lanc-cor" style={{ background: "var(--warn)" }} />
                  <span className="lanc-texto" style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>
                    {c.caminho}
                  </span>
                  <button
                    className="btn"
                    onClick={() =>
                      invoke("obsidian_aceitar_externo", { caminho: c.caminho })
                        .then(carregar)
                        .catch((e) => onErro(String(e)))
                    }
                  >
                    Assumir a do vault
                  </button>
                </div>
              ))}
            </>
          )}
        </>
      )}

      <div className="aviso" style={{ marginTop: 16, marginBottom: 0 }}>
        <I.Alerta />
        <div>
          <strong>Sobre sincronizar o vault entre máquinas</strong>
          <p>
            Isto <b>não</b> é sincronização — é exportação. Se o seu vault já é
            sincronizado por Git, Syncthing ou pelo Sync do Obsidian, as notas
            exportadas viajam junto de graça. O app não tenta assumir esse
            papel: seria construir uma ferramenta de sincronização pior do que
            as que já existem.
          </p>
        </div>
      </div>
    </section>
  );
}
