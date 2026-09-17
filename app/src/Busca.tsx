import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import * as I from "./icones";

type Tarefa = {
  id: string;
  titulo: string;
  course_id: string | null;
  curso: string | null;
  dia_planejado: string | null;
  estado: string;
  activity_type_id: string | null;
};
type Curso = { id: string; titulo: string; ultima_url: string | null; url_principal: string | null };
type Nota = { id: string; titulo: string | null; texto: string };

type Item = {
  chave: string;
  tipo: "tarefa" | "curso" | "nota";
  rotulo: string;
  detalhe: string;
  acao: () => void;
};

const p2 = (n: number) => String(n).padStart(2, "0");
const hojeIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
};

/** Sem acento e sem caixa: quem digita "matematica" quer achar "Matemática". */
const chave = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Busca única do app (Ctrl+K).
 *
 * O caminho curto para a ação, não uma sétima tela: tarefa começa o
 * cronômetro, curso abre a última aula no navegador, nota leva à tela dela já
 * filtrada. Tudo que a busca faz existe em algum outro lugar — ela só evita a
 * navegação.
 */
export default function Busca({
  aberto,
  onFechar,
  onAba,
  onErro,
  onMudou,
}: {
  aberto: boolean;
  onFechar: () => void;
  onAba: (aba: string) => void;
  onErro: (e: string | null) => void;
  onMudou: () => void;
}) {
  const [termo, setTermo] = useState("");
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [notas, setNotas] = useState<Nota[]>([]);
  const [sel, setSel] = useState(0);
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!aberto) return;
    setTermo("");
    setSel(0);
    campo.current?.focus();

    const hoje = hojeIso();
    // Tarefa sem data e atrasada entram junto com as da semana: o que está
    // fora do dia de hoje é justamente o que custa achar navegando.
    Promise.all(
      (["semana", "atrasadas", "sem_dia"] as const).map((modo) =>
        invoke<Tarefa[]>("listar_tarefas", { dia: hoje, ate: null, modo }).catch(() => [])
      )
    ).then((listas) => {
      const vistas = new Set<string>();
      setTarefas(
        listas.flat().filter((t) => t.estado === "aberta" && !vistas.has(t.id) && vistas.add(t.id))
      );
    });
    invoke<Curso[]>("listar_cursos").then(setCursos).catch(() => {});
  }, [aberto]);

  useEffect(() => {
    if (!aberto || termo.trim().length < 2) {
      setNotas([]);
      return;
    }
    const id = setTimeout(() => {
      invoke<Nota[]>("listar_notas", {
        busca: termo,
        tag: null,
        cursoId: null,
        revisarAte: null,
      })
        .then((n) => setNotas(n.slice(0, 5)))
        .catch(() => {});
    }, 180);
    return () => clearTimeout(id);
  }, [termo, aberto]);

  const itens = useMemo<Item[]>(() => {
    const t = chave(termo.trim());
    const casa = (s: string) => t === "" || chave(s).includes(t);

    const deTarefas: Item[] = tarefas
      .filter((x) => casa(x.titulo) || casa(x.curso ?? ""))
      .slice(0, 6)
      .map((x) => ({
        chave: `t-${x.id}`,
        tipo: "tarefa",
        rotulo: x.titulo,
        detalhe: x.curso ?? "iniciar cronômetro",
        acao: () =>
          invoke("timer_start", {
            description: x.titulo,
            cursoId: x.course_id,
            tarefaId: x.id,
            activityTypeId: x.activity_type_id,
          })
            .then(() => {
              onMudou();
              onErro(null);
            })
            .catch((e) => onErro(String(e))),
      }));

    const deCursos: Item[] = cursos
      .filter((c) => casa(c.titulo))
      .slice(0, 5)
      .map((c) => ({
        chave: `c-${c.id}`,
        tipo: "curso",
        rotulo: c.titulo,
        detalhe: c.ultima_url ?? c.url_principal ?? "sem rota salva",
        acao: () => {
          const url = c.ultima_url ?? c.url_principal;
          if (!url) return onAba("cursos");
          invoke("abrir_no_navegador", { url }).catch((e) => onErro(String(e)));
        },
      }));

    const deNotas: Item[] = notas.map((n) => ({
      chave: `n-${n.id}`,
      tipo: "nota",
      rotulo: n.titulo || n.texto.slice(0, 60),
      detalhe: "abrir nas notas",
      acao: () => onAba("notas"),
    }));

    return [...deTarefas, ...deCursos, ...deNotas];
  }, [termo, tarefas, cursos, notas, onAba, onErro, onMudou]);

  useEffect(() => setSel(0), [termo]);

  if (!aberto) return null;

  const escolher = (i: Item) => {
    i.acao();
    onFechar();
  };

  return (
    <div className="busca-fundo" onClick={onFechar}>
      <div className="busca" onClick={(e) => e.stopPropagation()}>
        <div className="busca-campo">
          <I.Lupa />
          <input
            ref={campo}
            autoFocus
            value={termo}
            placeholder="Tarefa, curso ou nota"
            onChange={(e) => setTermo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") return onFechar();
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSel((s) => Math.min(s + 1, itens.length - 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setSel((s) => Math.max(s - 1, 0));
              }
              if (e.key === "Enter" && itens[sel]) escolher(itens[sel]);
            }}
          />
        </div>

        <div className="busca-lista">
          {itens.length === 0 ? (
            <div className="vazio" style={{ border: 0 }}>
              Nada encontrado.
            </div>
          ) : (
            itens.map((i, n) => (
              <button
                key={i.chave}
                className={`busca-item${n === sel ? " sel" : ""}`}
                onMouseEnter={() => setSel(n)}
                onClick={() => escolher(i)}
              >
                {i.tipo === "tarefa" ? <I.Play size={13} /> : i.tipo === "curso" ? <I.Livro size={13} /> : <I.Nota size={13} />}
                <span className="busca-rotulo">{i.rotulo}</span>
                <span className="busca-detalhe">{i.detalhe}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
