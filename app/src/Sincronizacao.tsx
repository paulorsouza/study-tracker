import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import * as I from "./icones";

type Estado = { configurado: boolean; conectado: boolean; email: string | null };
type Pendencias = { na_fila: number; conflitos: number; ultima_leitura: number | null };
type Resultado = {
  enviadas: number;
  recebimento: { aplicadas: number; ignoradas: number; conflitos: number };
  erro: string | null;
};
type Conflito = {
  id: string;
  entidade: string;
  registro_id: string;
  motivo: string;
  origem: string;
  criado_em: number;
  payload_remoto: string;
};

const quando = (ms: number | null) => {
  if (!ms) return "nunca";
  const min = Math.floor((Date.now() - ms) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  return new Date(ms).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
};

export default function Sincronizacao({
  onErro,
  onMudou,
}: {
  onErro: (e: string | null) => void;
  onMudou: () => void;
}) {
  const [est, setEst] = useState<Estado | null>(null);
  const [pend, setPend] = useState<Pendencias | null>(null);
  const [conflitos, setConflitos] = useState<Conflito[]>([]);
  const [sql, setSql] = useState("");

  const [url, setUrl] = useState("");
  const [chave, setChave] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [criando, setCriando] = useState(false);
  const [rodando, setRodando] = useState(false);
  const [res, setRes] = useState<Resultado | null>(null);

  const carregar = useCallback(() => {
    invoke<Estado>("supabase_estado").then((e) => {
      setEst(e);
      if (e.email) setEmail(e.email);
    }).catch(() => {});
    invoke<Pendencias>("sync_pendencias").then(setPend).catch(() => {});
    invoke<Conflito[]>("sync_conflitos").then(setConflitos).catch(() => {});
    invoke<string>("supabase_sql").then(setSql).catch(() => {});
  }, []);

  useEffect(carregar, [carregar]);

  const sincronizar = () => {
    setRodando(true);
    invoke<Resultado>("sync_agora")
      .then((r) => {
        setRes(r);
        onErro(r.erro ?? null);
        carregar();
        onMudou();
      })
      .catch((e) => onErro(String(e)))
      .finally(() => setRodando(false));
  };

  if (!est) {
    return (
      <section className="card">
        <h2>Sincronização</h2>
        <p className="nota" style={{ margin: 0 }}>carregando…</p>
      </section>
    );
  }

  return (
    <section className="card">
      <h2>Sincronização entre máquinas</h2>
      <p className="nota" style={{ marginTop: 0 }}>
        Cada pessoa usa o <b>próprio</b> projeto Supabase. Não existe servidor
        compartilhado — seus dados de estudo não ficam num banco de terceiros
        junto com os de outra pessoa.
      </p>

      <details className="detalhe">
        <summary>1. Criar o projeto e rodar o SQL</summary>
        <p className="nota">
          Crie um projeto em <code>supabase.com</code>, abra o <b>SQL Editor</b>{" "}
          e rode isto uma vez. Depois copie a <b>Project URL</b> e a chave{" "}
          <b>anon</b> em Settings → API.
        </p>
        <pre className="bloco-codigo">{sql}</pre>
      </details>

      <div className="grade" style={{ marginTop: 12 }}>
        <div className="campo cresce">
          <label htmlFor="surl">Project URL</label>
          <input
            id="surl"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://xxxx.supabase.co"
          />
        </div>
        <div className="campo cresce">
          <label htmlFor="skey">Chave anon</label>
          <input
            id="skey"
            value={chave}
            onChange={(e) => setChave(e.target.value)}
            placeholder="eyJ…"
          />
        </div>
        <button
          className="btn"
          onClick={() =>
            invoke("supabase_salvar_config", { url, anonKey: chave })
              .then(() => {
                onErro(null);
                carregar();
              })
              .catch((e) => onErro(String(e)))
          }
        >
          Salvar
        </button>
      </div>
      <p className="nota">
        A chave anon é pública por desenho: quem protege as linhas é a política
        de acesso por usuário que o SQL acima cria, não o sigilo dela.
      </p>

      {est.configurado && (
        <>
          <hr />
          {est.conectado ? (
            <div className="linha">
              <span style={{ flex: 1 }}>
                Conectado como <b>{est.email}</b>
              </span>
              <button
                className="btn btn-fantasma"
                onClick={() =>
                  invoke("supabase_sair").then(carregar).catch((e) => onErro(String(e)))
                }
              >
                Sair
              </button>
            </div>
          ) : (
            <>
              <div className="grade">
                <div className="campo cresce">
                  <label htmlFor="sem">E-mail</label>
                  <input
                    id="sem"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="username"
                  />
                </div>
                <div className="campo cresce">
                  <label htmlFor="ssen">Senha</label>
                  <input
                    id="ssen"
                    type="password"
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    autoComplete="current-password"
                  />
                </div>
                <button
                  className="btn btn-primario"
                  onClick={() =>
                    invoke("supabase_entrar", { email, senha, criar: criando })
                      .then(() => {
                        setSenha("");
                        onErro(null);
                        carregar();
                      })
                      .catch((e) => onErro(String(e)))
                  }
                >
                  {criando ? "Criar conta" : "Entrar"}
                </button>
              </div>
              <label style={{ display: "flex", gap: 9, alignItems: "center", marginTop: 8 }}>
                <input
                  type="checkbox"
                  checked={criando}
                  onChange={(e) => setCriando(e.target.checked)}
                  style={{ width: 15, height: 15, accentColor: "var(--acc)" }}
                />
                É a primeira vez — criar a conta neste projeto
              </label>
              <p className="nota">
                A senha vai uma vez para o seu Supabase e o app a esquece. O que
                fica guardado é o token de renovação, e no <b>cofre de
                credenciais do sistema</b> — não no banco do app, para que uma
                cópia do arquivo não leve a sessão junto.
              </p>
            </>
          )}
        </>
      )}

      {est.conectado && (
        <>
          <hr />
          <table className="medidas" style={{ marginBottom: 12 }}>
            <tbody>
              <tr>
                <td>na fila para enviar</td>
                <td className="num">{pend?.na_fila ?? 0}</td>
              </tr>
              <tr className={pend?.conflitos ? "destaque" : ""}>
                <td>conflitos em aberto</td>
                <td className="num">{pend?.conflitos ?? 0}</td>
              </tr>
              <tr>
                <td>última leitura</td>
                <td>{quando(pend?.ultima_leitura ?? null)}</td>
              </tr>
            </tbody>
          </table>

          <div className="linha">
            <button className="btn btn-primario" onClick={sincronizar} disabled={rodando}>
              {rodando ? "Sincronizando…" : "Sincronizar agora"}
            </button>
            <span className="nota" style={{ margin: 0 }}>
              recebe primeiro, depois envia
            </span>
          </div>

          {res && !res.erro && (
            <div className="aviso" style={{ marginTop: 12 }}>
              <div>
                <strong>
                  {res.enviadas} enviada(s), {res.recebimento.aplicadas} aplicada(s)
                </strong>
                <p>
                  {res.recebimento.ignoradas} ignorada(s) por já estarem aqui
                  {res.recebimento.conflitos > 0 &&
                    `, ${res.recebimento.conflitos} em conflito`}
                  .
                </p>
              </div>
            </div>
          )}

          {conflitos.length > 0 && (
            <>
              <hr />
              <h2 style={{ fontSize: 13.5 }}>Conflitos</h2>
              <p className="nota" style={{ marginTop: 0 }}>
                Nada foi descartado. Estes registros mudaram nos dois lados e o
                app não escolhe sozinho — as duas versões estão guardadas.
              </p>
              {conflitos.map((c) => (
                <div key={c.id} className="lanc">
                  <span className="lanc-cor" style={{ background: "var(--warn)" }} />
                  <span className="lanc-hora num">{quando(c.criado_em)}</span>
                  <span className="lanc-texto">
                    <b>{c.entidade}</b>
                    <span className="lanc-curso"> · {c.motivo}</span>
                  </span>
                  <button
                    className="btn"
                    onClick={() =>
                      invoke("sync_resolver", { id: c.id, escolha: "manter_local" })
                        .then(() => { carregar(); onMudou(); })
                        .catch((e) => onErro(String(e)))
                    }
                  >
                    Manter esta
                  </button>
                  <button
                    className="btn"
                    onClick={() =>
                      invoke("sync_resolver", { id: c.id, escolha: "usar_remoto" })
                        .then(() => { carregar(); onMudou(); })
                        .catch((e) => onErro(String(e)))
                    }
                  >
                    Usar a de lá
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
          <strong>Lançamento de tempo nunca é descartado</strong>
          <p>
            Se as duas máquinas registrarem sessões diferentes, as duas ficam —
            sobreposição aparece na linha do tempo do dia, para você decidir. O
            app não apaga tempo que você registrou.
          </p>
        </div>
      </div>
    </section>
  );
}
