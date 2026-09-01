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

type Curso = {
  id: string;
  titulo: string;
  url_principal: string | null;
  ultima_url: string | null;
  ultima_url_em: number | null;
  estado: string;
  favorito: boolean;
};

const PLATAFORMAS = [
  { nome: "Hotmart", url: "https://consumer.hotmart.com" },
  { nome: "T2 Educação", url: "https://app.t2.com.br/" },
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

function quando(ms: number | null) {
  if (!ms) return "nunca aberto";
  const dias = Math.floor((Date.now() - ms) / 86_400_000);
  if (dias === 0) return "hoje";
  if (dias === 1) return "ontem";
  return `há ${dias} dias`;
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
  const [erro, setErro] = useState<string | null>(null);
  const [cdm, setCdm] = useState<Cdm[] | null>(null);
  const [janelas, setJanelas] = useState<string[]>([]);
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [novoTitulo, setNovoTitulo] = useState("");
  const [novaUrl, setNovaUrl] = useState("");

  const recarregarCursos = useCallback(() => {
    invoke<Curso[]>("listar_cursos").then(setCursos).catch(() => {});
  }, []);

  useEffect(() => {
    sondarCdm().then(setCdm);
    invoke<Recovery | null>("timer_recover").then(setRecovery).catch(() => {});
    recarregarCursos();
  }, [recarregarCursos]);

  useEffect(() => {
    const id = setInterval(() => {
      invoke<Status | null>("timer_status").then(setStatus).catch(() => {});
      invoke<string[]>("janelas_curso").then(setJanelas).catch(() => {});
    }, 800);
    return () => clearInterval(id);
  }, []);

  const acao = (cmd: string, args?: Record<string, unknown>) =>
    invoke(cmd, args)
      .then(() => setErro(null))
      .catch((e) => setErro(String(e)));

  // Continuar de onde parou: a última URL visitada tem prioridade sobre a de
  // cadastro, porque é ela que aponta para a aula e não para a home.
  const continuar = (c: Curso) => {
    const alvo = c.ultima_url ?? c.url_principal;
    if (!alvo) {
      setErro(`"${c.titulo}" não tem URL. Abra pela plataforma e salve daqui.`);
      return;
    }
    acao("abrir_curso", { url: alvo, titulo: c.titulo, cursoId: c.id });
  };

  const adicionar = () =>
    invoke("criar_curso", {
      titulo: novoTitulo,
      url: novaUrl.trim() || null,
    })
      .then(() => {
        setNovoTitulo("");
        setNovaUrl("");
        setErro(null);
        recarregarCursos();
      })
      .catch((e) => setErro(String(e)));

  // Puxa a URL em que a janela está agora para o formulário. É o caminho curto:
  // navegue até a aula uma vez, salve, e daí em diante um clique volta direto.
  const capturar = (label: string) =>
    invoke<string | null>("url_atual", { label }).then((u) => {
      if (u) setNovaUrl(u);
      else setErro("Ainda não registrei navegação nessa janela.");
    });

  const suspeita = status && Math.abs(status.drift_ms) > 2000;
  const widevine = cdm?.find((c) => c.sistema === "Widevine");

  return (
    <main className="app">
      <header>
        <h1>Estudos</h1>
        <p className="sub">
          Fase 0 (spike) + fundação da Fase 1. Matriz em{" "}
          <code>docs/02-fase0-spike.md</code>.
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
            sabe o que aconteceu.
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
        <h2>Meus cursos</h2>

        {cursos.length === 0 ? (
          <p className="nota">
            Nenhum curso salvo. Abra a plataforma abaixo, navegue até a aula uma
            única vez e use <b>Usar esta página</b> — daí em diante você entra
            direto, sem repetir o caminho da Hotmart.
          </p>
        ) : (
          cursos.map((c) => (
            <div key={c.id} className="linha">
              <button
                className="primario"
                onClick={() => continuar(c)}
                title={c.ultima_url ?? c.url_principal ?? ""}
              >
                Continuar
              </button>
              <span className="rotulo" style={{ minWidth: 200, flex: 1 }}>
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
                  }).then(recarregarCursos)
                }
              >
                {c.favorito ? "Desfavoritar" : "Favoritar"}
              </button>
              <button
                onClick={() =>
                  acao("excluir_curso", { id: c.id }).then(recarregarCursos)
                }
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
            style={{ maxWidth: 220 }}
          />
          <input
            placeholder="URL da aula (opcional)"
            value={novaUrl}
            onChange={(e) => setNovaUrl(e.target.value)}
          />
          <button onClick={adicionar}>Adicionar</button>
        </div>
        <p className="nota">
          A cada navegação dentro da janela do curso, o app atualiza sozinho
          onde você parou — menos nas páginas de login, que nunca são gravadas.
        </p>
      </section>

      <section className="cartao">
        <h2>Plataformas</h2>
        <p className="nota">
          Faça o login você mesmo na janela que abrir. O app não digita
          credencial e não copia cookie de navegador nenhum.
        </p>

        {PLATAFORMAS.map((p) => (
          <div key={p.nome} className="linha">
            <span className="rotulo">{p.nome}</span>
            <button
              onClick={() =>
                acao("abrir_curso", {
                  url: p.url,
                  titulo: p.nome,
                  cursoId: null,
                })
              }
            >
              Modo integrado
            </button>
            <button onClick={() => acao("abrir_no_navegador", { url: p.url })}>
              Navegador dedicado
            </button>
          </div>
        ))}
      </section>

      <section className="cartao">
        <h2>Janelas abertas</h2>
        {janelas.length === 0 ? (
          <p className="nota">Nenhuma janela de curso aberta.</p>
        ) : (
          janelas.map((label) => (
            <div key={label} className="linha">
              <span className="rotulo" style={{ minWidth: 180, flex: 1 }}>
                {label.replace("curso-", "")}
              </span>
              <button className="primario" onClick={() => capturar(label)}>
                Usar esta página
              </button>
              <button onClick={() => acao("sair_tela_cheia", { label })}>
                Sair da tela cheia
              </button>
              <button onClick={() => acao("fechar_curso", { label })}>
                Fechar
              </button>
            </div>
          ))
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
                  modo integrado aqui. Falta confirmar no Linux, onde o
                  WebKitGTK normalmente não traz o CDM — é lá que D-001 se
                  decide.
                </>
              ) : (
                <>
                  Sem Widevine neste motor: todo curso com DRM vai precisar do
                  navegador dedicado.
                </>
              )}
            </p>
          </>
        )}
      </section>
    </main>
  );
}
