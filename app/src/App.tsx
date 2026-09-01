import { useCallback, useEffect, useState } from "react";
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

type Cdm = { sistema: string; ok: boolean; detalhe: string };

const PLATAFORMAS = [
  { nome: "Hotmart", url: "https://consumer.hotmart.com" },
  { nome: "T2 Educação", url: "https://app.t2.com.br/" },
  // Página trivial, sem login, sem CSP hostil, sem JavaScript. Se esta abrir
  // em branco, o problema é do motor embarcado e não da plataforma — separa
  // "webview externa quebrada" de "Hotmart bloqueia webview".
  { nome: "Teste do motor", url: "https://example.com" },
];

const SISTEMAS_DRM = [
  { id: "com.widevine.alpha", rotulo: "Widevine" },
  { id: "com.microsoft.playready.recommendation", rotulo: "PlayReady" },
  { id: "org.w3.clearkey", rotulo: "ClearKey" },
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

/// Disponibilidade de CDM é propriedade do motor, não da origem — então dá
/// para medir aqui, numa página nossa, sem depender da CSP da Hotmart nem de
/// script injetado dar certo. É esta sonda que responde D-001.
async function sondarCdm(): Promise<Cdm[]> {
  const config: MediaKeySystemConfiguration[] = [
    {
      initDataTypes: ["cenc"],
      videoCapabilities: [{ contentType: 'video/mp4;codecs="avc1.42E01E"' }],
    },
  ];

  if (!navigator.requestMediaKeySystemAccess) {
    return SISTEMAS_DRM.map((s) => ({
      sistema: s.rotulo,
      ok: false,
      detalhe: "EME ausente neste motor",
    }));
  }

  return Promise.all(
    SISTEMAS_DRM.map(async (s) => {
      try {
        await navigator.requestMediaKeySystemAccess(s.id, config);
        return { sistema: s.rotulo, ok: true, detalhe: "disponível" };
      } catch (e) {
        return {
          sistema: s.rotulo,
          ok: false,
          detalhe: e instanceof Error ? e.name : String(e),
        };
      }
    })
  );
}

export default function App() {
  const [status, setStatus] = useState<Status | null>(null);
  const [recovery, setRecovery] = useState<Recovery | null>(null);
  const [descricao, setDescricao] = useState("");
  const [urlLivre, setUrlLivre] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [cdm, setCdm] = useState<Cdm[] | null>(null);
  const [janelas, setJanelas] = useState<string[]>([]);

  useEffect(() => {
    sondarCdm().then(setCdm);
    invoke<Recovery | null>("timer_recover").then(setRecovery).catch(() => {});
  }, []);

  const atualizarJanelas = useCallback(() => {
    invoke<string[]>("janelas_curso").then(setJanelas).catch(() => {});
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      invoke<Status | null>("timer_status").then(setStatus).catch(() => {});
      atualizarJanelas();
    }, 800);
    return () => clearInterval(id);
  }, [atualizarJanelas]);

  const acao = (cmd: string, args?: Record<string, unknown>) =>
    invoke(cmd, args)
      .then(() => setErro(null))
      .catch((e) => setErro(String(e)));

  const suspeita = status && Math.abs(status.drift_ms) > 2000;
  const widevine = cdm?.find((c) => c.sistema === "Widevine");

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
            <b>{dur(recovery.observed_ms)}</b> foram observados pelo app. Depois
            disso há uma lacuna de <b>{dur(recovery.gap_ms)}</b> em que ninguém
            sabe o que aconteceu — app fechado à força, máquina suspensa ou
            queda de energia.
          </p>
          <div className="linha">
            <button
              onClick={() =>
                acao("timer_discard_recovery", {
                  session: recovery.session,
                }).then(() => setRecovery(null))
              }
            >
              Contar só o tempo observado
            </button>
          </div>
        </div>
      )}

      <section className="cartao">
        <h2>P3 · motor deste computador</h2>
        {!cdm ? (
          <p className="nota">sondando…</p>
        ) : (
          <>
            <table className="medidas">
              <tbody>
                {cdm.map((c) => (
                  <tr key={c.sistema} className={c.ok ? "" : "destaque"}>
                    <td>{c.sistema}</td>
                    <td>{c.ok ? "disponível" : c.detalhe}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="nota">
              {widevine?.ok ? (
                <>
                  Widevine existe neste motor: aula com DRM <b>pode</b> tocar no
                  modo integrado aqui. Falta confirmar no Linux, onde o WebKitGTK
                  normalmente não traz o CDM — é lá que D-001 se decide.
                </>
              ) : (
                <>
                  Sem Widevine neste motor: todo curso com DRM vai precisar do
                  navegador dedicado. Se a maioria dos seus cursos for protegida,
                  isso é motivo para reabrir D-001.
                </>
              )}
            </p>
          </>
        )}
      </section>

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
                Divergência acima da tolerância: a máquina suspendeu ou o relógio
                do sistema foi alterado. Os dois casos são indistinguíveis daqui
                — por isso viram pergunta, não desconto automático.
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
                acao("timer_start", { description: descricao })
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
        <h2>P1 · P2 — plataformas</h2>
        <p className="nota">
          Faça o login você mesmo na janela que abrir. O app não digita
          credencial e não copia cookie de navegador nenhum.
        </p>

        {PLATAFORMAS.map((p) => (
          <div key={p.nome} className="linha">
            <span className="rotulo">{p.nome}</span>
            <button onClick={() => acao("abrir_curso", { url: p.url, titulo: p.nome })}>
              Modo integrado
            </button>
            <button onClick={() => acao("abrir_no_navegador", { url: p.url })}>
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
          <button onClick={() => acao("abrir_curso", { url: urlLivre, titulo: "Curso" })}>
            Integrado
          </button>
          <button onClick={() => acao("abrir_no_navegador", { url: urlLivre })}>
            Navegador
          </button>
        </div>
      </section>

      <section className="cartao">
        <h2>Janelas de curso abertas</h2>
        {janelas.length === 0 ? (
          <p className="nota">Nenhuma janela de curso aberta.</p>
        ) : (
          janelas.map((label) => (
            <div key={label} className="linha">
              <span className="rotulo" style={{ minWidth: 220 }}>
                {label}
              </span>
              <button onClick={() => acao("sair_tela_cheia", { label })}>
                Sair da tela cheia
              </button>
              <button
                onClick={() => acao("fechar_curso", { label }).then(atualizarJanelas)}
              >
                Fechar
              </button>
            </div>
          ))
        )}
        <p className="nota">
          O controle mora aqui de propósito: a página remota não tem canal de
          volta para o app, então quem fecha a janela é a janela principal. É a
          saída quando o site entra em tela cheia e engole as decorações.
        </p>
      </section>
    </main>
  );
}
