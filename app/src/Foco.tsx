import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Curso, dur, durCurta } from "./App";
import { Materia } from "./Materias";
import Modal from "./Modal";
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
  pausada: boolean;
  activity_type_id: string | null;
};

type Config = {
  foco_min: number;
  curta_min: number;
  longa_min: number;
  ciclos_ate_longa: number;
  auto_pausa: boolean;
  auto_foco: boolean;
  som: boolean;
  abrir_curso: boolean;
  tipo_pausa: string;
};

type Ciclo = {
  id: string;
  activity_type_id: string;
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
  const [materia, setMateria] = useState("");
  const [aula, setAula] = useState("");
  const [materias, setMaterias] = useState<Materia[]>([]);
  const [ajustando, setAjustando] = useState(false);
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
    invoke<Materia[]>("listar_materias").then(setMaterias).catch(() => {});
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

  const R = 96;
  const circ = 2 * Math.PI * R;

  const comecar = () =>
    acao("pomodoro_iniciar", {
      descricao: desc,
      cursoId: curso || null,
      tarefaId: null,
      materiaId: materia || null,
      aula: aula.trim() || null,
    });

  const resumoCfg = cfg
    ? `${cfg.foco_min} min de foco · ${cfg.curta_min} de pausa · ${cfg.longa_min} na longa, a cada ${cfg.ciclos_ate_longa} focos${
        cfg.auto_pausa || cfg.auto_foco ? " · encadeando sozinho" : ""
      }`
    : "";

  return (
    <>
      <div className="pagina-cab">
        <div>
          <h1 className="titulo-pagina">Foco</h1>
          <p className="legenda">
            O ciclo corre no processo do app, não na tela — continua certo com a
            janela minimizada atrás do navegador.
          </p>
        </div>
        <div className="pagina-acoes">
          <button className="btn" onClick={() => setAjustando(true)} disabled={!cfg}>
            <I.Engrenagem size={15} /> Ajustar
          </button>
        </div>
      </div>

      <section className="card foco-hero">
        {est?.ativo ? (
          <div className="foco-ativo">
            <div className="pomo-anel">
              <svg viewBox="0 0 220 220" width="220" height="220" aria-hidden>
                <circle cx="110" cy="110" r={R} fill="none" stroke="var(--surf-3)" strokeWidth="10" />
                <circle
                  cx="110" cy="110" r={R}
                  fill="none"
                  stroke={emFoco ? "var(--serie-1)" : "var(--ok)"}
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={circ}
                  strokeDashoffset={circ * (1 - Math.min(pct, 1))}
                  transform="rotate(-90 110 110)"
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
                    <div className="pomo-fase">pronto para</div>
                    <div className="pomo-tempo" style={{ fontSize: 24 }}>
                      {est.rotulo_aguardando}
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="foco-desc">{est.descricao || "sem descrição"}</div>

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
                {est.focos} foco{est.focos === 1 ? "" : "s"} nesta sessão
              </span>
            </div>

            <div className="foco-botoes">
              <button
                className="mini-botao mini-parar"
                onClick={() => acao("pomodoro_encerrar")}
                title="Encerrar sessão"
                aria-label="Encerrar sessão"
              >
                <I.Parar size={20} />
              </button>
              {est.aguardando ? (
                <button
                  className="mini-botao mini-primario foco-principal"
                  onClick={() => acao("pomodoro_avancar")}
                  title={`Começar ${est.rotulo_aguardando?.toLowerCase()}`}
                  aria-label={`Começar ${est.rotulo_aguardando?.toLowerCase()}`}
                >
                  <I.Play size={28} />
                </button>
              ) : est.pausada ? (
                <button
                  className="mini-botao mini-primario foco-principal"
                  onClick={() => acao("pomodoro_retomar")}
                  title={`Retomar ${est.rotulo?.toLowerCase()}`}
                  aria-label={`Retomar ${est.rotulo?.toLowerCase()}`}
                >
                  <I.Play size={28} />
                </button>
              ) : (
                <button
                  className="mini-botao mini-primario foco-principal"
                  onClick={() => acao("pomodoro_pausar")}
                  title="Pausar"
                  aria-label="Pausar"
                >
                  <I.Pausa size={26} />
                </button>
              )}
              <button
                className="mini-botao"
                onClick={() => acao("pomodoro_avancar")}
                disabled={!!est.aguardando || est.pausada}
                title="Pular para a próxima fase"
                aria-label="Pular para a próxima fase"
              >
                <I.Pular size={20} />
              </button>
            </div>

            <div className="foco-rotulos">
              <span>{est.aguardando ? "" : est.pausada ? "" : "encerrar"}</span>
              <span>{est.aguardando ? "começar" : est.pausada ? "retomar" : "pausar"}</span>
              <span>{est.aguardando || est.pausada ? "" : "pular"}</span>
            </div>

            {/* Reclassificar a pausa correndo (§3.4). A linha ainda não foi
                gravada, então isto não é editar histórico: é dizer o que a
                pausa está sendo, enquanto ela é. `context` e `parent_id` não
                são tocados, e o vínculo com o ciclo continua. */}
            {est.fase !== "foco" && !est.aguardando && !est.pausada && (
              <div className="linha foco-reclassificar">
                <span className="nota" style={{ margin: 0 }}>A pausa está sendo</span>
                <select
                  value={est.activity_type_id ?? ""}
                  onChange={(e) =>
                    invoke("timer_editar", {
                      descricao: est.descricao,
                      cursoId: null,
                      tarefaId: null,
                      materiaId: null,
                      aula: null,
                      activityTypeId: e.target.value,
                    })
                      .then(() => {
                        onErro(null);
                        onMudou();
                      })
                      .catch((x) => onErro(String(x)))
                  }
                  style={{ width: 200 }}
                >
                  {tipos.map((t) => (
                    <option key={t.id} value={t.id}>{t.nome}</option>
                  ))}
                </select>
              </div>
            )}

            {est.pausada && (
              <p className="nota">
                O relógio parou onde estava. Retomar abre o que falta da fase,
                não ela inteira.
              </p>
            )}
            {est.aguardando && (
              <p className="nota">
                A próxima fase não começa sozinha — essa é a configuração
                padrão. Encadear a pausa automaticamente tiraria de você a
                decisão de parar.
              </p>
            )}
          </div>
        ) : (
          <div className="foco-inicio">
            <input
              className="foco-entrada"
              id="pd"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="No que vai focar?"
              aria-label="No que vai focar"
              onKeyDown={(e) => e.key === "Enter" && comecar()}
            />
            <div className="campos campos-3">
              <div className="campo">
                <label htmlFor="pc">Curso</label>
                <select id="pc" value={curso} onChange={(e) => setCurso(e.target.value)}>
                  <option value="">— nenhum —</option>
                  {cursos.map((c) => (
                    <option key={c.id} value={c.id}>{c.titulo}</option>
                  ))}
                </select>
              </div>
              <div className="campo">
                <label htmlFor="pm">Matéria</label>
                <select id="pm" value={materia} onChange={(e) => setMateria(e.target.value)}>
                  <option value="">— nenhuma —</option>
                  {materias.map((m) => (
                    <option key={m.id} value={m.id}>{m.nome}</option>
                  ))}
                </select>
              </div>
              <div className="campo">
                <label htmlFor="pa">Aula</label>
                <input
                  id="pa"
                  value={aula}
                  onChange={(e) => setAula(e.target.value)}
                  placeholder="Aula 13, módulo 2"
                  onKeyDown={(e) => e.key === "Enter" && comecar()}
                />
              </div>
            </div>
            <div className="foco-inicio-pe">
              <label className="linha" style={{ margin: 0, fontSize: 13, color: "var(--tx-2)" }}>
                <input
                  type="checkbox"
                  checked={cfg?.abrir_curso ?? false}
                  onChange={(e) =>
                    cfg &&
                    acao("pomodoro_salvar_config", {
                      config: { ...cfg, abrir_curso: e.target.checked },
                    })
                  }
                  style={{ width: 15, height: 15, accentColor: "var(--acc)" }}
                />
                Abrir a página do curso ao começar
              </label>
              <button className="btn btn-primario btn-grande" onClick={comecar}>
                <I.Play /> Iniciar {cfg?.foco_min ?? 25} min
              </button>
            </div>
            <p className="nota">{resumoCfg}</p>
          </div>
        )}
      </section>

      {ciclos.length > 0 && (
        <>
          <div className="secao-cab">
            <h2>Ciclos desta sessão</h2>
            <span className="nota" style={{ margin: 0 }}>efetivo contra planejado</span>
          </div>
          <div className="ciclos-grade">
            {ciclos.map((c, i) => {
              const cor = tema === "escuro" ? c.cor_escura ?? c.cor : c.cor;
              const excedeu = c.planejado_ms != null && c.efetivo_ms > c.planejado_ms * 1.05;
              const pausa = c.rotulo === "Pausa";
              return (
                <div key={i} className="ciclo-card" style={{ borderLeftColor: cor }}>
                  <div className="ciclo-cab">
                    <span className="ciclo-rotulo">
                      {c.rotulo}
                      {c.fim === null && <span className="pulso" style={{ marginLeft: 6 }} />}
                    </span>
                    <span className="num ciclo-hora">
                      {new Date(c.inicio).toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <div className="ciclo-tempo num">
                    <b style={{ color: excedeu ? "var(--warn)" : undefined }}>
                      {durCurta(c.efetivo_ms)}
                    </b>
                    {c.planejado_ms != null && <span> / {durCurta(c.planejado_ms)}</span>}
                  </div>
                  {/* Pausa já encerrada também pode ser reclassificada: só se
                      descobre que a caminhada foi longa depois que ela acaba.
                      `context` e `parent_id` não são tocados, então o ciclo
                      continua sendo o mesmo ciclo. */}
                  {pausa && c.fim !== null ? (
                    <select
                      className="ciclo-reclassificar"
                      value={c.activity_type_id}
                      onChange={(e) =>
                        acao("reclassificar_lancamento", {
                          id: c.id,
                          activityTypeId: e.target.value,
                        })
                      }
                      aria-label="Reclassificar esta pausa"
                    >
                      {tipos.map((t) => (
                        <option key={t.id} value={t.id}>{t.nome}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="ciclo-atividade">{c.atividade}</span>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {cfg && (
        <FormConfig
          key={ajustando ? "aberto" : "fechado"}
          aberto={ajustando}
          inicial={cfg}
          tipos={tipos}
          onFechar={() => setAjustando(false)}
          onSalvo={(novo) =>
            invoke("pomodoro_salvar_config", { config: novo })
              .then(() => {
                setCfg(novo);
                somRef.current = novo.som;
                setAjustando(false);
                onErro(null);
              })
              .catch((e) => onErro(String(e)))
          }
        />
      )}
    </>
  );
}

function FormConfig({
  aberto, inicial, tipos, onFechar, onSalvo,
}: {
  aberto: boolean;
  inicial: Config;
  tipos: Tipo[];
  onFechar: () => void;
  onSalvo: (c: Config) => void;
}) {
  const [cfg, setCfg] = useState<Config>(inicial);

  return (
    <Modal
      titulo="Ajustar o Pomodoro"
      aberto={aberto}
      onFechar={onFechar}
      pe={
        <>
          <button className="btn btn-fantasma" onClick={onFechar}>Cancelar</button>
          <button className="btn btn-primario" onClick={() => onSalvo(cfg)}>Salvar</button>
        </>
      }
    >
      <div className="campos">
        {(
          [
            ["foco_min", "Foco (min)"],
            ["curta_min", "Pausa curta (min)"],
            ["longa_min", "Pausa longa (min)"],
            ["ciclos_ate_longa", "Focos até a longa"],
          ] as const
        ).map(([k, rot]) => (
          <div className="campo" key={k}>
            <label htmlFor={`cfg-${k}`}>{rot}</label>
            <input
              id={`cfg-${k}`}
              type="number"
              min={1}
              value={cfg[k]}
              onChange={(e) => setCfg({ ...cfg, [k]: Number(e.target.value) })}
            />
          </div>
        ))}
        <div className="campo campo-largo">
          <label htmlFor="cfg-tp">Categoria da pausa</label>
          <select
            id="cfg-tp"
            value={cfg.tipo_pausa}
            onChange={(e) => setCfg({ ...cfg, tipo_pausa: e.target.value })}
          >
            {tipos.map((t) => (
              <option key={t.id} value={t.id}>{t.nome}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
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
      <p className="nota">
        Vale a partir do próximo ciclo — mudar no meio não move a fase que já
        está correndo.
      </p>
    </Modal>
  );
}
