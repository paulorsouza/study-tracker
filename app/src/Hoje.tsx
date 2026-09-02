import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

type Lancamento = {
  id: string;
  started_at: number;
  ended_at: number | null;
  activity_type_id: string;
  atividade: string;
  cor: string;
  conta_como_estudo: boolean;
  description: string | null;
  course_id: string | null;
  curso: string | null;
  source: string;
};

type Tipo = {
  id: string;
  nome: string;
  cor: string;
  conta_como_estudo: boolean;
};

type Curso = { id: string; titulo: string };

function dur(ms: number) {
  const min = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

const hhmm = (ms: number) =>
  new Date(ms).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });

/** Combina o dia mostrado com um "HH:MM" do input, em hora local. */
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

export default function Hoje({
  cursos,
  onErro,
}: {
  cursos: Curso[];
  onErro: (e: string | null) => void;
}) {
  const [dia, setDia] = useState(() => new Date());
  const [itens, setItens] = useState<Lancamento[]>([]);
  const [tipos, setTipos] = useState<Tipo[]>([]);
  const [editando, setEditando] = useState<string | null>(null);
  const [desfazer, setDesfazer] = useState<string | null>(null);

  // formulário de lançamento manual
  const [fInicio, setFInicio] = useState("");
  const [fFim, setFFim] = useState("");
  const [fDuracao, setFDuracao] = useState("");
  const [fTipo, setFTipo] = useState("at-estudo");
  const [fDesc, setFDesc] = useState("");
  const [fCurso, setFCurso] = useState("");

  const [ini, fim] = useMemo(() => limitesDoDia(dia), [dia]);

  const recarregar = useCallback(() => {
    invoke<Lancamento[]>("listar_periodo", { inicio: ini, fim })
      .then(setItens)
      .catch((e) => onErro(String(e)));
  }, [ini, fim, onErro]);

  useEffect(() => {
    invoke<Tipo[]>("listar_tipos").then(setTipos).catch(() => {});
  }, []);

  useEffect(() => {
    recarregar();
    // O cronômetro pode estar rodando e a extensão pode gravar de fora; sem
    // recarga periódica a lista fica velha sem o usuário saber.
    const t = setInterval(recarregar, 5000);
    return () => clearInterval(t);
  }, [recarregar]);

  const totais = useMemo(() => {
    let total = 0;
    let estudo = 0;
    const porAtividade = new Map<string, { nome: string; cor: string; ms: number }>();
    for (const i of itens) {
      const d = (i.ended_at ?? Date.now()) - i.started_at;
      total += d;
      if (i.conta_como_estudo) estudo += d;
      const at = porAtividade.get(i.activity_type_id) ?? {
        nome: i.atividade,
        cor: i.cor,
        ms: 0,
      };
      at.ms += d;
      porAtividade.set(i.activity_type_id, at);
    }
    return { total, estudo, porAtividade: [...porAtividade.values()] };
  }, [itens]);

  const ehHoje = new Date().toDateString() === dia.toDateString();

  const mudarDia = (delta: number) => {
    const d = new Date(dia);
    d.setDate(d.getDate() + delta);
    setDia(d);
    setEditando(null);
  };

  const adicionar = () => {
    if (!fInicio) return onErro("informe a hora de início");
    invoke<string>("criar_lancamento", {
      inicio: comHora(dia, fInicio),
      fim: fFim ? comHora(dia, fFim) : null,
      duracao: fDuracao.trim() || null,
      activityTypeId: fTipo,
      descricao: fDesc.trim() || null,
      cursoId: fCurso || null,
    })
      .then(() => {
        setFDesc("");
        setFDuracao("");
        setFFim("");
        onErro(null);
        recarregar();
      })
      .catch((e) => onErro(String(e)));
  };

  const excluir = (id: string) =>
    invoke("excluir_lancamento", { id })
      .then(() => {
        setDesfazer(id);
        onErro(null);
        recarregar();
      })
      .catch((e) => onErro(String(e)));

  const restaurar = () => {
    if (!desfazer) return;
    invoke("restaurar_lancamento", { id: desfazer })
      .then(() => {
        setDesfazer(null);
        recarregar();
      })
      .catch((e) => onErro(String(e)));
  };

  return (
    <section className="cartao">
      <div className="linha" style={{ marginBottom: 14 }}>
        <h2 style={{ margin: 0, flex: 1 }}>
          {ehHoje
            ? "Hoje"
            : dia.toLocaleDateString("pt-BR", {
                weekday: "long",
                day: "2-digit",
                month: "2-digit",
              })}
        </h2>
        <button onClick={() => mudarDia(-1)}>←</button>
        <button onClick={() => setDia(new Date())} disabled={ehHoje}>
          Hoje
        </button>
        <button onClick={() => mudarDia(1)}>→</button>
      </div>

      {desfazer && (
        <div className="alerta">
          Lançamento excluído.{" "}
          <button onClick={restaurar}>Desfazer</button>{" "}
          <button onClick={() => setDesfazer(null)}>Dispensar</button>
        </div>
      )}

      <table className="medidas" style={{ marginBottom: 14 }}>
        <tbody>
          <tr>
            <td>tempo total registrado</td>
            <td>{dur(totais.total)}</td>
          </tr>
          <tr>
            <td>
              <b>tempo efetivo de estudo</b>
            </td>
            <td>
              <b>{dur(totais.estudo)}</b>
            </td>
          </tr>
          {totais.porAtividade
            .filter((a) => a.ms > 0)
            .map((a) => (
              <tr key={a.nome}>
                <td style={{ paddingLeft: 14, color: a.cor }}>{a.nome}</td>
                <td>{dur(a.ms)}</td>
              </tr>
            ))}
        </tbody>
      </table>

      {itens.length === 0 ? (
        <p className="nota">
          Nada registrado neste dia. Use o cronômetro, a extensão do Chrome, ou
          lance manualmente abaixo.
        </p>
      ) : (
        itens.map((i) =>
          editando === i.id ? (
            <Editor
              key={i.id}
              item={i}
              dia={dia}
              tipos={tipos}
              cursos={cursos}
              onCancelar={() => setEditando(null)}
              onSalvo={() => {
                setEditando(null);
                recarregar();
              }}
              onErro={onErro}
            />
          ) : (
            <div key={i.id} className="linha">
              <span
                style={{
                  width: 4,
                  alignSelf: "stretch",
                  background: i.cor,
                  borderRadius: 2,
                }}
              />
              <span
                className="nota"
                style={{ margin: 0, minWidth: 104, fontVariantNumeric: "tabular-nums" }}
              >
                {hhmm(i.started_at)}–{i.ended_at ? hhmm(i.ended_at) : "agora"}
              </span>
              <span style={{ flex: 1 }}>
                {i.description || <em style={{ opacity: 0.6 }}>{i.atividade}</em>}
                {i.curso && <span className="nota"> · {i.curso}</span>}
              </span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>
                {dur((i.ended_at ?? Date.now()) - i.started_at)}
              </span>
              <button onClick={() => setEditando(i.id)} disabled={!i.ended_at}>
                Editar
              </button>
              <button onClick={() => excluir(i.id)} disabled={!i.ended_at}>
                Excluir
              </button>
            </div>
          )
        )
      )}

      <hr style={{ border: 0, borderTop: "1px solid var(--line)", margin: "16px 0" }} />

      <h2>Lançar manualmente</h2>
      <div className="linha">
        <input
          type="time"
          value={fInicio}
          onChange={(e) => setFInicio(e.target.value)}
          style={{ maxWidth: 110 }}
          aria-label="início"
        />
        <input
          type="time"
          value={fFim}
          onChange={(e) => setFFim(e.target.value)}
          style={{ maxWidth: 110 }}
          aria-label="fim"
        />
        <input
          placeholder="ou 45m, 1h30, 1:30"
          value={fDuracao}
          onChange={(e) => setFDuracao(e.target.value)}
          style={{ maxWidth: 150 }}
        />
        <select value={fTipo} onChange={(e) => setFTipo(e.target.value)}>
          {tipos.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nome}
            </option>
          ))}
        </select>
      </div>
      <div className="linha">
        <input
          placeholder="O que foi feito?"
          value={fDesc}
          onChange={(e) => setFDesc(e.target.value)}
        />
        <select value={fCurso} onChange={(e) => setFCurso(e.target.value)}>
          <option value="">— sem curso —</option>
          {cursos.map((c) => (
            <option key={c.id} value={c.id}>
              {c.titulo}
            </option>
          ))}
        </select>
        <button className="primario" onClick={adicionar}>
          Lançar
        </button>
      </div>
      <p className="nota">
        Informe fim ou duração — o fim ganha se vierem os dois. Nenhum campo
        além do tempo é obrigatório.
      </p>
    </section>
  );
}

function Editor({
  item,
  dia,
  tipos,
  cursos,
  onCancelar,
  onSalvo,
  onErro,
}: {
  item: Lancamento;
  dia: Date;
  tipos: Tipo[];
  cursos: Curso[];
  onCancelar: () => void;
  onSalvo: () => void;
  onErro: (e: string | null) => void;
}) {
  const [inicio, setInicio] = useState(hhmm(item.started_at));
  const [fim, setFim] = useState(hhmm(item.ended_at ?? item.started_at));
  const [tipo, setTipo] = useState(item.activity_type_id);
  const [desc, setDesc] = useState(item.description ?? "");
  const [curso, setCurso] = useState(item.course_id ?? "");

  const salvar = () =>
    invoke("editar_lancamento", {
      id: item.id,
      inicio: comHora(dia, inicio),
      fim: comHora(dia, fim),
      activityTypeId: tipo,
      descricao: desc.trim() || null,
      cursoId: curso || null,
    })
      .then(() => {
        onErro(null);
        onSalvo();
      })
      .catch((e) => onErro(String(e)));

  return (
    <div
      className="linha"
      style={{
        flexWrap: "wrap",
        border: "1px solid var(--acc)",
        borderRadius: 8,
        padding: 10,
      }}
    >
      <input
        type="time"
        value={inicio}
        onChange={(e) => setInicio(e.target.value)}
        style={{ maxWidth: 110 }}
      />
      <input
        type="time"
        value={fim}
        onChange={(e) => setFim(e.target.value)}
        style={{ maxWidth: 110 }}
      />
      <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
        {tipos.map((t) => (
          <option key={t.id} value={t.id}>
            {t.nome}
          </option>
        ))}
      </select>
      <select value={curso} onChange={(e) => setCurso(e.target.value)}>
        <option value="">— sem curso —</option>
        {cursos.map((c) => (
          <option key={c.id} value={c.id}>
            {c.titulo}
          </option>
        ))}
      </select>
      <input
        placeholder="descrição"
        value={desc}
        onChange={(e) => setDesc(e.target.value)}
        style={{ flex: 1, minWidth: 160 }}
      />
      <button className="primario" onClick={salvar}>
        Salvar
      </button>
      <button onClick={onCancelar}>Cancelar</button>
    </div>
  );
}
