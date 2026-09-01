import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
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
  started_wall: number;
  last_beat_wall: number;
  observed_ms: number;
  gap_ms: number;
};

const PLATAFORMAS = [
  { nome: "Hotmart", url: "https://consumer.hotmart.com" },
  { nome: "T2 Educação", url: "https://app.t2.com.br/" },
];

function dur(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0
    ? `${h}h ${String(m).padStart(2, "0")}m ${String(r).padStart(2, "0")}s`
    : `${m}m ${String(r).padStart(2, "0")}s`;
}

export default function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [recovery, setRecovery] = useState<Recovery | null>(null);
  const [descricao, setDescricao] = useState("");
  const [urlLivre, setUrlLivre] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  // Uma sessão aberta no log significa que o processo morreu antes do stop.
  useEffect(() => {
    invoke<Recovery | null>("timer_recover").then(setRecovery).catch(() => {});
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      invoke<Status | null>("timer_status").then(setStatus).catch(() => {});
    }, 500);
    return () => clearInterval(id);
  }, []);

  const acao = (cmd: string, args?: Record<string, unknown>) =>
    invoke(cmd, args)
      .then(() => setErro(null))
      .catch((e) => setErro(String(e)));

  // Divergência entre relógio de parede e monotônico: a máquina dormiu ou o
  // relógio do sistema mudou. O spike mostra, não decide.
  const suspeita = status && Math.abs(status.drift_ms) > 2000;

  return (
    <main className="app">
      <header>
        <h1>Estudos · spike da Fase 0</h1>
        <p className="sub">
          Código descartável. Existe para preencher a matriz de compatibilidade
          em <code>docs/02-fase0-spike.md</code>.
        </p>
      </header>

      {erro && <div className="alerta erro">{erro}</div>}

      {recovery && (
        <div className="alerta">
          <strong>Sessão recuperada</strong>
          <p>
            “{recovery.description || "sem descrição"}” ficou aberta.{" "}
            <b>{dur(recovery.observed_ms)}</b> foram observados pelo app.
            Depois disso há uma lacuna de <b>{dur(recovery.gap_ms)}</b> em que
            ninguém sabe o que aconteceu — app fechado à força, máquina suspensa
            ou queda de energia.
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
          <p className="nota">
            Manter e dividir a lacuna são decisões da Fase 1 — aqui só importa
            provar que o tempo não observado nunca entra sozinho no total.
          </p>
        </div>
      )}

      <section className="cartao">
        <h2>P4 · cronômetro</h2>

        {status ? (
          <>
            <div className="relogio">{dur(status.wall_ms)}</div>
            <p className="desc">{status.description || "sem descrição"}</p>
            <table className="medidas">
              <tbody>
                <tr>
                  <td>relógio de parede</td>
                  <td>{dur(status.wall_ms)}</td>
                </tr>
                <tr>
                  <td>relógio monotônico</td>
                  <td>{dur(status.mono_ms)}</td>
                </tr>
                <tr className={suspeita ? "destaque" : ""}>
                  <td>divergência</td>
                  <td>{(status.drift_ms / 1000).toFixed(1)}s</td>
                </tr>
              </tbody>
            </table>
            {suspeita && (
              <p className="nota destaque">
                Divergência acima da tolerância: a máquina suspendeu ou o
                relógio do sistema foi alterado. Os dois casos são
                indistinguíveis daqui — por isso viram pergunta, não desconto
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
                e.key === "Enter" && acao("timer_start", { description: descricao })
              }
            />
            <button
              className="primario"
              onClick={() => acao("timer_start", { description: descricao })}
            >
              Iniciar
            </button>
          </>
        )}
      </section>

      <section className="cartao">
        <h2>P1 · P2 · P3 — plataformas</h2>
        <p className="nota">
          Faça o login você mesmo na janela que abrir. O app não digita
          credencial e não copia cookie de navegador nenhum.
        </p>

        {PLATAFORMAS.map((p) => (
          <div key={p.nome} className="linha">
            <span className="rotulo">{p.nome}</span>
            <button
              onClick={() =>
                acao("abrir_curso", { url: p.url, titulo: p.nome })
              }
            >
              Modo integrado
            </button>
            <button
              onClick={() => acao("abrir_no_navegador", { url: p.url })}
            >
              Navegador dedicado
            </button>
          </div>
        ))}

        <div className="linha">
          <input
            placeholder="https://… (aula específica)"
            value={urlLivre}
            onChange={(e) => setUrlLivre(e.target.value)}
          />
          <button
            onClick={() =>
              acao("abrir_curso", { url: urlLivre, titulo: "Curso" })
            }
          >
            Integrado
          </button>
          <button onClick={() => acao("abrir_no_navegador", { url: urlLivre })}>
            Navegador
          </button>
        </div>

        <p className="nota">
          A janela integrada mostra um painel de diagnóstico no canto inferior
          direito: se o CDM Widevine existe neste motor e se aquele curso
          específico pede DRM. É o dado que decide D-001.
        </p>
      </section>
    </main>
  );
}
