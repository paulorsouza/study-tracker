import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import Modal from "./Modal";
import * as I from "./icones";

type Estado = { configurado: boolean; conectado: boolean; email: string | null };
type Pendencias = { na_fila: number; conflitos: number; ultima_leitura: number | null };
type Resultado = {
  enviadas: number;
  recebimento: { aplicadas: number; ignoradas: number; conflitos: number };
  erro: string | null;
};
type TempoReal = {
  conectado: boolean;
  ultima_rodada: number | null;
  erro_rodada: string | null;
  erro_conexao: string | null;
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

/**
 * Sincronização em três passos que a tela mostra um por vez: configurar o
 * projeto, entrar, sincronizar. Os formulários ficam em modais; o que fica à
 * vista é o estado e a ação seguinte.
 */
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

  const [projetoAberto, setProjetoAberto] = useState(false);
  const [loginAberto, setLoginAberto] = useState(false);
  const [url, setUrl] = useState("");
  const [chave, setChave] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [criando, setCriando] = useState(false);
  const [rodando, setRodando] = useState(false);
  const [res, setRes] = useState<Resultado | null>(null);
  const [tr, setTr] = useState<TempoReal | null>(null);

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

  // O motor roda sozinho no processo do app; a tela só acompanha. Fila e
  // conflitos mudam sem clique nenhum agora, então são relidos junto.
  useEffect(() => {
    const ler = () => {
      invoke<TempoReal>("sync_tempo_real").then(setTr).catch(() => {});
      invoke<Pendencias>("sync_pendencias").then(setPend).catch(() => {});
      invoke<Conflito[]>("sync_conflitos").then(setConflitos).catch(() => {});
    };
    ler();
    const id = setInterval(ler, 2000);
    return () => clearInterval(id);
  }, []);

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

  const salvarProjeto = () =>
    invoke("supabase_salvar_config", { url, anonKey: chave })
      .then(() => {
        onErro(null);
        setProjetoAberto(false);
        carregar();
      })
      .catch((e) => onErro(String(e)));

  const entrar = () =>
    invoke("supabase_entrar", { email, senha, criar: criando })
      .then(() => {
        setSenha("");
        onErro(null);
        setLoginAberto(false);
        carregar();
      })
      .catch((e) => onErro(String(e)));

  if (!est) {
    return (
      <section className="card">
        <h2>Sincronização</h2>
        <p className="nota" style={{ margin: 0 }}>carregando…</p>
      </section>
    );
  }

  return (
    <>
      <section className="card">
        <div className="card-cab">
          <h2>Sincronização entre máquinas</h2>
          {est.configurado && (
            <button className="btn btn-fantasma btn-pequeno" onClick={() => setProjetoAberto(true)}>
              <I.Engrenagem size={14} /> Projeto
            </button>
          )}
        </div>

        {!est.configurado ? (
          <div className="passo-vazio">
            <div>
              <strong>Nenhum projeto configurado</strong>
              <p className="nota" style={{ margin: "2px 0 0" }}>
                Crie um projeto no Supabase, rode o SQL uma vez e cole aqui a URL e a chave anon.
              </p>
            </div>
            <button className="btn btn-primario" onClick={() => setProjetoAberto(true)}>
              Configurar projeto
            </button>
          </div>
        ) : !est.conectado ? (
          <div className="passo-vazio">
            <div>
              <strong>Projeto configurado</strong>
              <p className="nota" style={{ margin: "2px 0 0" }}>
                Falta entrar com a conta que as duas máquinas vão usar.
              </p>
            </div>
            <button className="btn btn-primario" onClick={() => setLoginAberto(true)}>
              Entrar
            </button>
          </div>
        ) : (
          <>
            <div className="linha" style={{ marginBottom: 16 }}>
              <span style={{ flex: 1 }}>
                Conectado como <b>{est.email}</b>
              </span>
              <button
                className="btn btn-fantasma btn-pequeno"
                onClick={() =>
                  invoke("supabase_sair").then(carregar).catch((e) => onErro(String(e)))
                }
              >
                Sair
              </button>
            </div>

            <div className="tiles">
              <div className="tile">
                <div className="tile-valor">{pend?.na_fila ?? 0}</div>
                <div className="tile-rotulo">na fila para enviar</div>
              </div>
              <div className="tile">
                <div className="tile-valor" style={pend?.conflitos ? { color: "var(--warn)" } : undefined}>
                  {pend?.conflitos ?? 0}
                </div>
                <div className="tile-rotulo">conflitos em aberto</div>
              </div>
              <div className="tile">
                <div className="tile-valor" style={{ fontSize: 17 }}>{quando(pend?.ultima_leitura ?? null)}</div>
                <div className="tile-rotulo">última leitura</div>
              </div>
            </div>

            <div className="aviso" style={{ marginBottom: 16 }}>
              <div>
                <strong>
                  {tr?.conectado
                    ? "Tempo real ligado"
                    : "Tempo real desconectado"}
                </strong>
                {tr?.ultima_rodada && <p>Última troca: {quando(tr.ultima_rodada)}</p>}
                {tr?.erro_rodada && <p style={{ color: "var(--warn)" }}>{tr.erro_rodada}</p>}
                {!tr?.conectado && tr?.erro_conexao && (
                  <p style={{ color: "var(--warn)" }}>{tr.erro_conexao}</p>
                )}
              </div>
            </div>

            <div className="linha">
              <button className="btn btn-fantasma" onClick={sincronizar} disabled={rodando}>
                {rodando ? "Sincronizando…" : "Sincronizar agora"}
              </button>
            </div>

            {res && !res.erro && (
              <div className="aviso" style={{ marginTop: 12, marginBottom: 0 }}>
                <div>
                  <strong>
                    {res.enviadas} enviada(s), {res.recebimento.aplicadas} aplicada(s)
                  </strong>
                  {res.recebimento.conflitos > 0 && (
                    <p>{res.recebimento.conflitos} em conflito</p>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {est.conectado && conflitos.length > 0 && (
        <section className="card">
          <h2>Conflitos</h2>
          {conflitos.map((c) => (
            <div key={c.id} className="lanc">
              <span className="lanc-cor" style={{ background: "var(--warn)" }} />
              <span className="lanc-hora num">{quando(c.criado_em)}</span>
              <span className="lanc-texto">
                <b>{c.entidade}</b>
                <span className="lanc-curso"> · {c.motivo}</span>
              </span>
              <button
                className="btn btn-pequeno"
                onClick={() =>
                  invoke("sync_resolver", { id: c.id, escolha: "manter_local" })
                    .then(() => { carregar(); onMudou(); })
                    .catch((e) => onErro(String(e)))
                }
              >
                Manter esta
              </button>
              <button
                className="btn btn-pequeno"
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
        </section>
      )}

      <Modal
        titulo="Projeto Supabase"
        aberto={projetoAberto}
        onFechar={() => setProjetoAberto(false)}
        larga
        pe={
          <>
            <button className="btn btn-fantasma" onClick={() => setProjetoAberto(false)}>Cancelar</button>
            <button className="btn btn-primario" onClick={salvarProjeto}>Salvar</button>
          </>
        }
      >
        <p className="nota">
          Crie um projeto em <code>supabase.com</code>, abra o <b>SQL Editor</b> e
          rode o script abaixo uma vez. Depois copie a <b>Project URL</b> e a
          chave <b>anon</b> em Settings → API.
        </p>
        <details className="detalhe" style={{ marginTop: 0 }}>
          <summary>Ver o SQL</summary>
          <pre className="bloco-codigo">{sql}</pre>
        </details>
        <div className="campos">
          <div className="campo campo-largo">
            <label htmlFor="surl">Project URL</label>
            <input
              id="surl"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://xxxx.supabase.co"
            />
          </div>
          <div className="campo campo-largo">
            <label htmlFor="skey">Chave anon</label>
            <input
              id="skey"
              value={chave}
              onChange={(e) => setChave(e.target.value)}
              placeholder="eyJ…"
            />
          </div>
        </div>
      </Modal>

      <Modal
        titulo={criando ? "Criar conta" : "Entrar"}
        aberto={loginAberto}
        onFechar={() => setLoginAberto(false)}
        pe={
          <>
            <button className="btn btn-fantasma" onClick={() => setLoginAberto(false)}>Cancelar</button>
            <button className="btn btn-primario" onClick={entrar}>
              {criando ? "Criar conta" : "Entrar"}
            </button>
          </>
        }
      >
        <div className="campos" onKeyDown={(e) => e.key === "Enter" && entrar()}>
          <div className="campo campo-largo">
            <label htmlFor="sem">E-mail</label>
            <input
              id="sem"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
            />
          </div>
          <div className="campo campo-largo">
            <label htmlFor="ssen">Senha</label>
            <input
              id="ssen"
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              autoComplete={criando ? "new-password" : "current-password"}
            />
          </div>
        </div>
        <label style={{ display: "flex", gap: 9, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={criando}
            onChange={(e) => setCriando(e.target.checked)}
            style={{ width: 15, height: 15, accentColor: "var(--acc)" }}
          />
          É a primeira vez — criar a conta neste projeto
        </label>
      </Modal>
    </>
  );
}
