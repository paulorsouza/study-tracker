import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import Hoje from "./Hoje";
import "./App.css";

type Status = {
  session: string;
  description: string;
  wall_ms: number;
  mono_ms: number;
  drift_ms: number;
};

type Recovery = {
  session: string;
  description: string;
  observed_ms: number;
  gap_ms: number;
};

type Curso = {
  id: string;
  titulo: string;
  url_principal: string | null;
  ultima_url: string | null;
  ultima_url_em: number | null;
  estado: string;
  favorito: boolean;
};

type Ponte = { porta: number; token: string };

function dur(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const d2 = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}h ${d2(m)}m ${d2(r)}s` : `${m}m ${d2(r)}s`;
}

function quando(ms: number | null) {
  if (!ms) return "—";
  const dias = Math.floor((Date.now() - ms) / 86_400_000);
  if (dias === 0) return "hoje";
  if (dias === 1) return "ontem";
  return `há ${dias} dias`;
}

export default function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [recovery, setRecovery] = useState<Recovery | null>(null);
  const [descricao, setDescricao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [novoTitulo, setNovoTitulo] = useState("");
  const [novaUrl, setNovaUrl] = useState("");
  const [ponte, setPonte] = useState<Ponte | null>(null);
  const [mostrarToken, setMostrarToken] = useState(false);

  const recarregar = useCallback(() => {
    invoke<Curso[]>("listar_cursos").then(setCursos).catch(() => {});
  }, []);

  useEffect(() => {
    recarregar();
    invoke<Recovery | null>("timer_recover").then(setRecovery).catch(() => {});
    invoke<Ponte>("ponte_info").then(setPonte).catch(() => {});
  }, [recarregar]);

  useEffect(() => {
    const id = setInterval(() => {
      invoke<Status | null>("timer_status").then(setStatus).catch(() => {});
    }, 800);
    return () => clearInterval(id);
  }, []);

  // A extensão também mexe no estado, então a lista precisa se atualizar
  // sozinha — senão o curso salvo do Chrome só aparece se o usuário reabrir.
  useEffect(() => {
    const id = setInterval(recarregar, 4000);
    return () => clearInterval(id);
  }, [recarregar]);

  const acao = (cmd: string, args?: Record<string, unknown>) =>
    invoke(cmd, args)
      .then(() => setErro(null))
      .catch((e) => setErro(String(e)));

  const continuar = (c: Curso) => {
    const alvo = c.ultima_url ?? c.url_principal;
    if (!alvo) {
      setErro(`"${c.titulo}" não tem rota salva. Salve uma pela extensão.`);
      return;
    }
    acao("abrir_no_navegador", { url: alvo });
  };

  const adicionar = () =>
    invoke("criar_curso", { titulo: novoTitulo, url: novaUrl.trim() || null })
      .then(() => {
        setNovoTitulo("");
        setNovaUrl("");
        setErro(null);
        recarregar();
      })
      .catch((e) => setErro(String(e)));

  const suspeita = status && Math.abs(status.drift_ms) > 2000;

  return (
    <main className="app">
      <header>
        <h1>Estudos</h1>
        <p className="sub">
          Gestão dos estudos. O estudo em si acontece no Chrome — ver{" "}
          <code>D-007</code> em <code>docs/01-decisoes.md</code>.
        </p>
      </header>

      {erro && <div className="alerta erro">{erro}</div>}

      {recovery && (
        <div className="alerta">
          <strong>Sessão recuperada</strong>
          <p>
            “{recovery.description || "sem descrição"}” ficou aberta.{" "}
            <b>{dur(recovery.observed_ms)}</b> foram observados pelo app; depois
            disso há uma lacuna de <b>{dur(recovery.gap_ms)}</b> que ninguém
            testemunhou.
          </p>
          <div className="linha">
            <button
              onClick={() =>
                acao("timer_discard_recovery", { session: recovery.session }).then(
                  () => setRecovery(null)
                )
              }
            >
              Contar só o tempo observado
            </button>
          </div>
        </div>
      )}

      <section className="cartao">
        <h2>Cronômetro</h2>
        {status ? (
          <>
            <div className="relogio">{dur(status.wall_ms)}</div>
            <p className="desc">{status.description || "sem descrição"}</p>
            {suspeita && (
              <p className="nota destaque">
                Divergência de {(status.drift_ms / 1000).toFixed(0)}s entre
                relógio de parede e monotônico: a máquina suspendeu ou o relógio
                do sistema mudou. Vai virar pergunta ao parar, não desconto
                automático.
              </p>
            )}
            <button className="primario" onClick={() => acao("timer_stop")}>
              Parar
            </button>
          </>
        ) : (
          <>
            <input
              placeholder="O que você vai estudar?"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              onKeyDown={(e) =>
                e.key === "Enter" &&
                acao("timer_start", { description: descricao, cursoId: null })
              }
            />
            <button
              className="primario"
              onClick={() =>
                acao("timer_start", { description: descricao, cursoId: null })
              }
            >
              Iniciar
            </button>
          </>
        )}
      </section>

      <Hoje cursos={cursos} onErro={setErro} />

      <section className="cartao">
        <h2>Meus cursos</h2>

        {cursos.length === 0 ? (
          <p className="nota">
            Nenhum curso ainda. Estando na aula no Chrome, use a extensão para
            salvar a rota — ela aparece aqui.
          </p>
        ) : (
          cursos.map((c) => (
            <div key={c.id} className="linha">
              <button className="primario" onClick={() => continuar(c)}>
                Abrir
              </button>
              <span className="rotulo" style={{ minWidth: 180, flex: 1 }}>
                {c.favorito ? "★ " : ""}
                {c.titulo}
              </span>
              <span className="nota" style={{ margin: 0 }}>
                {quando(c.ultima_url_em)}
              </span>
              <button
                onClick={() =>
                  acao("favoritar_curso", {
                    id: c.id,
                    favorito: !c.favorito,
                  }).then(recarregar)
                }
              >
                {c.favorito ? "☆" : "★"}
              </button>
              <button
                onClick={() => acao("excluir_curso", { id: c.id }).then(recarregar)}
              >
                Remover
              </button>
            </div>
          ))
        )}

        <div className="linha" style={{ marginTop: 14 }}>
          <input
            placeholder="Nome do curso"
            value={novoTitulo}
            onChange={(e) => setNovoTitulo(e.target.value)}
            style={{ maxWidth: 200 }}
          />
          <input
            placeholder="URL (opcional)"
            value={novaUrl}
            onChange={(e) => setNovaUrl(e.target.value)}
          />
          <button onClick={adicionar}>Adicionar</button>
        </div>
      </section>

      <section className="cartao">
        <h2>Extensão do Chrome</h2>
        {!ponte ? (
          <p className="nota">carregando…</p>
        ) : (
          <>
            <p className="nota">
              A ponte escuta em <code>127.0.0.1:{ponte.porta}</code> — só nesta
              máquina, nunca na rede. Cole o token nas opções da extensão.
            </p>
            <div className="linha">
              <input
                readOnly
                value={mostrarToken ? ponte.token : "•".repeat(32)}
                onFocus={(e) => e.currentTarget.select()}
              />
              <button onClick={() => setMostrarToken((v) => !v)}>
                {mostrarToken ? "Ocultar" : "Mostrar"}
              </button>
              <button
                onClick={() =>
                  navigator.clipboard
                    .writeText(ponte.token)
                    .then(() => setErro(null))
                    .catch(() => setErro("não consegui copiar"))
                }
              >
                Copiar
              </button>
            </div>
            <p className="nota">
              Instalar: Chrome → <code>chrome://extensions</code> → modo do
              desenvolvedor → <b>Carregar sem compactação</b> → escolher a pasta{" "}
              <code>extensao/</code> do repositório.
            </p>
          </>
        )}
      </section>
    </main>
  );
}
