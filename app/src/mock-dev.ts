/**
 * Backend falso para desenvolvimento da interface no navegador.
 *
 * Só é carregado quando `import.meta.env.DEV` é verdadeiro **e** o app não
 * está dentro do Tauri — ou seja, nunca no aplicativo instalado. Existe porque
 * `npm run dev` sozinho abre uma página sem `invoke`, e aí toda tela aparece
 * vazia: não dá para avaliar layout, densidade nem estado cheio.
 *
 * Os dados abaixo são propositalmente irregulares (sessões curtas, buracos no
 * meio do dia, uma caminhada, um curso parado há meses). Dado bonitinho esconde
 * justamente os casos que quebram layout.
 */

const hoje = new Date();
const emHoras = (h: number, m = 0) => {
  const d = new Date(hoje);
  d.setHours(h, m, 0, 0);
  return d.getTime();
};

// Paleta categórica validada (ver migração 002): claro e escuro são passos
// escolhidos para cada superfície, não um o clareado do outro.
const TIPOS = [
  { id: "at-estudo", nome: "Estudo", cor: "#2a78d6", cor_escura: "#3987e5", conta_como_estudo: true },
  { id: "at-academia", nome: "Academia", cor: "#eb6834", cor_escura: "#d95926", conta_como_estudo: false },
  { id: "at-caminhada", nome: "Caminhada com os dogs", cor: "#1baf7a", cor_escura: "#199e70", conta_como_estudo: false },
  { id: "at-exercicio", nome: "Exercício", cor: "#eda100", cor_escura: "#c98500", conta_como_estudo: false },
  { id: "at-descanso", nome: "Descanso", cor: "#e87ba4", cor_escura: "#d55181", conta_como_estudo: false },
  { id: "at-deslocamento", nome: "Deslocamento", cor: "#008300", cor_escura: "#008300", conta_como_estudo: false },
  { id: "at-pausa", nome: "Pausa", cor: "#4a3aa7", cor_escura: "#9085e9", conta_como_estudo: false },
  { id: "at-pessoal", nome: "Pessoal", cor: "#e34948", cor_escura: "#e66767", conta_como_estudo: false },
];

const cor = (id: string) => TIPOS.find((t) => t.id === id)!;

const CURSOS = [
  {
    id: "c1",
    titulo: "Unidaystudio — Blender para jogos",
    url_principal: "https://hotmart.com/pt-br/club/unidaystudio",
    ultima_url: "https://hotmart.com/pt-br/club/unidaystudio/products/2325766",
    ultima_url_em: Date.now() - 3 * 3600_000,
    estado: "ativo",
    favorito: true,
  },
  {
    id: "c2",
    titulo: "T2 — Fundamentos de renda variável",
    url_principal: "https://app.t2.com.br/",
    ultima_url: "https://app.t2.com.br/trilhas/rv/aula-12",
    ultima_url_em: Date.now() - 4 * 86_400_000,
    estado: "ativo",
    favorito: false,
  },
  {
    id: "c3",
    titulo: "Rust para quem vem de TypeScript",
    url_principal: null,
    ultima_url: null,
    ultima_url_em: Date.now() - 96 * 86_400_000,
    estado: "pausado",
    favorito: false,
  },
];

const LANC = [
  ["e1", emHoras(7, 10), emHoras(7, 52), "at-caminhada", "Volta no parque com os dogs", null],
  ["e2", emHoras(8, 30), emHoras(9, 25), "at-estudo", "Modelagem hard surface — aula 12", "c1"],
  ["e3", emHoras(9, 25), emHoras(9, 33), "at-pausa", null, null],
  ["e4", emHoras(9, 33), emHoras(10, 48), "at-estudo", "Retopologia e UV", "c1"],
  ["e5", emHoras(12, 5), emHoras(13, 0), "at-academia", "Treino B", null],
  ["e6", emHoras(14, 20), emHoras(15, 5), "at-estudo", "Renda variável — aula 12", "c2"],
  ["e7", emHoras(15, 5), emHoras(15, 20), "at-descanso", null, null],
  ["e8", emHoras(15, 20), emHoras(16, 42), "at-estudo", "Exercícios da aula 12", "c2"],
] as const;

const monta = (
  id: string, ini: number, fim: number, tipo: string,
  desc: string | null, curso: string | null
) => ({
  id,
  started_at: ini,
  ended_at: fim,
  activity_type_id: tipo,
  atividade: cor(tipo).nome,
  cor: cor(tipo).cor,
  cor_escura: cor(tipo).cor_escura,
  conta_como_estudo: cor(tipo).conta_como_estudo,
  description: desc,
  course_id: curso,
  curso: curso ? CURSOS.find((c) => c.id === curso)!.titulo : null,
  source: "timer",
});

const lancamentos = LANC.map(([id, ini, fim, tipo, desc, curso]) =>
  monta(id, ini, fim, tipo, desc, curso)
);

// Histórico dos últimos 45 dias, gerado com irregularidade proposital: dias
// zerados, finais de semana fracos e um pico. Série lisa esconde o que o
// gráfico precisa mostrar.
const semente = (n: number) => {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

for (let d = 1; d <= 45; d++) {
  const base = new Date(hoje);
  base.setDate(base.getDate() - d);
  base.setHours(0, 0, 0, 0);
  const fds = base.getDay() === 0 || base.getDay() === 6;
  const r = semente(d);

  if (r < (fds ? 0.55 : 0.16)) continue; // dia sem estudo

  const blocos = r > 0.85 ? 3 : r > 0.5 ? 2 : 1;
  for (let b = 0; b < blocos; b++) {
    const hIni = 8 + b * 3 + Math.floor(semente(d * 10 + b) * 2);
    const minutos = 30 + Math.floor(semente(d * 7 + b) * 75);
    const ini = new Date(base);
    ini.setHours(hIni, 0, 0, 0);
    const cursoId = semente(d + b) > 0.5 ? "c1" : "c2";
    lancamentos.push(
      monta(
        `h${d}-${b}`,
        ini.getTime(),
        ini.getTime() + minutos * 60000,
        "at-estudo",
        "Sessão de estudo",
        cursoId
      )
    );
  }

  if (semente(d * 3) > 0.6) {
    const ini = new Date(base);
    ini.setHours(7, 10, 0, 0);
    lancamentos.push(
      monta(`hc${d}`, ini.getTime(), ini.getTime() + 40 * 60000,
        "at-caminhada", "Caminhada com os dogs", null)
    );
  }
  if (semente(d * 5) > 0.7) {
    const ini = new Date(base);
    ini.setHours(12, 0, 0, 0);
    lancamentos.push(
      monta(`ha${d}`, ini.getTime(), ini.getTime() + 55 * 60000,
        "at-academia", "Treino", null)
    );
  }
}

const p2 = (n: number) => String(n).padStart(2, "0");
const isoDia = (delta = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
};

// Mistura proposital: tarefa sem estimativa, uma estourada, uma atrasada de
// dois dias, uma sem data. É onde o layout costuma quebrar.
const TAREFAS = [
  { id: "t1", titulo: "Assistir aula 13 — modificadores", course_id: "c1", curso: CURSOS[0].titulo,
    duracao_estimada_min: 60, prioridade: 1, dia_planejado: isoDia(0), ordem: 0,
    estado: "aberta", concluida_em: null, realizado_ms: 25 * 60000 },
  { id: "t2", titulo: "Refazer o exercício de retopologia", course_id: "c1", curso: CURSOS[0].titulo,
    duracao_estimada_min: 45, prioridade: 0, dia_planejado: isoDia(0), ordem: 1,
    estado: "aberta", concluida_em: null, realizado_ms: 68 * 60000 },
  { id: "t3", titulo: "Ler capítulo sobre ordens a mercado", course_id: "c2", curso: CURSOS[1].titulo,
    duracao_estimada_min: null, prioridade: 2, dia_planejado: isoDia(0), ordem: 2,
    estado: "aberta", concluida_em: null, realizado_ms: 0 },
  { id: "t4", titulo: "Revisar anotações da semana", course_id: null, curso: null,
    duracao_estimada_min: 30, prioridade: 0, dia_planejado: isoDia(0), ordem: 3,
    estado: "concluida", concluida_em: Date.now() - 7200000, realizado_ms: 34 * 60000 },
  { id: "t5", titulo: "Terminar a lista de exercícios da aula 11", course_id: "c2", curso: CURSOS[1].titulo,
    duracao_estimada_min: 90, prioridade: 1, dia_planejado: isoDia(-2), ordem: 0,
    estado: "aberta", concluida_em: null, realizado_ms: 0 },
  { id: "t6", titulo: "Configurar ambiente de Rust", course_id: "c3", curso: CURSOS[2].titulo,
    duracao_estimada_min: 40, prioridade: 0, dia_planejado: isoDia(-5), ordem: 0,
    estado: "aberta", concluida_em: null, realizado_ms: 0 },
  { id: "t7", titulo: "Escolher próximo curso de shaders", course_id: null, curso: null,
    duracao_estimada_min: null, prioridade: 0, dia_planejado: null, ordem: 0,
    estado: "aberta", concluida_em: null, realizado_ms: 0 },
  { id: "t8", titulo: "Assistir aula 12 e anotar", course_id: "c1", curso: CURSOS[0].titulo,
    duracao_estimada_min: 60, prioridade: 0, dia_planejado: isoDia(2), ordem: 0,
    estado: "aberta", concluida_em: null, realizado_ms: 0 },
];

let rodando: { inicio: number; descricao: string } | null = null;

const respostas: Record<string, (a: any) => unknown> = {
  listar_cursos: () => CURSOS,
  listar_tarefas: ({ dia, ate, modo }) => {
    const hoje = isoDia(0);
    if (modo === "atrasadas")
      return TAREFAS.filter(
        (t) => t.estado === "aberta" && t.dia_planejado && t.dia_planejado < (dia ?? hoje)
      );
    if (modo === "concluidas") return TAREFAS.filter((t) => t.estado === "concluida");
    if (modo === "sem_dia")
      return TAREFAS.filter((t) => t.estado === "aberta" && !t.dia_planejado);
    return TAREFAS.filter(
      (t) => t.dia_planejado && t.dia_planejado >= dia && t.dia_planejado <= ate
    );
  },
  criar_tarefa: () => "novo",
  editar_tarefa: () => null,
  mover_tarefa: () => null,
  reordenar_tarefas: () => null,
  mudar_estado_tarefa: () => null,
  excluir_tarefa: () => null,
  replanejar_atrasadas: () => 2,
  listar_tipos: () => TIPOS,
  listar_periodo: ({ inicio, fim }) =>
    lancamentos.filter((l) => l.started_at < fim && l.ended_at > inicio),
  timer_recover: () => null,
  ponte_info: () => ({ porta: 47823, token: "mockmockmockmockmockmockmockmock" }),
  timer_status: () =>
    rodando
      ? {
          session: "mock",
          description: rodando.descricao,
          wall_ms: Date.now() - rodando.inicio,
          mono_ms: Date.now() - rodando.inicio,
          drift_ms: 0,
        }
      : null,
  timer_start: ({ description }) => {
    rodando = { inicio: Date.now(), descricao: description };
    return {};
  },
  timer_stop: () => {
    rodando = null;
    return {};
  },
};

(window as any).__TAURI_INTERNALS__ = {
  transformCallback: (cb: unknown) => cb,
  invoke: async (cmd: string, args: any) => {
    const f = respostas[cmd];
    if (!f) {
      console.warn(`[mock] comando sem resposta: ${cmd}`, args);
      return null;
    }
    return f(args ?? {});
  },
};

console.info("[mock] backend falso ativo — só em dev, fora do Tauri");

export {};
