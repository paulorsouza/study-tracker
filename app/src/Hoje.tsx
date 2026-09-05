import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Curso, durCurta } from "./App";
import { Lancamento, Tipo, corDe, hhmm } from "./tempo-comum";
import { Materia } from "./Materias";
import { useCompacto } from "./dispositivo";
import LancamentoCard from "./LancamentoCard";
import Modal from "./Modal";
import Menu from "./Menu";
import * as I from "./icones";

function comHora(dia: Date, hm: string) {
  const [h, m] = hm.split(":").map(Number);
  const d = new Date(dia);
  d.setHours(h || 0, m || 0, 0, 0);
  return d.getTime();
}

function limitesDoDia(dia: Date) {
  const ini = new Date(dia);
  ini.setHours(0, 0, 0, 0);
  const fim = new Date(ini);
  fim.setDate(fim.getDate() + 1);
  return [ini.getTime(), fim.getTime()] as const;
}

const agoraHhmm = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/** O que o formulário está fazendo. Nulo é fechado. */
type Form = { modo: "novo" } | { modo: "editar"; item: Lancamento } | null;

export default function Hoje({
  cursos,
  versao,
  tema,
  diaInicial,
  onErro,
  onMudou,
}: {
  cursos: Curso[];
  versao: number;
  tema: string;
  /** Dia vindo de outra visão — a folha da semana abre o dia clicado aqui. */
  diaInicial?: Date | null;
  onErro: (e: string | null) => void;
  onMudou: () => void;
}) {
  const [dia, setDia] = useState(() => diaInicial ?? new Date());

  useEffect(() => {
    if (diaInicial) setDia(diaInicial);
  }, [diaInicial]);
  const [itens, setItens] = useState<Lancamento[]>([]);
  // Unir é um modo, não uma coluna de caixas: as caixas só aparecem quando o
  // usuário diz que vai unir. Fora disso a lista é só a lista.
  const [selecionando, setSelecionando] = useState(false);
  const [selecao, setSelecao] = useState<string[]>([]);
  // Dividir e unir são correções finas: escolher o minuto do corte e marcar
  // várias linhas pede precisão que o dedo não tem.
  const compacto = useCompacto();
  const [cortando, setCortando] = useState<string | null>(null);
  const [corte, setCorte] = useState("");
  const [tipos, setTipos] = useState<Tipo[]>([]);
  const [form, setForm] = useState<Form>(null);
  const [desfazer, setDesfazer] = useState<string | null>(null);

  const [ini, fim] = useMemo(() => limitesDoDia(dia), [dia]);

  const recarregar = useCallback(() => {
    invoke<Lancamento[]>("listar_periodo", { inicio: ini, fim })
      .then(setItens)
      .catch(() => {});
  }, [ini, fim]);

  useEffect(() => {
    invoke<Tipo[]>("listar_tipos").then(setTipos).catch(() => {});
  }, []);

  useEffect(() => {
    recarregar();
    const t = setInterval(recarregar, 5000);
    return () => clearInterval(t);
  }, [recarregar, versao]);

  const totais = useMemo(() => {
    let total = 0;
    let estudo = 0;
    const por = new Map<string, { nome: string; cor: string; ms: number }>();
    for (const i of itens) {
      const d = (i.ended_at ?? Date.now()) - i.started_at;
      total += d;
      if (i.conta_como_estudo) estudo += d;
      const at = por.get(i.activity_type_id) ?? { nome: i.atividade, cor: corDe(i, tema), ms: 0 };
      at.ms += d;
      por.set(i.activity_type_id, at);
    }
    return {
      total,
      estudo,
      por: [...por.values()].sort((a, b) => b.ms - a.ms),
    };
  }, [itens, tema]);

  const ehHoje = new Date().toDateString() === dia.toDateString();
  const DIA_MS = 86_400_000;

  const mudarDia = (delta: number) => {
    const d = new Date(dia);
    d.setDate(d.getDate() + delta);
    setDia(d);
    setForm(null);
    setSelecionando(false);
    setSelecao([]);
  };

  const acao = (cmd: string, args: Record<string, unknown>) =>
    invoke(cmd, args)
      .then(() => {
        onErro(null);
        setSelecao([]);
        setSelecionando(false);
        recarregar();
        onMudou();
      })
      .catch((e) => onErro(String(e)));

  /// Abre o corte no próprio cartão, com o meio só como sugestão.
  ///
  /// Cortar no meio automaticamente seria quase sempre errado: quem divide sabe
  /// a hora em que a sessão mudou de assunto, e é essa hora que importa.
  const abrirCorte = (i: Lancamento) => {
    setCortando(i.id);
    setCorte(hhmm(i.started_at + ((i.ended_at ?? Date.now()) - i.started_at) / 2));
  };

  const confirmarCorte = (id: string) => {
    if (!/^\d{1,2}:\d{2}$/.test(corte.trim())) {
      onErro(`não entendi a hora “${corte}”. Use HH:MM`);
      return;
    }
    acao("dividir_lancamento", { id, em: comHora(dia, corte.trim()) }).then(() =>
      setCortando(null)
    );
  };

  const excluir = (id: string) =>
    invoke("excluir_lancamento", { id })
      .then(() => {
        setDesfazer(id);
        onErro(null);
        recarregar();
      })
      .catch((e) => onErro(String(e)));

  return (
    <>
      <div className="pagina-cab">
        <div>
          <h1 className="titulo-pagina">
            {ehHoje
              ? "Hoje"
              : dia.toLocaleDateString("pt-BR", {
                  weekday: "long",
                  day: "2-digit",
                  month: "long",
                })}
          </h1>
          <p className="legenda">{dia.toLocaleDateString("pt-BR", { dateStyle: "full" })}</p>
        </div>
        <div className="pagina-acoes">
          <button className="btn btn-icone" onClick={() => mudarDia(-1)} aria-label="Dia anterior">
            <I.Seta />
          </button>
          <button className="btn" onClick={() => setDia(new Date())} disabled={ehHoje}>
            Hoje
          </button>
          <button className="btn btn-icone" onClick={() => mudarDia(1)} aria-label="Próximo dia">
            <I.Seta dir="dir" />
          </button>
          <button className="btn btn-primario" onClick={() => setForm({ modo: "novo" })}>
            <I.Mais /> Lançar
          </button>
        </div>
      </div>

      {desfazer && (
        <div className="aviso">
          <div style={{ flex: 1 }}>
            <strong>Lançamento excluído</strong>
            <p>Ele continua no banco — nada foi perdido de verdade.</p>
          </div>
          <button
            className="btn"
            onClick={() =>
              invoke("restaurar_lancamento", { id: desfazer })
                .then(() => {
                  setDesfazer(null);
                  recarregar();
                })
                .catch((e) => onErro(String(e)))
            }
          >
            Desfazer
          </button>
          <button className="btn btn-fantasma" onClick={() => setDesfazer(null)}>
            Dispensar
          </button>
        </div>
      )}

      <section className="card resumo-dia">
        <div className="resumo-numeros">
          <div className="resumo-tile">
            <div className="total-valor tile-destaque">{durCurta(totais.estudo)}</div>
            <div className="total-rotulo">estudo efetivo</div>
          </div>
          <div className="resumo-tile">
            <div className="total-valor">{durCurta(totais.total)}</div>
            <div className="total-rotulo">registrado no dia</div>
          </div>
          <div className="resumo-chips">
            {totais.por.map((a) => (
              <span key={a.nome} className="chip">
                <span className="chip-cor" style={{ background: a.cor }} />
                {a.nome} · <span className="num">{durCurta(a.ms)}</span>
              </span>
            ))}
          </div>
        </div>

        {/* Linha do tempo: mostra os buracos do dia, que a lista não mostra. */}
        <div className="faixa">
          {itens.map((i) => {
            const a = Math.max(i.started_at, ini);
            const b = Math.min(i.ended_at ?? Date.now(), fim);
            return (
              <div
                key={i.id}
                className="faixa-bloco"
                title={`${hhmm(i.started_at)} · ${i.description || i.atividade}`}
                style={{
                  left: `${((a - ini) / DIA_MS) * 100}%`,
                  width: `${Math.max(((b - a) / DIA_MS) * 100, 0.4)}%`,
                  background: corDe(i, tema),
                }}
              />
            );
          })}
          {ehHoje && (
            <div
              className="faixa-agora"
              style={{ left: `${((Date.now() - ini) / DIA_MS) * 100}%` }}
              title="agora"
            />
          )}
        </div>
        <div className="faixa-horas" aria-hidden>
          <span>00h</span><span>06h</span><span>12h</span><span>18h</span><span>24h</span>
        </div>
      </section>

      {itens.length === 0 ? (
        <div className="vazio">
          Nada registrado neste dia.
          <br />
          Use o cronômetro na lateral, a extensão do Chrome, ou o botão Lançar.
        </div>
      ) : (
        <>
          <div className="secao-cab">
            <h2>Lançamentos</h2>
            {!compacto && itens.some((i) => i.ended_at) && (
              <button
                className={`btn btn-fantasma btn-pequeno${selecionando ? " ativo" : ""}`}
                onClick={() => {
                  setSelecionando((v) => !v);
                  setSelecao([]);
                }}
                aria-pressed={selecionando}
                title="Escolher lançamentos seguidos para unir num só"
              >
                <I.Juntar size={14} /> {selecionando ? "Cancelar" : "Unir"}
              </button>
            )}
          </div>

          <div className="linha-tempo">
            {itens.map((i) => (
              <LancamentoCard
                key={i.id}
                l={i}
                tema={tema}
                selecionavel={selecionando}
                selecionado={selecao.includes(i.id)}
                onSelecionar={(v) =>
                  setSelecao((s) => (v ? [...s, i.id] : s.filter((x) => x !== i.id)))
                }
                acoes={
                  <>
                    <button
                      className="btn btn-fantasma btn-icone"
                      onClick={() => acao("timer_continuar", { entryId: i.id })}
                      aria-label="Continuar este lançamento agora"
                      title="Continuar agora"
                    >
                      <I.Play size={14} />
                    </button>
                    <Menu
                      itens={[
                        {
                          rotulo: "Editar",
                          icone: <I.Lapis />,
                          desativado: !i.ended_at,
                          onClick: () => setForm({ modo: "editar", item: i }),
                        },
                        ...(compacto
                          ? []
                          : [
                              {
                                rotulo: "Duplicar",
                                icone: <I.Copia />,
                                desativado: !i.ended_at,
                                onClick: () => acao("duplicar_lancamento", { id: i.id }),
                              },
                              {
                                rotulo: "Dividir em dois",
                                icone: <I.Tesoura />,
                                desativado: !i.ended_at,
                                onClick: () => abrirCorte(i),
                              },
                            ]),
                        {
                          rotulo: "Excluir",
                          icone: <I.Lixeira />,
                          perigo: true,
                          desativado: !i.ended_at,
                          onClick: () => excluir(i.id),
                        },
                      ]}
                    />
                  </>
                }
                rodape={
                  cortando === i.id ? (
                    <div className="lanc-corte">
                      <label htmlFor={`corte-${i.id}`}>cortar às</label>
                      <input
                        id={`corte-${i.id}`}
                        value={corte}
                        onChange={(e) => setCorte(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && confirmarCorte(i.id)}
                        placeholder="HH:MM"
                        autoFocus
                      />
                      <button className="btn btn-primario btn-pequeno" onClick={() => confirmarCorte(i.id)}>
                        Cortar
                      </button>
                      <button className="btn btn-fantasma btn-pequeno" onClick={() => setCortando(null)}>
                        Cancelar
                      </button>
                    </div>
                  ) : null
                }
              />
            ))}
          </div>

          {selecionando && (
            <div className="barra-flutuante" role="status">
              <span>
                {selecao.length === 0
                  ? "Marque dois ou mais lançamentos seguidos"
                  : `${selecao.length} selecionado${selecao.length === 1 ? "" : "s"}`}
              </span>
              <button
                className="btn btn-primario"
                disabled={selecao.length < 2}
                onClick={() => acao("unir_lancamentos", { ids: selecao })}
                title="Vira um lançamento só, do início do primeiro ao fim do último"
              >
                <I.Juntar /> Unir
              </button>
              <button
                className="btn btn-fantasma"
                onClick={() => {
                  setSelecionando(false);
                  setSelecao([]);
                }}
              >
                Cancelar
              </button>
            </div>
          )}
        </>
      )}

      <FormLancamento
        key={form ? (form.modo === "editar" ? form.item.id : "novo") : "fechado"}
        form={form}
        dia={dia}
        tipos={tipos}
        cursos={cursos}
        onFechar={() => setForm(null)}
        onSalvo={() => {
          setForm(null);
          recarregar();
          onMudou();
        }}
        onErro={onErro}
      />
    </>
  );
}

/**
 * Lançar à mão e editar no mesmo formulário. Quem lança depois costuma
 * lembrar de tudo de uma vez — matéria, aula, o que foi feito — e um segundo
 * formulário para os "detalhes" só espalharia a mesma informação.
 */
function FormLancamento({
  form, dia, tipos, cursos, onFechar, onSalvo, onErro,
}: {
  form: Form;
  dia: Date;
  tipos: Tipo[];
  cursos: Curso[];
  onFechar: () => void;
  onSalvo: () => void;
  onErro: (e: string | null) => void;
}) {
  const item = form?.modo === "editar" ? form.item : null;
  const [inicio, setInicio] = useState(item ? hhmm(item.started_at) : agoraHhmm());
  const [fim, setFim] = useState(item ? hhmm(item.ended_at ?? item.started_at) : "");
  const [duracao, setDuracao] = useState("");
  const [tipo, setTipo] = useState(item?.activity_type_id ?? "at-estudo");
  const [desc, setDesc] = useState(item?.description ?? "");
  const [curso, setCurso] = useState(item?.course_id ?? "");
  const [obs, setObs] = useState(item?.observacao ?? "");
  const [km, setKm] = useState(item?.distancia_m ? String(item.distancia_m / 1000) : "");
  const [treino, setTreino] = useState(item?.treino ?? "");
  const [materia, setMateria] = useState(item?.subject_id ?? "");
  const [aula, setAula] = useState(item?.aula ?? "");
  const [materias, setMaterias] = useState<Materia[]>([]);

  useEffect(() => {
    if (!form) return;
    invoke<Materia[]>("listar_materias").then(setMaterias).catch(() => {});
  }, [form]);

  // O campo extra segue a categoria escolhida **agora**, não a que estava
  // gravada: reclassificar uma pausa como caminhada deve revelar a distância
  // na mesma hora.
  const extra = tipos.find((t) => t.id === tipo)?.campos_extra ?? null;

  const salvar = async () => {
    if (!inicio) return onErro("informe a hora de início");
    try {
      let id = item?.id;
      if (item) {
        await invoke("editar_lancamento", {
          id: item.id,
          inicio: comHora(dia, inicio),
          fim: comHora(dia, fim),
          activityTypeId: tipo,
          descricao: desc.trim() || null,
          cursoId: curso || null,
        });
      } else {
        if (!fim && !duracao.trim()) return onErro("informe o fim ou a duração");
        id = await invoke<string>("criar_lancamento", {
          inicio: comHora(dia, inicio),
          fim: fim ? comHora(dia, fim) : null,
          duracao: duracao.trim() || null,
          activityTypeId: tipo,
          descricao: desc.trim() || null,
          cursoId: curso || null,
        });
      }
      // Chamadas separadas de propósito: o calendário edita horários sem saber
      // destes campos, e juntá-los faria mover um bloco apagar a distância.
      await invoke("salvar_detalhes", {
        id,
        observacao: obs.trim() || null,
        distanciaM: extra === "distancia" && km.trim() ? Math.round(Number(km) * 1000) : null,
        treino: extra === "treino" ? treino.trim() || null : null,
      });
      await invoke("salvar_vinculos", {
        id,
        subjectId: materia || null,
        aula: aula.trim() || null,
      });
      onErro(null);
      onSalvo();
    } catch (e) {
      onErro(String(e));
    }
  };

  return (
    <Modal
      titulo={item ? "Editar lançamento" : "Novo lançamento"}
      aberto={!!form}
      onFechar={onFechar}
      larga
      pe={
        <>
          <button className="btn btn-fantasma" onClick={onFechar}>Cancelar</button>
          <button className="btn btn-primario" onClick={salvar}>
            {item ? "Salvar" : "Lançar"}
          </button>
        </>
      }
    >
      <div className="campos" onKeyDown={(e) => e.key === "Enter" && salvar()}>
        <div className="campo">
          <label htmlFor="fl-ini">Início</label>
          <input id="fl-ini" type="time" value={inicio} onChange={(e) => setInicio(e.target.value)} />
        </div>
        <div className="campo">
          <label htmlFor="fl-fim">Fim</label>
          <input id="fl-fim" type="time" value={fim} onChange={(e) => setFim(e.target.value)} />
        </div>
        {!item && (
          <div className="campo">
            <label htmlFor="fl-dur">ou duração</label>
            <input
              id="fl-dur"
              placeholder="45m · 1h30 · 1:30"
              value={duracao}
              onChange={(e) => setDuracao(e.target.value)}
            />
          </div>
        )}
        <div className="campo">
          <label htmlFor="fl-tipo">Atividade</label>
          <select id="fl-tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {tipos.map((t) => (
              <option key={t.id} value={t.id}>{t.nome}</option>
            ))}
          </select>
        </div>
        <div className="campo campo-largo">
          <label htmlFor="fl-desc">O que foi feito</label>
          <input id="fl-desc" value={desc} onChange={(e) => setDesc(e.target.value)} />
        </div>
        <div className="campo">
          <label htmlFor="fl-curso">Curso</label>
          <select id="fl-curso" value={curso} onChange={(e) => setCurso(e.target.value)}>
            <option value="">— nenhum —</option>
            {cursos.map((c) => (
              <option key={c.id} value={c.id}>{c.titulo}</option>
            ))}
          </select>
        </div>
        <div className="campo">
          <label htmlFor="fl-mat">Matéria</label>
          <select id="fl-mat" value={materia} onChange={(e) => setMateria(e.target.value)}>
            <option value="">— nenhuma —</option>
            {materias.map((m) => (
              <option key={m.id} value={m.id}>{m.nome}</option>
            ))}
          </select>
        </div>
        <div className="campo campo-largo">
          <label htmlFor="fl-aula">Aula</label>
          <input
            id="fl-aula"
            value={aula}
            onChange={(e) => setAula(e.target.value)}
            placeholder="Aula 13, módulo 2 — opcional"
          />
        </div>
        {extra === "distancia" && (
          <div className="campo">
            <label htmlFor="fl-km">Distância (km)</label>
            <input
              id="fl-km"
              type="number"
              min={0}
              step="0.1"
              value={km}
              onChange={(e) => setKm(e.target.value)}
            />
          </div>
        )}
        {extra === "treino" && (
          <div className="campo">
            <label htmlFor="fl-treino">Treino</label>
            <input
              id="fl-treino"
              value={treino}
              onChange={(e) => setTreino(e.target.value)}
              placeholder="Treino B, peito e tríceps"
            />
          </div>
        )}
        <div className="campo campo-largo">
          <label htmlFor="fl-obs">Observação</label>
          <input id="fl-obs" value={obs} onChange={(e) => setObs(e.target.value)} placeholder="opcional" />
        </div>
      </div>
      <p className="nota">
        {item
          ? "A versão anterior fica guardada no histórico."
          : "Informe o fim ou a duração; se vierem os dois, o fim ganha. Fora o tempo, nada é obrigatório."}
      </p>
    </Modal>
  );
}
