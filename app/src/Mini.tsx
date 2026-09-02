import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import * as I from "./icones";
import "./App.css";

type Status = { description: string; wall_ms: number; acumulado_ms: number; pausado: boolean };
type Curso = {
  id: string;
  titulo: string;
  url_principal: string | null;
  ultima_url: string | null;
};

const ALTURA_BASE = 112;
const ALTURA_LINHA = 34;
type Pomo = {
  ativo: boolean;
  fase: string | null;
  rotulo: string | null;
  rotulo_aguardando: string | null;
  aguardando: string | null;
  focos: number;
  ciclos_ate_longa: number;
  decorrido_ms: number;
  planejado_ms: number;
  descricao: string;
};

const d2 = (n: number) => String(n).padStart(2, "0");
function dur(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${d2(m)}:${d2(s % 60)}` : `${m}:${d2(s % 60)}`;
}

/**
 * Janela compacta. Só mostra e comanda — o relógio e o ciclo do Pomodoro
 * continuam correndo no processo do app (D-014), então fechar esta janela não
 * para nada.
 */
export default function Mini() {
  const [st, setSt] = useState<Status | null>(null);
  const [pomo, setPomo] = useState<Pomo | null>(null);
  const [desc, setDesc] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [fixado, setFixado] = useState(true);
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    const ler = () => {
      invoke<Status | null>("timer_status").then(setSt).catch(() => {});
      invoke<Pomo>("pomodoro_estado").then(setPomo).catch(() => {});
    };
    ler();
    const id = setInterval(ler, 500);
    const p = listen("pomodoro:fase", ler);
    return () => {
      clearInterval(id);
      p.then((un) => un());
    };
  }, []);

  useEffect(() => {
    invoke<Curso[]>("listar_cursos").then(setCursos).catch(() => {});
  }, []);

  /**
   * A janela cresce para caber o menu e volta ao fechar. Não dá para usar um
   * flutuante: janela sem decoração recorta tudo que passa da borda, então o
   * que "abre por cima" simplesmente não apareceria.
   */
  const alternarMenu = () => {
    const abrindo = !menu;
    setMenu(abrindo);
    const altura = abrindo
      ? ALTURA_BASE + Math.min(cursos.length, 6) * ALTURA_LINHA + 14
      : ALTURA_BASE;
    invoke("mini_altura", { altura }).catch(() => {});
  };

  const acao = (cmd: string, args?: Record<string, unknown>) =>
    invoke(cmd, args)
      .then(() => setErro(null))
      .catch((e) => setErro(String(e).replace(/^Error:\s*/, "")));

  const emPomodoro = !!pomo?.ativo;
  const restante = pomo ? Math.max(pomo.planejado_ms - pomo.decorrido_ms, 0) : 0;

  return (
    <div className="mini">
      {/* A barra inteira é a área de arrasto: sem decoração do sistema, é ela
          que faz a janela ser movível. */}
      <div className="mini-barra" data-tauri-drag-region>
        <I.Relogio size={13} />
        <span className="mini-titulo" data-tauri-drag-region>
          {erro ?? (emPomodoro ? "Foco" : "Estudos")}
        </span>
        <button
          className="btn btn-fantasma btn-icone"
          onClick={alternarMenu}
          title="Meus cursos"
          aria-expanded={menu}
        >
          <I.Livro size={13} />
        </button>
        <button
          className="btn btn-fantasma btn-icone"
          onClick={() => {
            setFixado((v) => !v);
            acao("mini_no_topo", { fixar: !fixado });
          }}
          title={fixado ? "Desafixar do topo" : "Manter sempre no topo"}
          aria-pressed={fixado}
        >
          <I.Alfinete preso={fixado} size={13} />
        </button>
        <button
          className="btn btn-fantasma btn-icone"
          onClick={() => acao("expandir")}
          title="Abrir a janela completa"
        >
          <I.Expandir size={13} />
        </button>
        <button
          className="btn btn-fantasma btn-icone"
          onClick={() => acao("fechar_mini")}
          title="Fechar"
        >
          <I.Fechar size={13} />
        </button>
      </div>

      <div className="mini-corpo">
        {emPomodoro ? (
          <>
            <div className="mini-info">
              {/* Em espera não há tempo correndo: mostrar um traço grande é
                  ruído. O nome da fase que vem diz mais no mesmo espaço. */}
              <div
                className="mini-tempo"
                style={pomo!.fase ? undefined : { fontSize: 19, letterSpacing: "-.01em" }}
              >
                {pomo!.fase ? dur(restante) : pomo!.rotulo_aguardando}
              </div>
              <div className="mini-fase">
                {pomo!.fase ? pomo!.rotulo : "pronto para começar"}
                {" · "}
                {pomo!.focos} foco{pomo!.focos === 1 ? "" : "s"}
              </div>
            </div>
            <div className="mini-acoes">
              <button className="btn btn-primario" onClick={() => acao("pomodoro_avancar")}>
                {pomo!.aguardando ? <I.Play size={15} /> : "Pular"}
              </button>
              <button className="btn" onClick={() => acao("pomodoro_encerrar")}>
                <I.Parar size={16} />
              </button>
            </div>
          </>
        ) : st ? (
          <>
            <div className="mini-info">
              <div className="mini-tempo">{dur(st.acumulado_ms + st.wall_ms)}</div>
              <div className="mini-desc">
                {st.pausado && <I.Pausa size={11} />} {st.description || "sem descrição"}
              </div>
            </div>
            <div className="mini-acoes">
              {st.pausado ? (
                <button className="btn btn-primario" onClick={() => acao("timer_retomar")}>
                  <I.Play size={15} /> Retomar
                </button>
              ) : (
                <button className="btn" onClick={() => acao("timer_pausar")}>
                  <I.Pausa size={15} />
                </button>
              )}
              <button className="btn btn-primario" onClick={() => acao("timer_stop")}>
                <I.Parar size={15} />
              </button>
            </div>
          </>
        ) : (
          <>
            <input
              className="mini-info"
              placeholder="O que vai estudar?"
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              onKeyDown={(e) =>
                e.key === "Enter" &&
                acao("timer_start", { description: desc, cursoId: null, tarefaId: null, activityTypeId: null }).then(
                  () => setDesc("")
                )
              }
            />
            <div className="mini-acoes">
              <button
                className="btn"
                onClick={() =>
                  acao("pomodoro_iniciar", {
                    descricao: desc,
                    cursoId: null,
                    tarefaId: null, activityTypeId: null,
                  }).then(() => setDesc(""))
                }
                title="Iniciar um Pomodoro"
              >
                <I.Alvo size={16} />
              </button>
              <button
                className="btn btn-primario"
                onClick={() =>
                  acao("timer_start", {
                    description: desc,
                    cursoId: null,
                    tarefaId: null, activityTypeId: null,
                  }).then(() => setDesc(""))
                }
                title="Iniciar o cronômetro livre"
              >
                <I.Play size={16} />
              </button>
            </div>
          </>
        )}
      </div>

      {menu && (
        <div className="mini-menu">
          {cursos.length === 0 ? (
            <p className="nota" style={{ margin: 0, padding: "8px 9px" }}>
              Nenhum curso salvo ainda.
            </p>
          ) : (
            cursos.slice(0, 6).map((c) => {
              const alvo = c.ultima_url ?? c.url_principal;
              return (
                <div key={c.id} className="mini-curso">
                  <span
                    onClick={() =>
                      alvo
                        ? acao("abrir_no_navegador", { url: alvo })
                        : setErro("sem rota salva")
                    }
                    title={alvo ?? "sem rota salva"}
                    style={{ cursor: alvo ? "pointer" : "default" }}
                  >
                    {c.titulo}
                  </span>
                  {/* Abrir e começar a contar são ações separadas de propósito:
                      ligar o cronômetro como efeito colateral de abrir uma
                      página é o tipo de surpresa que faz o registro deixar de
                      ser confiável. */}
                  <button
                    className="btn btn-fantasma mini-curso-play"
                    title="Abrir e começar a contar"
                    onClick={() => {
                      if (alvo) acao("abrir_no_navegador", { url: alvo });
                      acao("timer_start", {
                        description: c.titulo,
                        cursoId: c.id,
                        tarefaId: null, activityTypeId: null,
                      });
                      alternarMenu();
                    }}
                  >
                    <I.Play size={13} />
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
