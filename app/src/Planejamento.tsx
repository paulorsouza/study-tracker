import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Curso, durCurta } from "./App";
import { Tipo, corDe } from "./tempo-comum";
import * as I from "./icones";

type Tarefa = {
  id: string;
  titulo: string;
  course_id: string | null;
  curso: string | null;
  duracao_estimada_min: number | null;
  prioridade: number;
  dia_planejado: string | null;
  ordem: number;
  estado: string;
  concluida_em: number | null;
  realizado_ms: number;
  activity_type_id: string | null;
  atividade: string | null;
  cor: string | null;
  cor_escura: string | null;
  icone: string | null;
};

type Modo = "dia" | "semana" | "atrasadas" | "sem_dia" | "concluidas";

const p2 = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;

function segundaDaSemana(d: Date) {
  const x = new Date(d);
  // getDay(): 0 = domingo. A semana de estudo começa na segunda.
  const desloc = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - desloc);
  x.setHours(0, 0, 0, 0);
  return x;
}

const rotuloDia = (s: string) => {
  const [a, m, d] = s.split("-").map(Number);
  return new Date(a, m - 1, d).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
  });
};

const PRIORIDADES = [
  { v: 0, nome: "normal" },
  { v: 1, nome: "alta" },
  { v: 2, nome: "urgente" },
];

export default function Planejamento({
  cursos,
  versao,
  tema,
  onErro,
  onMudou,
}: {
  cursos: Curso[];
  versao: number;
  tema: string;
  onErro: (e: string | null) => void;
  onMudou: () => void;
}) {
  const [modo, setModo] = useState<Modo>("dia");
  const [dia, setDia] = useState(() => new Date());
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [editando, setEditando] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [atrasadas, setAtrasadas] = useState(0);

  const [novoTitulo, setNovoTitulo] = useState("");
  const [novoCurso, setNovoCurso] = useState("");
  const [novaDur, setNovaDur] = useState("");
  const [novaPri, setNovaPri] = useState(0);
  const [novoTipo, setNovoTipo] = useState("");
  const [tipos, setTipos] = useState<Tipo[]>([]);

  const hojeIso = iso(new Date());
  const diaIso = iso(dia);

  const carregar = useCallback(() => {
    const args =
      modo === "semana"
        ? (() => {
            const s = segundaDaSemana(dia);
            const f = new Date(s);
            f.setDate(f.getDate() + 6);
            return { dia: iso(s), ate: iso(f), modo: "intervalo" };
          })()
        : modo === "atrasadas"
        ? { dia: hojeIso, ate: null, modo: "atrasadas" }
        : modo === "concluidas"
        ? { dia: null, ate: null, modo: "concluidas" }
        : modo === "sem_dia"
        ? { dia: null, ate: null, modo: "sem_dia" }
        : { dia: diaIso, ate: diaIso, modo: "intervalo" };

    invoke<Tarefa[]>("listar_tarefas", args)
      .then(setTarefas)
      .catch((e) => onErro(String(e)));
    invoke<Tipo[]>("listar_tipos").then(setTipos).catch(() => {});

    // O contador de atrasadas aparece na aba mesmo quando não estou nela —
    // tarefa vencida que fica invisível vira tarefa esquecida.
    invoke<Tarefa[]>("listar_tarefas", { dia: hojeIso, ate: null, modo: "atrasadas" })
      .then((t) => setAtrasadas(t.length))
      .catch(() => {});
  }, [modo, dia, diaIso, hojeIso, onErro]);

  // Zera a lista ao trocar de visão. Sem isto, entre o clique e a resposta a
  // tela mostra as tarefas da visão anterior sob o cabeçalho da nova — e o
  // aviso chega a dizer "4 tarefas de dias anteriores" listando as de hoje.
  // Piscar vazio é honesto; mostrar dado errado não é.
  useEffect(() => {
    setTarefas([]);
    setConfirmando(false);
  }, [modo]);

  useEffect(() => {
    carregar();
  }, [carregar, versao]);

  const criar = () => {
    invoke("criar_tarefa", {
      titulo: novoTitulo,
      cursoId: novoCurso || null,
      duracaoMin: novaDur.trim() ? Number(novaDur) : null,
      prioridade: novaPri,
      dia: modo === "sem_dia" ? null : diaIso,
      activityTypeId: novoTipo || null,
    })
      .then(() => {
        setNovoTitulo("");
        setNovaDur("");
        onErro(null);
        carregar();
      })
      .catch((e) => onErro(String(e)));
  };

  const acao = (cmd: string, args: Record<string, unknown>) =>
    invoke(cmd, args)
      .then(() => {
        onErro(null);
        carregar();
        onMudou();
      })
      .catch((e) => onErro(String(e)));

  const iniciar = (t: Tarefa) =>
    invoke("timer_start", {
      description: t.titulo,
      cursoId: t.course_id,
      tarefaId: t.id,
      // A tarefa carrega a categoria do bloco planejado: começar uma
      // caminhada pela lista do dia não deve virar tempo de estudo.
      activityTypeId: t.activity_type_id,
    })
      .then(() => {
        onErro(null);
        onMudou();
      })
      .catch((e) => onErro(String(e)));

  // --- reordenação por arrasto ------------------------------------------
  const arrastando = useRef<string | null>(null);

  const soltar = (alvo: Tarefa) => {
    const origem = arrastando.current;
    arrastando.current = null;
    if (!origem || origem === alvo.id) return;

    const lista = [...tarefas];
    const de = lista.findIndex((t) => t.id === origem);
    const para = lista.findIndex((t) => t.id === alvo.id);
    if (de < 0 || para < 0) return;

    const [movida] = lista.splice(de, 1);
    lista.splice(para, 0, movida);
    setTarefas(lista); // otimista: a lista responde antes do banco
    invoke("reordenar_tarefas", { ids: lista.map((t) => t.id) }).catch((e) =>
      onErro(String(e))
    );
  };

  const porDia = useMemo(() => {
    const m = new Map<string, Tarefa[]>();
    for (const t of tarefas) {
      const k = t.dia_planejado ?? "sem-data";
      m.set(k, [...(m.get(k) ?? []), t]);
    }
    return [...m.entries()];
  }, [tarefas]);

  const mudarDia = (delta: number) => {
    const d = new Date(dia);
    d.setDate(d.getDate() + (modo === "semana" ? delta * 7 : delta));
    setDia(d);
  };

  const abas: { id: Modo; nome: string; conta?: number }[] = [
    { id: "dia", nome: "Dia" },
    { id: "semana", nome: "Semana" },
    { id: "atrasadas", nome: "Atrasadas", conta: atrasadas },
    { id: "sem_dia", nome: "Sem data" },
    { id: "concluidas", nome: "Concluídas" },
  ];

  const mostraNav = modo === "dia" || modo === "semana";
  const totalEstimado = tarefas
    .filter((t) => t.estado === "aberta")
    .reduce((s, t) => s + (t.duracao_estimada_min ?? 0), 0);

  return (
    <>
      <h1 className="titulo-pagina">Planejamento</h1>
      <p className="legenda">
        A tarefa é o começo da sessão: dá para iniciar o cronômetro direto dela e
        comparar o que você planejou com o que realmente levou.
      </p>

      <div className="abas">
        {abas.map((a) => (
          <button
            key={a.id}
            className="aba"
            aria-current={modo === a.id ? "page" : undefined}
            onClick={() => setModo(a.id)}
          >
            {a.nome}
            {a.conta ? <span className="selo">{a.conta}</span> : null}
          </button>
        ))}
      </div>

      {mostraNav && (
        <div className="linha-nav">
          <div style={{ flex: 1 }}>
            <strong>
              {modo === "dia"
                ? diaIso === hojeIso
                  ? "Hoje"
                  : rotuloDia(diaIso)
                : `Semana de ${segundaDaSemana(dia).toLocaleDateString("pt-BR", {
                    day: "2-digit",
                    month: "long",
                  })}`}
            </strong>
            {totalEstimado > 0 && (
              <span className="nota" style={{ marginLeft: 10 }}>
                {durCurta(totalEstimado * 60000)} planejados
              </span>
            )}
          </div>
          <button className="btn btn-icone" onClick={() => mudarDia(-1)} aria-label="Anterior">
            <I.Seta />
          </button>
          <button className="btn" onClick={() => setDia(new Date())} disabled={diaIso === hojeIso}>
            Hoje
          </button>
          <button className="btn btn-icone" onClick={() => mudarDia(1)} aria-label="Próximo">
            <I.Seta dir="dir" />
          </button>
        </div>
      )}

      {modo === "atrasadas" && tarefas.length > 0 && (
        <div className="aviso aviso-atencao">
          <I.Alerta />
          <div style={{ flex: 1 }}>
            <strong>
              {tarefas.length} tarefa{tarefas.length > 1 ? "s" : ""} de dias anteriores
            </strong>
            <p>
              {confirmando
                ? "Todas passam para hoje. As datas originais ficam no histórico."
                : "Replanejar move todas para hoje de uma vez."}
            </p>
          </div>
          {confirmando ? (
            <>
              <button
                className="btn btn-primario"
                onClick={() =>
                  invoke<number>("replanejar_atrasadas", { hoje: hojeIso, para: hojeIso })
                    .then((n) => {
                      setConfirmando(false);
                      onErro(null);
                      carregar();
                      if (n === 0) onErro("nada para replanejar");
                    })
                    .catch((e) => onErro(String(e)))
                }
              >
                Confirmar
              </button>
              <button className="btn btn-fantasma" onClick={() => setConfirmando(false)}>
                Cancelar
              </button>
            </>
          ) : (
            <button className="btn" onClick={() => setConfirmando(true)}>
              Replanejar para hoje
            </button>
          )}
        </div>
      )}

      <section className="card">
        {tarefas.length === 0 ? (
          <div className="vazio">
            {modo === "atrasadas"
              ? "Nada atrasado. "
              : modo === "concluidas"
              ? "Nenhuma tarefa concluída ainda."
              : "Nenhuma tarefa aqui."}
            {modo === "atrasadas" && <br />}
            {modo === "atrasadas" && "Dia em que não se planeja nada não é falha."}
          </div>
        ) : modo === "semana" ? (
          porDia.map(([d, lista]) => (
            <div key={d} style={{ marginBottom: 18 }}>
              <div className="grupo-dia">
                {rotuloDia(d)}
                {d === hojeIso && <span className="selo selo-hoje">hoje</span>}
              </div>
              {lista.map((t) => (
                <Linha
                  key={t.id}
                  t={t}
                  cursos={cursos}
                  tipos={tipos}
                  tema={tema}
                  editando={editando === t.id}
                  setEditando={setEditando}
                  acao={acao}
                  iniciar={iniciar}
                  onErro={onErro}
                  hojeIso={hojeIso}
                />
              ))}
            </div>
          ))
        ) : (
          tarefas.map((t) => (
            <Linha
              key={t.id}
              t={t}
              cursos={cursos}
              tipos={tipos}
              tema={tema}
              editando={editando === t.id}
              setEditando={setEditando}
              acao={acao}
              iniciar={iniciar}
              onErro={onErro}
              hojeIso={hojeIso}
              arrastavel={modo === "dia" || modo === "sem_dia"}
              onArrastar={() => (arrastando.current = t.id)}
              onSoltar={() => soltar(t)}
            />
          ))
        )}
      </section>

      {modo !== "concluidas" && modo !== "atrasadas" && (
        <section className="card">
          <h2>Nova tarefa</h2>
          <div className="grade">
            <div className="campo cresce">
              <label htmlFor="nt">O que fazer</label>
              <input
                id="nt"
                value={novoTitulo}
                onChange={(e) => setNovoTitulo(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && criar()}
                placeholder="Assistir aula 13 e fazer os exercícios"
              />
            </div>
            <div className="campo" style={{ width: 170 }}>
              <label htmlFor="nc">Curso</label>
              <select id="nc" value={novoCurso} onChange={(e) => setNovoCurso(e.target.value)}>
                <option value="">— nenhum —</option>
                {cursos.map((c) => (
                  <option key={c.id} value={c.id}>{c.titulo}</option>
                ))}
              </select>
            </div>
            <div className="campo" style={{ width: 96 }}>
              <label htmlFor="nd">Minutos</label>
              <input
                id="nd"
                type="number"
                min={0}
                value={novaDur}
                onChange={(e) => setNovaDur(e.target.value)}
                placeholder="60"
              />
            </div>
            <div className="campo" style={{ width: 140 }}>
              <label htmlFor="ncat">Categoria</label>
              <select id="ncat" value={novoTipo} onChange={(e) => setNovoTipo(e.target.value)}>
                <option value="">estudo</option>
                {tipos.map((x) => (
                  <option key={x.id} value={x.id}>{x.nome}</option>
                ))}
              </select>
            </div>
            <div className="campo" style={{ width: 110 }}>
              <label htmlFor="np">Prioridade</label>
              <select id="np" value={novaPri} onChange={(e) => setNovaPri(Number(e.target.value))}>
                {PRIORIDADES.map((p) => (
                  <option key={p.v} value={p.v}>{p.nome}</option>
                ))}
              </select>
            </div>
            <button className="btn btn-primario" onClick={criar}>
              <I.Mais /> Adicionar
            </button>
          </div>
          <p className="nota">
            Só o título é obrigatório. Estimativa serve para comparar com o
            realizado, não para cobrar você. A categoria deixa o dia misturar
            estudo, exercício e descanso na mesma lista.
          </p>
        </section>
      )}
    </>
  );
}

function Linha({
  t, cursos, tipos, tema, editando, setEditando, acao, iniciar, onErro, hojeIso,
  arrastavel, onArrastar, onSoltar,
}: {
  t: Tarefa;
  cursos: Curso[];
  tipos: Tipo[];
  tema: string;
  editando: boolean;
  setEditando: (id: string | null) => void;
  acao: (cmd: string, args: Record<string, unknown>) => Promise<unknown>;
  iniciar: (t: Tarefa) => void;
  onErro: (e: string | null) => void;
  hojeIso: string;
  arrastavel?: boolean;
  onArrastar?: () => void;
  onSoltar?: () => void;
}) {
  const [titulo, setTitulo] = useState(t.titulo);
  const [curso, setCurso] = useState(t.course_id ?? "");
  const [dur, setDur] = useState(String(t.duracao_estimada_min ?? ""));
  const [pri, setPri] = useState(t.prioridade);
  const [tipo, setTipo] = useState(t.activity_type_id ?? "");

  const concluida = t.estado === "concluida";
  const estimado = (t.duracao_estimada_min ?? 0) * 60000;
  const pct = estimado > 0 ? Math.min((t.realizado_ms / estimado) * 100, 100) : 0;

  if (editando) {
    return (
      <div
        className="editor"
        onKeyDown={(e) => {
          if (e.key === "Escape") setEditando(null);
        }}
      >
        <div className="grade">
          <div className="campo cresce">
            <label>Título</label>
            <input value={titulo} onChange={(e) => setTitulo(e.target.value)} autoFocus />
          </div>
          <div className="campo" style={{ width: 160 }}>
            <label>Curso</label>
            <select value={curso} onChange={(e) => setCurso(e.target.value)}>
              <option value="">— nenhum —</option>
              {cursos.map((c) => (
                <option key={c.id} value={c.id}>{c.titulo}</option>
              ))}
            </select>
          </div>
          <div className="campo" style={{ width: 90 }}>
            <label>Minutos</label>
            <input type="number" min={0} value={dur} onChange={(e) => setDur(e.target.value)} />
          </div>
          <div className="campo" style={{ width: 108 }}>
            <label>Prioridade</label>
            <select value={pri} onChange={(e) => setPri(Number(e.target.value))}>
              {PRIORIDADES.map((p) => (
                <option key={p.v} value={p.v}>{p.nome}</option>
              ))}
            </select>
          </div>
          <div className="campo" style={{ width: 140 }}>
            <label>Categoria</label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option value="">estudo</option>
              {tipos.map((x) => (
                <option key={x.id} value={x.id}>{x.nome}</option>
              ))}
            </select>
          </div>
          <button
            className="btn btn-primario"
            onClick={() =>
              acao("editar_tarefa", {
                id: t.id,
                titulo,
                cursoId: curso || null,
                duracaoMin: dur.trim() ? Number(dur) : null,
                prioridade: pri,
                activityTypeId: tipo || null,
              }).then(() => setEditando(null))
            }
          >
            Salvar
          </button>
          <button className="btn btn-fantasma" onClick={() => setEditando(null)}>
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`lanc tarefa${concluida ? " feita" : ""}`}
      draggable={arrastavel}
      onDragStart={onArrastar}
      onDragOver={(e) => arrastavel && e.preventDefault()}
      onDrop={onSoltar}
    >
      <input
        type="checkbox"
        checked={concluida}
        onChange={() =>
          acao("mudar_estado_tarefa", {
            id: t.id,
            estado: concluida ? "aberta" : "concluida",
          })
        }
        aria-label={concluida ? "Reabrir tarefa" : "Concluir tarefa"}
        style={{ width: 16, height: 16, flex: "none", accentColor: "var(--acc)" }}
      />

      {t.prioridade > 0 && (
        <span
          className="pri"
          title={t.prioridade === 2 ? "urgente" : "alta"}
          style={{ background: t.prioridade === 2 ? "var(--danger)" : "var(--warn)" }}
        />
      )}

      {/* Só as tarefas com categoria própria ganham marca. Estudo é o padrão,
          e marcar o padrão em toda linha viraria ruído. */}
      {t.activity_type_id && (
        <span
          style={{
            color: corDe({ cor: t.cor ?? "", cor_escura: t.cor_escura }, tema),
            display: "flex",
            flex: "none",
          }}
          title={t.atividade ?? ""}
        >
          <I.IconeCategoria nome={t.icone} size={14} />
        </span>
      )}

      <span className="lanc-texto">
        {t.titulo}
        {t.curso && <span className="lanc-curso"> · {t.curso}</span>}
      </span>

      {estimado > 0 && (
        <span className="progresso" title={`${durCurta(t.realizado_ms)} de ${durCurta(estimado)}`}>
          <span
            className="progresso-barra"
            style={{
              width: `${pct}%`,
              background: t.realizado_ms > estimado ? "var(--warn)" : "var(--acc)",
            }}
          />
        </span>
      )}

      <span className="lanc-dur num" style={{ minWidth: 96 }}>
        {t.realizado_ms > 0 ? durCurta(t.realizado_ms) : "—"}
        {estimado > 0 && (
          <span style={{ color: "var(--tx-3)", fontWeight: 400 }}>
            {" "}/ {durCurta(estimado)}
          </span>
        )}
      </span>

      <span className="lanc-acoes">
        {!concluida && (
          <button
            className="btn btn-fantasma btn-icone"
            onClick={() => iniciar(t)}
            aria-label="Iniciar cronômetro nesta tarefa"
            title="Iniciar cronômetro"
          >
            <I.Play />
          </button>
        )}
        {!concluida && t.dia_planejado !== hojeIso && (
          <button
            className="btn btn-fantasma"
            onClick={() => acao("mover_tarefa", { id: t.id, dia: hojeIso })}
            title="Trazer para hoje"
          >
            Hoje
          </button>
        )}
        <button
          className="btn btn-fantasma btn-icone"
          onClick={() => setEditando(t.id)}
          aria-label="Editar tarefa"
        >
          <I.Lapis />
        </button>
        <button
          className="btn btn-fantasma btn-icone btn-perigo"
          onClick={() =>
            acao("excluir_tarefa", { id: t.id }).catch((e) => onErro(String(e)))
          }
          aria-label="Excluir tarefa"
        >
          <I.Lixeira />
        </button>
      </span>
    </div>
  );
}
