import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Curso, dur, durCurta } from "./App";
import * as I from "./icones";

type Fase = "foco" | "pausa_curta" | "pausa_longa";

type Estado = {
  ativo: boolean;
  fase: Fase | null;
  rotulo: string | null;
  aguardando: Fase | null;
  rotulo_aguardando: string | null;
  focos: number;
  ciclos_ate_longa: number;
  decorrido_ms: number;
  planejado_ms: number;
  descricao: string;
};

type Config = {
  foco_min: number;
  curta_min: number;
  longa_min: number;
  ciclos_ate_longa: number;
  auto_pausa: boolean;
  auto_foco: boolean;
  som: boolean;
  tipo_pausa: string;
};

type Ciclo = {
  rotulo: string;
  atividade: string;
  cor: string;
  cor_escura: string | null;
  inicio: number;
  fim: number | null;
  efetivo_ms: number;
  planejado_ms: number | null;
};

type Tipo = { id: string; nome: string };

/** Bipe curto, gerado na hora. Sem arquivo de áudio, sem requisição. */
function bipe(agudo: boolean) {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = agudo ? 880 : 560;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
    osc.connect(g).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.55);
    setTimeout(() => ctx.close(), 900);
  } catch {
    /* sem áudio disponível — a notificação do sistema já avisou */
  }
}

export default function Foco({
  cursos,
  tema,
  onErro,
  onMudou,
}: {
  cursos: Curso[];
  tema: string;
  onErro: (e: string | null) => void;
  onMudou: () => void;
}) {
  const [est, setEst] = useState<Estado | null>(null);
  const [cfg, setCfg] = useState<Config | null>(null);
  const [ciclos, setCiclos] = useState<Ciclo[]>([]);
  const [tipos, setTipos] = useState<Tipo[]>([]);
  const [desc, setDesc] = useState("");
  const [curso, setCurso] = useState("");
  const [abrirCfg, setAbrirCfg] = useState(false);
  const somRef = useRef(true);

  const recarregar = useCallback(() => {
    invoke<Estado>("pomodoro_estado").then(setEst).catch(() => {});
    invoke<Ciclo[]>("pomodoro_ciclos").then(setCiclos).catch(() => {});
  }, []);

  useEffect(() => {
    invoke<Config>("pomodoro_config").then((c) => {
      setCfg(c);
      somRef.current = c.som;
    });
    invoke<Tipo[]>("listar_tipos").then(setTipos).catch(() => {});
    recarregar();
  }, [recarregar]);

  // O relógio corre no Rust; aqui só se pergunta o estado. Se a contagem
  // vivesse no JavaScript, ela atrasaria com a janela minimizada — que é
  // exatamente quando o Pomodoro precisa funcionar.
  useEffect(() => {
    const id = setInterval(recarregar, 500);
    return () => clearInterval(id);
  }, [recarregar]);

  useEffect(() => {
    const p = listen<{ terminou: string }>("pomodoro:fase", (ev) => {
      if (somRef.current) bipe(ev.payload.terminou === "foco");
      recarregar();
      onMudou();
    });
    return () => {
      p.then((un) => un());
    };
  }, [recarregar, onMudou]);

  const acao = (cmd: string, args?: Record<string, unknown>) =>
    invoke(cmd, args)
      .then(() => {
        onErro(null);
        recarregar();
        onMudou();
      })
      .catch((e) => onErro(String(e)));

  const restante = est ? Math.max(est.planejado_ms - est.decorrido_ms, 0) : 0;
  const pct = est && est.planejado_ms > 0 ? est.decorrido_ms / est.planejado_ms : 0;
  const emFoco = est?.fase === "foco";

  const R = 78;
  const circ = 2 * Math.PI * R;

  return (
    <>
      <h1 className="titulo-pagina">Foco</h1>
      <p className="legenda">
        O ciclo corre no processo do app, não na tela — continua certo com a
        janela minimizada atrás do navegador.
      </p>

      <section className="card">
        {est?.ativo ? (
          <div className="pomo">
            <div className="pomo-anel">
              <svg viewBox="0 0 180 180" width="180" height="180" aria-hidden>
                <circle
                  cx="90" cy="90" r={R}
                  fill="none" stroke="var(--surf-2)" strokeWidth="9"
                />
                <circle
                  cx="90" cy="90" r={R}
                  fill="none"
                  stroke={emFoco ? "var(--serie-1)" : "var(--ok)"}
                  strokeWidth="9"
                  strokeLinecap="round"
                  strokeDasharray={circ}
                  strokeDashoffset={circ * (1 - Math.min(pct, 1))}
                  transform="rotate(-90 90 90)"
                />
              </svg>
              <div className="pomo-centro">
                {est.fase ? (
                  <>
                    <div className="pomo-tempo">{dur(restante)}</div>
                    <div className="pomo-fase">{est.rotulo}</div>
                  </>
                ) : (
                  <>
                    <div className="pomo-fase" style={{ fontSize: 13 }}>
                      pronto para
                    </div>
                    <div className="pomo-tempo" style={{ fontSize: 21 }}>
                      {est.rotulo_aguardando}
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="pomo-lado">
              <div className="pomo-desc">{est.descricao || "sem descrição"}</div>

              <div className="pomo-pontos" aria-label={`${est.focos} focos concluídos`}>
                {Array.from({ length: est.ciclos_ate_longa }, (_, i) => (
                  <span
                    key={i}
                    className={`ponto${
                      i < est.focos % est.ciclos_ate_longa ||
                      (est.focos > 0 && est.focos % est.ciclos_ate_longa === 0)
                        ? " cheio"
                        : ""
                    }`}
                  />
                ))}
                <span className="nota" style={{ margin: 0, marginLeft: 6 }}>
                  {est.focos} foco{est.focos === 1 ? "" : "s"} hoje nesta sessão
                </span>
              </div>

              <div className="linha" style={{ marginTop: 4 }}>
                {est.aguardando ? (
                  <button className="btn btn-primario" onClick={() => acao("pomodoro_avancar")}>
                    <I.Play /> Começar {est.rotulo_aguardando?.toLowerCase()}
                  </button>
                ) : (
                  <button className="btn" onClick={() => acao("pomodoro_avancar")}>
                    Pular para a próxima
                  </button>
                )}
                <button className="btn btn-perigo" onClick={() => acao("pomodoro_encerrar")}>
                  <I.Parar /> Encerrar sessão
                </button>
              </div>

              {est.aguardando && (
                <p className="nota">
                  A próxima fase não começa sozinha — essa é a configuração
                  padrão. Encadear a pausa automaticamente tiraria de você a
                  decisão de parar.
                </p>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="grade">
              <div className="campo cresce">
                <label htmlFor="pd">No que vai focar</label>
                <input
                  id="pd"
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  placeholder="Aula 13 — modificadores"
                  onKeyDown={(e) =>
                    e.key === "Enter" &&
                    acao("pomodoro_iniciar", {
                      descricao: desc,
                      cursoId: curso || null,
                      tarefaId: null,
                    })
                  }
                />
              </div>
              <div className="campo" style={{ width: 190 }}>
                <label htmlFor="pc">Curso</label>
                <select id="pc" value={curso} onChange={(e) => setCurso(e.target.value)}>
                  <option value="">— nenhum —</option>
                  {cursos.map((c) => (
                    <option key={c.id} value={c.id}>{c.titulo}</option>
                  ))}
                </select>
              </div>
              <button
                className="btn btn-primario"
                onClick={() =>
                  acao("pomodoro_iniciar", {
                    descricao: desc,
                    cursoId: curso || null,
                    tarefaId: null,
                  })
                }
              >
                <I.Play /> Iniciar {cfg?.foco_min ?? 25} min
              </button>
            </div>
            <p className="nota">
              Também dá para iniciar um Pomodoro a partir de uma tarefa, no
              Planejamento.
            </p>
          </>
        )}
      </section>

      {ciclos.length > 0 && (
        <section className="card">
          <h2>Ciclos desta sessão</h2>
          {ciclos.map((c, i) => {
            const cor = tema === "escuro" ? c.cor_escura ?? c.cor : c.cor;
            const excedeu = c.planejado_ms != null && c.efetivo_ms > c.planejado_ms * 1.05;
            return (
              <div key={i} className="lanc">
                <span className="lanc-cor" style={{ background: cor }} />
                <span className="lanc-hora num">
                  {new Date(c.inicio).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span className="lanc-texto">
                  {c.rotulo}
                  {c.atividade !== "Estudo" && c.atividade !== "Pausa" && (
                    <span className="lanc-curso"> · {c.atividade}</span>
                  )}
                  {c.fim === null && <span className="lanc-curso"> · em andamento</span>}
                </span>
                <span className="lanc-dur num" style={{ minWidth: 104 }}>
                  <span style={{ color: excedeu ? "var(--warn)" : undefined }}>
                    {durCurta(c.efetivo_ms)}
                  </span>
                  {c.planejado_ms != null && (
                    <span style={{ color: "var(--tx-3)", fontWeight: 400 }}>
                      {" "}/ {durCurta(c.planejado_ms)}
                    </span>
                  )}
                </span>
              </div>
            );
          })}
          <p className="nota">
            Efetivo contra planejado. As pausas ficam registradas com início,
            fim e duração — e nenhuma delas entra no tempo estudado.
          </p>
        </section>
      )}

      <section className="card">
        <div className="card-cab">
          <h2>Configuração</h2>
          <button className="btn btn-fantasma" onClick={() => setAbrirCfg((v) => !v)}>
            {abrirCfg ? "Fechar" : "Ajustar"}
          </button>
        </div>

        {!cfg ? (
          <p className="nota" style={{ margin: 0 }}>carregando…</p>
        ) : abrirCfg ? (
          <>
            <div className="grade">
              {(
                [
                  ["foco_min", "Foco (min)"],
                  ["curta_min", "Pausa curta"],
                  ["longa_min", "Pausa longa"],
                  ["ciclos_ate_longa", "Focos até a longa"],
                ] as const
              ).map(([k, rot]) => (
                <div className="campo" key={k} style={{ width: 116 }}>
                  <label htmlFor={k}>{rot}</label>
                  <input
                    id={k}
                    type="number"
                    min={1}
                    value={cfg[k]}
                    onChange={(e) => setCfg({ ...cfg, [k]: Number(e.target.value) })}
                  />
                </div>
              ))}
              <div className="campo" style={{ width: 170 }}>
                <label htmlFor="tp">Categoria da pausa</label>
                <select
                  id="tp"
                  value={cfg.tipo_pausa}
                  onChange={(e) => setCfg({ ...cfg, tipo_pausa: e.target.value })}
                >
                  {tipos.map((t) => (
                    <option key={t.id} value={t.id}>{t.nome}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
              {(
                [
                  ["auto_pausa", "Começar a pausa sozinha quando o foco terminar"],
                  ["auto_foco", "Voltar ao foco sozinho quando a pausa terminar"],
                  ["som", "Avisar com som e notificação do sistema"],
                ] as const
              ).map(([k, rot]) => (
                <label key={k} style={{ display: "flex", gap: 9, alignItems: "center" }}>
                  <input
                    type="checkbox"
                    checked={cfg[k]}
                    onChange={(e) => setCfg({ ...cfg, [k]: e.target.checked })}
                    style={{ width: 15, height: 15, accentColor: "var(--acc)" }}
                  />
                  {rot}
                </label>
              ))}
            </div>

            <div className="linha" style={{ marginTop: 16 }}>
              <button
                className="btn btn-primario"
                onClick={() =>
                  invoke("pomodoro_salvar_config", { config: cfg })
                    .then(() => {
                      somRef.current = cfg.som;
                      setAbrirCfg(false);
                      onErro(null);
                    })
                    .catch((e) => onErro(String(e)))
                }
              >
                Salvar
              </button>
              <button className="btn btn-fantasma" onClick={() => setAbrirCfg(false)}>
                Cancelar
              </button>
            </div>
            <p className="nota">
              Vale a partir do próximo ciclo — mudar no meio não move a fase que
              já está correndo.
            </p>
          </>
        ) : (
          <p className="nota" style={{ margin: 0 }}>
            {cfg.foco_min} min de foco · {cfg.curta_min} de pausa ·{" "}
            {cfg.longa_min} na longa, a cada {cfg.ciclos_ate_longa} focos
            {cfg.auto_pausa || cfg.auto_foco ? " · encadeando sozinho" : ""}
          </p>
        )}
      </section>
    </>
  );
}
