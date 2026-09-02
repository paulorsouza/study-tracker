import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import Painel from "./Painel";
import BarraJanela from "./BarraJanela";
import Hoje from "./Hoje";
import Planejamento from "./Planejamento";
import Foco from "./Foco";
import Notas, { NotaRapida } from "./Notas";
import Cursos from "./Cursos";
import Config from "./Config";
import * as I from "./icones";
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

type Status = {
  session: string;
  entry_id: string;
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

export default function App() {
  const [aba, setAba] = useState<Aba>("painel");
  const [status, setStatus] = useState<Status | null>(null);
  const [recovery, setRecovery] = useState<Recovery | null>(null);
  const [descricao, setDescricao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [versao, setVersao] = useState(0);
  const [rapida, setRapida] = useState<NotaRapida>(null);
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
  }, [recarregarCursos]);

  useEffect(() => {
    recarregarCursos();
    invoke<Recovery | null>("timer_recover").then(setRecovery).catch(() => {});
  }, [recarregarCursos]);

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
    invoke("timer_start", { description: descricao, cursoId: null, tarefaId: null })
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
        mudou();
      })
      .catch((e) => setErro(String(e)));
  };

  const rodando = !!status;
  const suspeita = status && Math.abs(status.drift_ms) > 2000;

  const itens: { id: Aba; nome: string; Icone: typeof I.Relogio }[] = [
    { id: "painel", nome: "Painel", Icone: I.Painel },
    { id: "hoje", nome: "Hoje", Icone: I.Calendario },
    { id: "plano", nome: "Planejamento", Icone: I.Lista },
    { id: "foco", nome: "Foco", Icone: I.Alvo },
    { id: "notas", nome: "Notas", Icone: I.Nota },
    { id: "cursos", nome: "Cursos", Icone: I.Livro },
    { id: "config", nome: "Configurações", Icone: I.Engrenagem },
  ];

  return (
    <div className="app-raiz">
      <BarraJanela />
      <div className="shell">
        <nav className="lateral" aria-label="Seções">
        <div className="marca">
          <I.Relogio size={19} />
          Estudos
        </div>

        {itens.map(({ id, nome, Icone }) => (
          <button
            key={id}
            className="nav-item"
            aria-current={aba === id ? "page" : undefined}
            onClick={() => setAba(id)}
          >
            <Icone />
            {nome}
          </button>
        ))}

        <button
          className="btn btn-fantasma"
          style={{ marginTop: "auto", width: "100%", justifyContent: "flex-start", gap: 11 }}
          onClick={() => invoke("abrir_mini").catch((e) => setErro(String(e)))}
        >
          <I.Janelinha /> Modo compacto
        </button>

        <div className="dock" style={{ marginTop: 0 }}>
          {rodando ? (
            <>
              <div className="dock-rotulo" style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span className="pulso" />
                contando
              </div>
              <div className="dock-tempo">{dur(status!.wall_ms)}</div>
              <p className="dock-desc">{status!.description || "sem descrição"}</p>
              <button className="btn btn-primario" onClick={parar}>
                <I.Parar /> Parar
              </button>
              {/* §3.10: nota rápida durante a sessão. Amarra no lançamento que
                  está sendo gravado agora, e não no que estiver aberto na tela. */}
              <button
                className="btn"
                style={{ marginTop: 6 }}
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
            <Painel cursos={cursos} versao={versao} tema={tema} irPara={setAba} />
          )}
          {aba === "hoje" && (
            <Hoje cursos={cursos} versao={versao} tema={tema} onErro={setErro} onMudou={mudou} />
          )}
          {aba === "plano" && (
            <Planejamento cursos={cursos} versao={versao} onErro={setErro} onMudou={mudou} />
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
            <Config tema={tema} setTema={setTema} onErro={setErro} onMudou={mudou} />
          )}
        </div>
        </main>
      </div>
    </div>
  );
}
