import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Curso, durCurta } from "./App";
import { Tipo, corDe } from "./tempo-comum";
import { useCompacto } from "./dispositivo";
import Modal from "./Modal";
import Menu from "./Menu";
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

/** O que o formulário está fazendo. Nulo é fechado. */
type Form = { modo: "nova" } | { modo: "editar"; t: Tarefa } | null;

/**
 * As três etapas do dia. Não existem no banco: saem do estado da tarefa e do
 * tempo lançado nela. "Em andamento" é a tarefa que já tem tempo, ou a que o
 * cronômetro está contando agora.
 */
type Etapa = "fazer" | "andamento" | "feito";

const ETAPAS: { id: Etapa; nome: string; dica: string }[] = [
  { id: "fazer", nome: "A fazer", dica: "Nada esperando." },
  { id: "andamento", nome: "Em andamento", dica: "Solte uma tarefa aqui para começar a contar." },
  { id: "feito", nome: "Concluído", dica: "Solte aqui para dar por feito." },
];

function etapaDe(t: Tarefa, rodando: string | null): Etapa {
  if (t.estado === "concluida") return "feito";
  if (t.realizado_ms > 0 || t.id === rodando) return "andamento";
  return "fazer";
}

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
  tarefaRodando,
  onErro,
  onMudou,
}: {
  cursos: Curso[];
  versao: number;
  tema: string;
  /** Tarefa que o cronômetro está contando agora, se houver. */
  tarefaRodando: string | null;
  onErro: (e: string | null) => void;
  onMudou: () => void;
}) {
  const [modo, setModo] = useState<Modo>("dia");
  const [dia, setDia] = useState(() => new Date());
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [form, setForm] = useState<Form>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [atrasadas, setAtrasadas] = useState(0);
  const [tipos, setTipos] = useState<Tipo[]>([]);
  // Arrastar com o dedo briga com rolar a lista: numa tela estreita o quadro
  // vira uma coluna só e a ordem se muda pelo menu.
  const compacto = useCompacto();

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
  // tela mostra as tarefas da visão anterior sob o cabeçalho da nova.
  useEffect(() => {
    setTarefas([]);
    setConfirmando(false);
  }, [modo]);

  useEffect(() => {
    carregar();
  }, [carregar, versao]);

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

  const concluir = (t: Tarefa) =>
    acao("mudar_estado_tarefa", {
      id: t.id,
      estado: t.estado === "concluida" ? "aberta" : "concluida",
    });

  // --- arrasto entre etapas e dentro delas ---------------------------------
  const arrastando = useRef<string | null>(null);
  const [alvo, setAlvo] = useState<Etapa | null>(null);

  const porEtapa = useMemo(() => {
    const m: Record<Etapa, Tarefa[]> = { fazer: [], andamento: [], feito: [] };
    for (const t of tarefas) m[etapaDe(t, tarefaRodando)].push(t);
    return m;
  }, [tarefas, tarefaRodando]);

  /** Se faz sentido soltar uma tarefa numa etapa. Voltar de "em andamento"
   *  para "a fazer" não existe: tempo lançado não se desfaz arrastando. */
  const podeSoltar = (t: Tarefa, destino: Etapa) => {
    const origem = etapaDe(t, tarefaRodando);
    if (origem === destino) return true;
    if (destino === "fazer") return origem === "feito" && t.realizado_ms === 0;
    return true;
  };

  const soltarEm = (destino: Etapa, antesDe?: Tarefa) => {
    const id = arrastando.current;
    arrastando.current = null;
    setAlvo(null);
    if (!id) return;
    const t = tarefas.find((x) => x.id === id);
    if (!t || !podeSoltar(t, destino)) return;
    const origem = etapaDe(t, tarefaRodando);

    if (origem !== destino) {
      if (destino === "feito") return concluir(t);
      if (origem === "feito") {
        // Reabrir; se ela já tinha tempo, cai sozinha em "em andamento".
        return acao("mudar_estado_tarefa", { id: t.id, estado: "aberta" });
      }
      // De "a fazer" para "em andamento": é o gesto de começar.
      return iniciar(t);
    }

    // Mesma etapa: reordenar. A ordem gravada é uma só para o dia inteiro,
    // então as três colunas são concatenadas na ordem das etapas.
    const coluna = porEtapa[destino].filter((x) => x.id !== id);
    const pos = antesDe ? coluna.findIndex((x) => x.id === antesDe.id) : coluna.length;
    coluna.splice(pos < 0 ? coluna.length : pos, 0, t);
    const ordem = ETAPAS.flatMap((e) => (e.id === destino ? coluna : porEtapa[e.id]));
    setTarefas(ordem); // otimista: o quadro responde antes do banco
    invoke("reordenar_tarefas", { ids: ordem.map((x) => x.id) }).catch((e) =>
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
  const abertas = tarefas.filter((t) => t.estado === "aberta");
  const totalEstimado = abertas.reduce((s, t) => s + (t.duracao_estimada_min ?? 0), 0);
  const totalFeito = tarefas.reduce((s, t) => s + t.realizado_ms, 0);

  const cartao = (t: Tarefa, arrastavel: boolean) => (
    <Cartao
      key={t.id}
      t={t}
      tema={tema}
      rodando={t.id === tarefaRodando}
      foraDeHoje={t.dia_planejado !== hojeIso}
      arrastavel={arrastavel}
      onPlay={() => iniciar(t)}
      onConcluir={() => concluir(t)}
      onEditar={() => setForm({ modo: "editar", t })}
      onExcluir={() => acao("excluir_tarefa", { id: t.id })}
      onHoje={() => acao("mover_tarefa", { id: t.id, dia: hojeIso })}
      onArrastar={() => (arrastando.current = t.id)}
      onFimArrasto={() => {
        arrastando.current = null;
        setAlvo(null);
      }}
      onSoltarSobre={() => soltarEm(etapaDe(t, tarefaRodando), t)}
    />
  );

  return (
    <>
      <div className="pagina-cab">
        <div>
          <h1 className="titulo-pagina">Planejamento</h1>
          <p className="legenda">
            {modo === "dia"
              ? "O dia em três etapas. A tarefa é o começo da sessão: o play já liga o cronômetro nela."
              : "A tarefa é o começo da sessão: o play já liga o cronômetro nela."}
          </p>
        </div>
        <div className="pagina-acoes">
          <button className="btn btn-primario" onClick={() => setForm({ modo: "nova" })}>
            <I.Mais /> Nova tarefa
          </button>
        </div>
      </div>

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
            {(totalEstimado > 0 || totalFeito > 0) && (
              <span className="nota" style={{ marginLeft: 10 }}>
                {totalFeito > 0 && <>{durCurta(totalFeito)} feitos</>}
                {totalFeito > 0 && totalEstimado > 0 && " · "}
                {totalEstimado > 0 && <>{durCurta(totalEstimado * 60000)} por fazer</>}
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

      {modo === "dia" ? (
        <div className="quadro">
          {ETAPAS.map((e) => {
            const lista = porEtapa[e.id];
            const ativo = alvo === e.id;
            return (
              <section
                key={e.id}
                className={`etapa etapa-${e.id}${ativo ? " etapa-alvo" : ""}`}
                onDragOver={(ev) => {
                  const id = arrastando.current;
                  const t = id ? tarefas.find((x) => x.id === id) : null;
                  if (!t || !podeSoltar(t, e.id)) return;
                  ev.preventDefault();
                  if (alvo !== e.id) setAlvo(e.id);
                }}
                onDragLeave={(ev) => {
                  if (!ev.currentTarget.contains(ev.relatedTarget as Node)) setAlvo(null);
                }}
                onDrop={(ev) => {
                  ev.preventDefault();
                  soltarEm(e.id);
                }}
              >
                <header className="etapa-cab">
                  {e.id === "andamento" && <span className="pulso" />}
                  {e.id === "feito" && <I.Check size={14} />}
                  {e.nome}
                  <span className="etapa-conta num">{lista.length}</span>
                </header>
                <div className="etapa-lista">
                  {lista.length === 0 ? (
                    <div className="etapa-vazia">{e.dica}</div>
                  ) : (
                    lista.map((t) => cartao(t, !compacto))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      ) : tarefas.length === 0 ? (
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
          <div key={d} style={{ marginBottom: 22 }}>
            <div className="grupo-dia">
              {rotuloDia(d)}
              {d === hojeIso && <span className="selo selo-hoje">hoje</span>}
            </div>
            <div className="cartoes">{lista.map((t) => cartao(t, false))}</div>
          </div>
        ))
      ) : (
        <div className="cartoes">{tarefas.map((t) => cartao(t, false))}</div>
      )}

      <FormTarefa
        key={form ? (form.modo === "editar" ? form.t.id : "nova") : "fechado"}
        form={form}
        cursos={cursos}
        tipos={tipos}
        dia={modo === "sem_dia" ? null : diaIso}
        onFechar={() => setForm(null)}
        onSalvo={() => {
          setForm(null);
          carregar();
          onMudou();
        }}
        onErro={onErro}
      />
    </>
  );
}

/** Uma tarefa como cartão. Mostra e comanda; editar acontece no formulário. */
function Cartao({
  t, tema, rodando, foraDeHoje, arrastavel,
  onPlay, onConcluir, onEditar, onExcluir, onHoje,
  onArrastar, onFimArrasto, onSoltarSobre,
}: {
  t: Tarefa;
  tema: string;
  rodando: boolean;
  foraDeHoje: boolean;
  arrastavel: boolean;
  onPlay: () => void;
  onConcluir: () => void;
  onEditar: () => void;
  onExcluir: () => void;
  onHoje: () => void;
  onArrastar: () => void;
  onFimArrasto: () => void;
  onSoltarSobre: () => void;
}) {
  const feita = t.estado === "concluida";
  const estimado = (t.duracao_estimada_min ?? 0) * 60000;
  const pct = estimado > 0 ? Math.min((t.realizado_ms / estimado) * 100, 100) : 0;
  const cor = corDe({ cor: t.cor ?? "", cor_escura: t.cor_escura }, tema);

  return (
    <article
      className={`tarefa-card${feita ? " feita" : ""}${rodando ? " rodando" : ""}`}
      draggable={arrastavel}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onArrastar();
      }}
      onDragEnd={onFimArrasto}
      onDragOver={(e) => arrastavel && e.preventDefault()}
      onDrop={(e) => {
        if (!arrastavel) return;
        e.preventDefault();
        e.stopPropagation();
        onSoltarSobre();
      }}
    >
      <div className="tarefa-topo">
        {t.activity_type_id && (
          <span style={{ color: cor, display: "flex" }} title={t.atividade ?? ""}>
            <I.IconeCategoria nome={t.icone} size={14} />
          </span>
        )}
        <span className="tarefa-curso">{t.curso ?? t.atividade ?? "Estudo"}</span>
        {t.prioridade > 0 && (
          <span className={`pill ${t.prioridade === 2 ? "pill-danger" : "pill-warn"}`}>
            {t.prioridade === 2 ? "urgente" : "alta"}
          </span>
        )}
        <span className="lanc-acoes">
          <Menu
            itens={[
              { rotulo: "Editar", icone: <I.Lapis />, onClick: onEditar },
              ...(foraDeHoje && !feita
                ? [{ rotulo: "Trazer para hoje", icone: <I.Calendario />, onClick: onHoje }]
                : []),
              {
                rotulo: feita ? "Reabrir" : "Concluir",
                icone: <I.Check />,
                onClick: onConcluir,
              },
              { rotulo: "Excluir", icone: <I.Lixeira />, perigo: true, onClick: onExcluir },
            ]}
          />
        </span>
      </div>

      <div className="tarefa-titulo">{t.titulo}</div>

      {estimado > 0 && (
        <div className="tarefa-barra" aria-hidden>
          <span
            style={{
              width: `${pct}%`,
              background: t.realizado_ms > estimado ? "var(--warn)" : "var(--acc)",
            }}
          />
        </div>
      )}

      <div className="tarefa-pe">
        <button
          className={`tarefa-check${feita ? " feita" : ""}`}
          onClick={onConcluir}
          aria-label={feita ? "Reabrir tarefa" : "Concluir tarefa"}
          title={feita ? "Reabrir" : "Concluir"}
        >
          <I.Check size={13} />
        </button>
        <span className="tarefa-tempo num">
          {t.realizado_ms > 0 ? <b>{durCurta(t.realizado_ms)}</b> : feita ? "feita" : "—"}
          {estimado > 0 && <span> / {durCurta(estimado)}</span>}
        </span>
        {rodando ? (
          <span className="tarefa-rodando">
            <span className="pulso" /> contando
          </span>
        ) : (
          !feita && (
            <button
              className="tarefa-play"
              onClick={onPlay}
              aria-label="Iniciar cronômetro nesta tarefa"
              title="Iniciar cronômetro"
            >
              <I.Play size={15} />
            </button>
          )
        )}
      </div>
    </article>
  );
}

/** Nova tarefa e edição no mesmo formulário: os campos são os mesmos. */
function FormTarefa({
  form, cursos, tipos, dia, onFechar, onSalvo, onErro,
}: {
  form: Form;
  cursos: Curso[];
  tipos: Tipo[];
  /** Dia da nova tarefa; nulo cria sem data. */
  dia: string | null;
  onFechar: () => void;
  onSalvo: () => void;
  onErro: (e: string | null) => void;
}) {
  const t = form?.modo === "editar" ? form.t : null;
  const [titulo, setTitulo] = useState(t?.titulo ?? "");
  const [curso, setCurso] = useState(t?.course_id ?? "");
  const [dur, setDur] = useState(t?.duracao_estimada_min ? String(t.duracao_estimada_min) : "");
  const [pri, setPri] = useState(t?.prioridade ?? 0);
  const [tipo, setTipo] = useState(t?.activity_type_id ?? "");

  const salvar = () => {
    if (!titulo.trim()) return onErro("a tarefa precisa de um título");
    const comum = {
      titulo,
      cursoId: curso || null,
      duracaoMin: dur.trim() ? Number(dur) : null,
      prioridade: pri,
      activityTypeId: tipo || null,
    };
    const p = t
      ? invoke("editar_tarefa", { id: t.id, ...comum })
      : invoke("criar_tarefa", { ...comum, dia });
    p.then(() => {
      onErro(null);
      onSalvo();
    }).catch((e) => onErro(String(e)));
  };

  return (
    <Modal
      titulo={t ? "Editar tarefa" : "Nova tarefa"}
      aberto={!!form}
      onFechar={onFechar}
      pe={
        <>
          <button className="btn btn-fantasma" onClick={onFechar}>Cancelar</button>
          <button className="btn btn-primario" onClick={salvar}>
            {t ? "Salvar" : "Adicionar"}
          </button>
        </>
      }
    >
      <div className="campos" onKeyDown={(e) => e.key === "Enter" && salvar()}>
        <div className="campo campo-largo">
          <label htmlFor="ft-titulo">O que fazer</label>
          <input
            id="ft-titulo"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Assistir aula 13 e fazer os exercícios"
          />
        </div>
        <div className="campo">
          <label htmlFor="ft-curso">Curso</label>
          <select id="ft-curso" value={curso} onChange={(e) => setCurso(e.target.value)}>
            <option value="">— nenhum —</option>
            {cursos.map((c) => (
              <option key={c.id} value={c.id}>{c.titulo}</option>
            ))}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="ft-tipo">Categoria</label>
          <select id="ft-tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="">estudo</option>
            {tipos.map((x) => (
              <option key={x.id} value={x.id}>{x.nome}</option>
            ))}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="ft-min">Minutos previstos</label>
          <input
            id="ft-min"
            type="number"
            min={0}
            value={dur}
            onChange={(e) => setDur(e.target.value)}
            placeholder="60"
          />
        </div>
        <div className="campo">
          <label htmlFor="ft-pri">Prioridade</label>
          <select id="ft-pri" value={pri} onChange={(e) => setPri(Number(e.target.value))}>
            {PRIORIDADES.map((p) => (
              <option key={p.v} value={p.v}>{p.nome}</option>
            ))}
          </select>
        </div>
      </div>
      <p className="nota">
        Só o título é obrigatório. A estimativa serve para comparar com o
        realizado, não para cobrar você.
      </p>
    </Modal>
  );
}
