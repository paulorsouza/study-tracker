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

const TIPOS = [
  { id: "at-estudo", nome: "Estudo", cor: "#6c8cff", conta_como_estudo: true },
  { id: "at-pausa", nome: "Pausa", cor: "#7c8496", conta_como_estudo: false },
  { id: "at-caminhada", nome: "Caminhada com os dogs", cor: "#56d364", conta_como_estudo: false },
  { id: "at-academia", nome: "Academia", cor: "#f47174", conta_como_estudo: false },
  { id: "at-exercicio", nome: "Exercício", cor: "#e3b341", conta_como_estudo: false },
  { id: "at-deslocamento", nome: "Deslocamento", cor: "#5ec8e5", conta_como_estudo: false },
  { id: "at-descanso", nome: "Descanso", cor: "#b48ce8", conta_como_estudo: false },
  { id: "at-pessoal", nome: "Pessoal", cor: "#c0caf5", conta_como_estudo: false },
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

const lancamentos = LANC.map(([id, ini, fim, tipo, desc, curso]) => ({
  id,
  started_at: ini,
  ended_at: fim,
  activity_type_id: tipo,
  atividade: cor(tipo).nome,
  cor: cor(tipo).cor,
  conta_como_estudo: cor(tipo).conta_como_estudo,
  description: desc,
  course_id: curso,
  curso: curso ? CURSOS.find((c) => c.id === curso)!.titulo : null,
  source: "timer",
}));

let rodando: { inicio: number; descricao: string } | null = null;

const respostas: Record<string, (a: any) => unknown> = {
  listar_cursos: () => CURSOS,
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
