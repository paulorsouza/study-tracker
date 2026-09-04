import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import Painel from "./Painel";
import BarraJanela from "./BarraJanela";
import { useCompacto, ehMovel } from "./dispositivo";
import Tempo from "./Tempo";
import Planejamento from "./Planejamento";
import Foco from "./Foco";
import Notas, { NotaRapida } from "./Notas";
import Cursos from "./Cursos";
import Config from "./Config";
import * as I from "./icones";
import { ACOES, combo } from "./Cronometro";
import "./App.css";

export type Curso = {
  id: string;
  titulo: string;
  url_principal: string | null;
  ultima_url: string | null;
  ultima_url_em: number | null;
  estado: string;
  favorito: boolean;
};

export type Status = {
  session: string;
  entry_id: string;
  description: string;
  wall_ms: number;
  mono_ms: number;
  drift_ms: number;
  /// Segmentos já fechados desta sessão, de antes das pausas.
  acumulado_ms: number;
  pausado: boolean;
  curso_id: string | null;
  tarefa_id: string | null;
  materia_id: string | null;
  aula: string | null;
  activity_type_id: string;
  inicio_wall: number;
};

export type Recente = {
  activity_type_id: string;
  atividade: string;
  descricao: string | null;
  course_id: string | null;
  cor: string;
  icone: string | null;
  quando: number;
};

export type Favorito = {
  id: string;
  rotulo: string;
  descricao: string | null;
  activity_type_id: string;
  atividade: string;
  cor: string;
  course_id: string | null;
  curso: string | null;
  task_id: string | null;
};

type Recovery = {
  session: string;
  description: string;
  observed_ms: number;
  gap_ms: number;
};

type Aba = "painel" | "hoje" | "plano" | "foco" | "notas" | "cursos" | "config";

export function dur(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const d2 = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${d2(m)}:${d2(s % 60)}` : `${m}:${d2(s % 60)}`;
}

/** Duração para leitura, não para cronometragem: `1h 20m`. */
export function durCurta(ms: number) {
  const min = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${String(m).padStart(2, "0")}m`;
}

/** HH:MM local, para o campo de correção do início. */
function horaLocal(ms: number) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** O inverso, ancorado em hoje. Uma hora à frente do relógio é de ontem — é o
 *  caso de quem atravessa a meia-noite estudando. */
function deHoraLocal(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const d = new Date();
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  if (d.getTime() > Date.now()) d.setDate(d.getDate() - 1);
  return d.getTime();
}

export default function App() {
  // O planejamento é a tela de entrada, e não o painel. Abrir num resumo do
  // que já passou é abrir olhando para trás; quem liga o app quer saber o que
  // fazer agora. Vale nas duas versões — a diferença entre elas é o que cabe,
  // não o que importa.
  const [aba, setAba] = useState<Aba>("plano");
  const [status, setStatus] = useState<Status | null>(null);
  const [recovery, setRecovery] = useState<Recovery | null>(null);
  const [descricao, setDescricao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [versao, setVersao] = useState(0);
  const [rapida, setRapida] = useState<NotaRapida>(null);
  const [favoritos, setFavoritos] = useState<Favorito[]>([]);
  const [recentes, setRecentes] = useState<Recente[]>([]);
  const [editandoDock, setEditandoDock] = useState(false);
  const [dockDesc, setDockDesc] = useState("");
  const [dockCurso, setDockCurso] = useState("");
  const [dockInicio, setDockInicio] = useState("");
  const [atalhos, setAtalhos] = useState<Record<string, string>>({});
  const compacto = useCompacto();
  const [tema, setTema] = useState<"escuro" | "claro">(
    () => (localStorage.getItem("tema") as "escuro" | "claro") ?? "escuro"
  );

  useEffect(() => {
    document.documentElement.dataset.tema = tema;
    localStorage.setItem("tema", tema);
  }, [tema]);

  const recarregarCursos = useCallback(() => {
    invoke<Curso[]>("listar_cursos").then(setCursos).catch(() => {});
  }, []);

  // Uma mudança em qualquer lugar (aqui, na extensão) precisa refletir em
  // todas as telas — daí um contador único que as filhas observam.
  const mudou = useCallback(() => {
    recarregarCursos();
    setVersao((v) => v + 1);
    // A bandeja mostra as atividades recentes, então ela envelhece junto com o
    // histórico. Remontar aqui e não num relógio evita um menu que se
    // reconstrói na mão de quem está clicando nele.
    invoke("atualizar_bandeja").catch(() => {});
  }, [recarregarCursos]);

  const recarregarFavoritos = useCallback(() => {
    invoke<Favorito[]>("listar_favoritos").then(setFavoritos).catch(() => {});
    invoke<Recente[]>("listar_recentes", { limite: 4 }).then(setRecentes).catch(() => {});
  }, []);

  useEffect(() => {
    recarregarCursos();
    recarregarFavoritos();
    invoke<Recovery | null>("timer_recover").then(setRecovery).catch(() => {});
  }, [recarregarCursos, recarregarFavoritos]);

  useEffect(recarregarFavoritos, [versao, recarregarFavoritos]);

  useEffect(() => {
    invoke<string>("atalhos_ler")
      .then((j) => setAtalhos(JSON.parse(j)))
      .catch(() => {});
  }, [versao]);

  useEffect(() => {
    const id = setInterval(() => {
      invoke<Status | null>("timer_status").then(setStatus).catch(() => {});
    }, 500);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(recarregarCursos, 5000);
    return () => clearInterval(id);
  }, [recarregarCursos]);

  const iniciar = () => {
    invoke("timer_start", {
      description: descricao,
      cursoId: null,
      tarefaId: null,
      activityTypeId: null,
    })
      .then(() => {
        setDescricao("");
        setErro(null);
      })
      .catch((e) => setErro(String(e)));
  };

  const parar = () => {
    invoke("timer_stop")
      .then(() => {
        setErro(null);
        setEditandoDock(false);
        mudou();
      })
      .catch((e) => setErro(String(e)));
  };

  const cmd = (nome: string, args?: Record<string, unknown>) =>
    invoke(nome, args)
      .then(() => {
        setErro(null);
        mudou();
      })
      .catch((e) => setErro(String(e)));

  const abrirEdicaoDock = () => {
    if (!status) return;
    setDockDesc(status.description);
    setDockCurso(status.curso_id ?? "");
    setDockInicio(status.inicio_wall ? horaLocal(status.inicio_wall) : "");
    setEditandoDock(true);
  };

  const salvarEdicaoDock = async () => {
    try {
      await invoke("timer_editar", {
        descricao: dockDesc,
        cursoId: dockCurso || null,
        tarefaId: status?.tarefa_id ?? null,
        materiaId: status?.materia_id ?? null,
        aula: status?.aula ?? null,
        activityTypeId: null,
      });
      // O ajuste de início é uma chamada à parte porque só faz sentido com o
      // relógio correndo — pausado, não há segmento aberto para deslocar.
      if (dockInicio && status && !status.pausado) {
        const novo = deHoraLocal(dockInicio);
        if (novo !== null && novo !== status.inicio_wall) {
          await invoke("timer_ajustar_inicio", { inicio: novo });
        }
      }
      setErro(null);
      setEditandoDock(false);
    } catch (e) {
      setErro(String(e));
    }
  };

  // Ouvinte único dos atalhos. Fica aqui e não em cada tela porque as ações são
  // do app inteiro — e porque um ouvinte por tela daria duas respostas para a
  // mesma tecla quando duas estivessem montadas.
  //
  // Sem lista de dependências de propósito: o que o atalho faz depende do
  // estado do cronômetro, que muda a cada leitura. Uma lista fixaria o closure
  // e Ctrl+Enter pararia de saber se há sessão correndo.
  useEffect(() => {
    const ouvir = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      // Digitar numa caixa de texto não é acionar atalho. A exceção é a
      // combinação com Ctrl/Alt, que ninguém digita por acidente.
      const digitando =
        alvo && /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName) && !e.ctrlKey && !e.altKey && !e.metaKey;
      if (digitando) return;

      const c = combo(e);
      const acaoId = ACOES.find((a) => (atalhos[a.id] ?? a.padrao) === c)?.id;
      if (!acaoId) return;
      e.preventDefault();

      switch (acaoId) {
        case "iniciar":
          if (status) parar();
          else iniciar();
          break;
        case "pausar":
          if (status?.pausado) cmd("timer_retomar");
          else if (status) cmd("timer_pausar");
          break;
        case "nota":
          if (status) {
            setRapida({ entryId: status.entry_id, descricao: status.description });
            setAba("notas");
          }
          break;
        case "compacto":
          invoke("abrir_mini").catch((x) => setErro(String(x)));
          break;
        case "hoje":
          setAba("hoje");
          break;
        case "foco":
          setAba("foco");
          break;
      }
    };
    window.addEventListener("keydown", ouvir);
    return () => window.removeEventListener("keydown", ouvir);
  });

  const rodando = !!status;
  const pausado = !!status?.pausado;
  const totalSessao = status ? status.acumulado_ms + status.wall_ms : 0;
  const suspeita = status && !status.pausado && Math.abs(status.drift_ms) > 2000;

  // `curto` é o rótulo da barra de baixo, onde sete destinos dividem a largura
  // de um celular. O nome inteiro continua no `aria-label`: encurtar o texto
  // visível não pode encurtar o que o leitor de tela anuncia.
  // Ordem de uso, não de importância: planejar, ver o tempo, focar, e o curso
  // que está sendo estudado. O Painel desce porque é tela de revisão — e no
  // celular sai de vez: um resumo do mês não é o que se abre no ônibus.
  type ItemNav = {
    id: Aba;
    nome: string;
    curto?: string;
    soDesktop?: boolean;
    Icone: typeof I.Relogio;
  };
  const itens: ItemNav[] = ([
    { id: "plano", nome: "Planejamento", curto: "Plano", Icone: I.Lista },
    { id: "hoje", nome: "Tempo", Icone: I.Calendario },
    { id: "foco", nome: "Foco", Icone: I.Alvo },
    { id: "cursos", nome: "Cursos", Icone: I.Livro },
    { id: "notas", nome: "Notas", Icone: I.Nota },
    { id: "painel", nome: "Painel", soDesktop: true, Icone: I.Painel },
    { id: "config", nome: "Configurações", curto: "Ajustes", Icone: I.Engrenagem },
  ] as ItemNav[]).filter((x) => !(x.soDesktop && compacto));

  return (
    <div className="app-raiz">
      {/* A barra de título é nossa porque a decoração do sistema foi desligada
          (D-028). No celular não há janela para minimizar, maximizar ou
          fechar — mostrá-la seria oferecer três botões que não fazem nada. */}
      {!ehMovel && <BarraJanela />}
      <div className={`shell${compacto ? " shell-compacto" : ""}`}>
        <nav className={`lateral${compacto ? " lateral-barra" : ""}`} aria-label="Seções">
        {!compacto && (
          <div className="marca">
            <I.Relogio size={19} />
            Estudos
          </div>
        )}

        {itens.map(({ id, nome, curto, Icone }) => (
          <button
            key={id}
            className="nav-item"
            aria-current={aba === id ? "page" : undefined}
            aria-label={compacto ? nome : undefined}
            onClick={() => setAba(id)}
          >
            <Icone />
            {compacto ? curto ?? nome : nome}
          </button>
        ))}

        {/* Segunda janela não existe no Android, e numa janela estreita o modo
            compacto não resolve nada que a própria janela já não resolva. */}
        {!compacto && !ehMovel && (
          <button
            className="btn btn-fantasma"
            style={{ marginTop: "auto", width: "100%", justifyContent: "flex-start", gap: 11 }}
            onClick={() => invoke("abrir_mini").catch((e) => setErro(String(e)))}
          >
            <I.Janelinha /> Modo compacto
          </button>
        )}

        <div className={`dock${compacto ? " dock-barra" : ""}`} style={{ marginTop: 0 }}>
          {rodando ? (
            <>
              <div className="dock-rotulo" style={{ display: "flex", alignItems: "center", gap: 7 }}>
                {pausado ? <I.Pausa size={11} /> : <span className="pulso" />}
                {pausado ? "pausado" : "contando"}
              </div>
              <div className="dock-tempo">{dur(totalSessao)}</div>

              {editandoDock ? (
                <div style={{ display: "grid", gap: 6, marginBottom: 8 }}>
                  <input
                    value={dockDesc}
                    onChange={(e) => setDockDesc(e.target.value)}
                    placeholder="descrição"
                    autoFocus
                  />
                  <select value={dockCurso} onChange={(e) => setDockCurso(e.target.value)}>
                    <option value="">— sem curso —</option>
                    {cursos.map((c) => (
                      <option key={c.id} value={c.id}>{c.titulo}</option>
                    ))}
                  </select>
                  {!pausado && (
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                      <span className="dock-rotulo" style={{ margin: 0 }}>início</span>
                      <input
                        value={dockInicio}
                        onChange={(e) => setDockInicio(e.target.value)}
                        placeholder="HH:MM"
                        style={{ width: 70 }}
                      />
                    </label>
                  )}
                  <div className="linha">
                    <button className="btn btn-primario" onClick={salvarEdicaoDock}>
                      Salvar
                    </button>
                    <button className="btn btn-fantasma" onClick={() => setEditandoDock(false)}>
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="dock-desc dock-desc-botao"
                  onClick={abrirEdicaoDock}
                  title="Trocar descrição, curso ou hora de início"
                >
                  {status!.description || "sem descrição"}
                  <I.Lapis size={12} />
                </button>
              )}

              <div className="linha" style={{ marginBottom: 6 }}>
                {pausado ? (
                  <button
                    className="btn btn-primario cresce"
                    onClick={() => cmd("timer_retomar")}
                  >
                    <I.Play /> Retomar
                  </button>
                ) : (
                  <button className="btn cresce" onClick={() => cmd("timer_pausar")}>
                    <I.Pausa /> Pausar
                  </button>
                )}
                <button className="btn btn-icone" onClick={parar} aria-label="Parar">
                  <I.Parar />
                </button>
              </div>

              {/* §3.10: nota rápida durante a sessão. Amarra no lançamento que
                  está sendo gravado agora, e não no que estiver aberto na tela. */}
              <button
                className="btn"
                onClick={() => {
                  setRapida({
                    entryId: status!.entry_id,
                    descricao: status!.description,
                  });
                  setAba("notas");
                }}
              >
                <I.Nota size={15} /> Nota da sessão
              </button>
            </>
          ) : (
            <>
              <div className="dock-rotulo">cronômetro</div>
              <input
                placeholder="O que vai estudar?"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && iniciar()}
                style={{ marginBottom: 8 }}
              />
              <button className="btn btn-primario" onClick={iniciar}>
                <I.Play /> Iniciar
              </button>

              {recentes.length > 0 && (
                <div className="dock-recentes">
                  <div className="dock-rotulo">recentes</div>
                  {recentes.map((r, i) => (
                    <button
                      key={`${r.activity_type_id}-${i}`}
                      className="dock-favorito"
                      onClick={() =>
                        cmd("timer_start", {
                          description: r.descricao ?? "",
                          cursoId: r.course_id,
                          tarefaId: null,
                          activityTypeId: r.activity_type_id,
                        })
                      }
                      title={`Começar ${r.atividade.toLowerCase()} agora`}
                    >
                      <span style={{ color: r.cor, display: "flex", flex: "none" }}>
                        <I.IconeCategoria nome={r.icone} size={13} />
                      </span>
                      <span>{r.descricao || r.atividade}</span>
                    </button>
                  ))}
                </div>
              )}

              {favoritos.length > 0 && (
                <div className="dock-favoritos">
                  <div className="dock-rotulo">atalhos</div>
                  {favoritos.slice(0, 5).map((f) => (
                    <button
                      key={f.id}
                      className="dock-favorito"
                      onClick={() => cmd("timer_favorito", { id: f.id })}
                      title={[f.descricao, f.curso, f.atividade].filter(Boolean).join(" · ")}
                    >
                      <span className="ponto" style={{ background: f.cor }} />
                      <span>{f.rotulo}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        </nav>

        <main className="principal">
        <div className="conteudo">
          {erro && (
            <div className="aviso aviso-erro" role="alert">
              <I.Alerta />
              <div style={{ flex: 1 }}>
                <strong>Não deu certo</strong>
                <p>{erro}</p>
              </div>
              <button className="btn btn-fantasma" onClick={() => setErro(null)}>
                Fechar
              </button>
            </div>
          )}

          {recovery && (
            <div className="aviso aviso-atencao">
              <I.Alerta />
              <div style={{ flex: 1 }}>
                <strong>Sessão recuperada</strong>
                <p>
                  “{recovery.description || "sem descrição"}” ficou aberta.{" "}
                  <b>{durCurta(recovery.observed_ms)}</b> foram observados pelo
                  app; depois disso há <b>{durCurta(recovery.gap_ms)}</b> que
                  ninguém testemunhou.
                </p>
                <div style={{ marginTop: 10 }}>
                  <button
                    className="btn"
                    onClick={() =>
                      invoke("timer_discard_recovery", { session: recovery.session })
                        .then(() => {
                          setRecovery(null);
                          mudou();
                        })
                        .catch((e) => setErro(String(e)))
                    }
                  >
                    Contar só o tempo observado
                  </button>
                </div>
              </div>
            </div>
          )}

          {suspeita && (
            <div className="aviso aviso-atencao">
              <I.Alerta />
              <div>
                <strong>O relógio divergiu</strong>
                <p>
                  {Math.round(status!.drift_ms / 1000)}s de diferença entre o
                  relógio de parede e o monotônico: a máquina suspendeu ou a hora
                  do sistema mudou. Vai virar pergunta ao parar, nunca desconto
                  automático.
                </p>
              </div>
            </div>
          )}

          {aba === "painel" && (
            <Painel
              cursos={cursos}
              versao={versao}
              tema={tema}
              irPara={setAba}
              onErro={setErro}
              onMudou={mudou}
            />
          )}
          {aba === "hoje" && (
            <Tempo cursos={cursos} versao={versao} tema={tema} onErro={setErro} onMudou={mudou} />
          )}
          {aba === "plano" && (
            <Planejamento
              cursos={cursos}
              versao={versao}
              tema={tema}
              onErro={setErro}
              onMudou={mudou}
            />
          )}
          {aba === "foco" && (
            <Foco cursos={cursos} tema={tema} onErro={setErro} onMudou={mudou} />
          )}
          {aba === "notas" && (
            <Notas
              cursos={cursos}
              rapida={rapida}
              onRapidaUsada={() => setRapida(null)}
              onErro={setErro}
            />
          )}
          {aba === "cursos" && (
            <Cursos cursos={cursos} onErro={setErro} onMudou={mudou} />
          )}
          {aba === "config" && (
            <Config tema={tema} setTema={setTema} cursos={cursos} onErro={setErro} onMudou={mudou} />
          )}
        </div>
        </main>
      </div>
    </div>
  );
}
