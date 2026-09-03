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
  { id: "at-estudo", nome: "Estudo", cor: "#2a78d6", cor_escura: "#3987e5", conta_como_estudo: true , icone: "livro", campos_extra: null },
  { id: "at-academia", nome: "Academia", cor: "#eb6834", cor_escura: "#d95926", conta_como_estudo: false , icone: "halter", campos_extra: "treino" },
  { id: "at-caminhada", nome: "Caminhada com os dogs", cor: "#1baf7a", cor_escura: "#199e70", conta_como_estudo: false , icone: "cachorro", campos_extra: "distancia" },
  { id: "at-exercicio", nome: "Exercício", cor: "#eda100", cor_escura: "#c98500", conta_como_estudo: false , icone: "corrida", campos_extra: "treino" },
  { id: "at-descanso", nome: "Descanso", cor: "#e87ba4", cor_escura: "#d55181", conta_como_estudo: false , icone: "cama", campos_extra: null },
  { id: "at-deslocamento", nome: "Deslocamento", cor: "#008300", cor_escura: "#008300", conta_como_estudo: false , icone: "carro", campos_extra: "distancia" },
  { id: "at-pausa", nome: "Pausa", cor: "#4a3aa7", cor_escura: "#9085e9", conta_como_estudo: false , icone: "cafe", campos_extra: null },
  { id: "at-pessoal", nome: "Pessoal", cor: "#e34948", cor_escura: "#e66767", conta_como_estudo: false , icone: "pessoa", campos_extra: null },
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
  // Sobreposto de propósito: é o caso que o destaque tem que pegar.
  ["e5b", emHoras(12, 40), emHoras(13, 10), "at-estudo", "Podcast enquanto treina", null],
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
  context: null as string | null,
  sobrepoe: false,
  subject_id: null as string | null,
  materia: null as string | null,
  aula: null as string | null,
  observacao: null as string | null,
  distancia_m: null as number | null,
  treino: null as string | null,
  icone: cor(tipo).icone,
});

const lancamentos = LANC.map(([id, ini, fim, tipo, desc, curso]) =>
  monta(id, ini, fim, tipo, desc, curso)
);

// Dois focos de Pomodoro hoje, para o contador do Painel ter o que contar.
for (const id of ["e2", "e4"]) {
  const l = lancamentos.find((x) => x.id === id);
  if (l) l.context = "pomodoro_focus";
}

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
    estado: "aberta", concluida_em: null, realizado_ms: 25 * 60000,
    activity_type_id: null, atividade: null, cor: null, cor_escura: null, icone: null },
  { id: "t2", titulo: "Refazer o exercício de retopologia", course_id: "c1", curso: CURSOS[0].titulo,
    duracao_estimada_min: 45, prioridade: 0, dia_planejado: isoDia(0), ordem: 1,
    estado: "aberta", concluida_em: null, realizado_ms: 68 * 60000,
    activity_type_id: null, atividade: null, cor: null, cor_escura: null, icone: null },
  { id: "t3", titulo: "Ler capítulo sobre ordens a mercado", course_id: "c2", curso: CURSOS[1].titulo,
    duracao_estimada_min: null, prioridade: 2, dia_planejado: isoDia(0), ordem: 2,
    estado: "aberta", concluida_em: null, realizado_ms: 0,
    activity_type_id: null, atividade: null, cor: null, cor_escura: null, icone: null },
  { id: "t4", titulo: "Revisar anotações da semana", course_id: null, curso: null,
    duracao_estimada_min: 30, prioridade: 0, dia_planejado: isoDia(0), ordem: 3,
    estado: "concluida", concluida_em: Date.now() - 7200000, realizado_ms: 34 * 60000,
    activity_type_id: null, atividade: null, cor: null, cor_escura: null, icone: null },
  // Bloco pessoal no meio do dia: é o "misturar estudo, exercício e descanso"
  // que §3.5 pede do planejamento.
  { id: "t9", titulo: "Academia — treino B", course_id: null, curso: null,
    duracao_estimada_min: 60, prioridade: 0, dia_planejado: isoDia(0), ordem: 4,
    estado: "aberta", concluida_em: null, realizado_ms: 55 * 60000,
    activity_type_id: "at-academia", atividade: "Academia", cor: "#eb6834",
    cor_escura: "#d95926", icone: "halter" },
  { id: "t10", titulo: "Caminhar com os dogs", course_id: null, curso: null,
    duracao_estimada_min: 40, prioridade: 0, dia_planejado: isoDia(0), ordem: 5,
    estado: "aberta", concluida_em: null, realizado_ms: 42 * 60000,
    activity_type_id: "at-caminhada", atividade: "Caminhada com os dogs",
    cor: "#1baf7a", cor_escura: "#199e70", icone: "cachorro" },
  { id: "t5", titulo: "Terminar a lista de exercícios da aula 11", course_id: "c2", curso: CURSOS[1].titulo,
    duracao_estimada_min: 90, prioridade: 1, dia_planejado: isoDia(-2), ordem: 0,
    estado: "aberta", concluida_em: null, realizado_ms: 0,
    activity_type_id: null, atividade: null, cor: null, cor_escura: null, icone: null },
  { id: "t6", titulo: "Configurar ambiente de Rust", course_id: "c3", curso: CURSOS[2].titulo,
    duracao_estimada_min: 40, prioridade: 0, dia_planejado: isoDia(-5), ordem: 0,
    estado: "aberta", concluida_em: null, realizado_ms: 0,
    activity_type_id: null, atividade: null, cor: null, cor_escura: null, icone: null },
  { id: "t7", titulo: "Escolher próximo curso de shaders", course_id: null, curso: null,
    duracao_estimada_min: null, prioridade: 0, dia_planejado: null, ordem: 0,
    estado: "aberta", concluida_em: null, realizado_ms: 0,
    activity_type_id: null, atividade: null, cor: null, cor_escura: null, icone: null },
  { id: "t8", titulo: "Assistir aula 12 e anotar", course_id: "c1", curso: CURSOS[0].titulo,
    duracao_estimada_min: 60, prioridade: 0, dia_planejado: isoDia(2), ordem: 0,
    estado: "aberta", concluida_em: null, realizado_ms: 0,
    activity_type_id: null, atividade: null, cor: null, cor_escura: null, icone: null },
];

let rodando: { inicio: number; descricao: string; acumulado?: number } | null = null;
let pausado: { acumulado: number; descricao: string } | null = null;

// Sessão de Pomodoro simulada: já com dois focos feitos e um em andamento, para
// a tela poder ser avaliada cheia — anel a meio caminho, pontos parcialmente
// preenchidos e ciclos anteriores na lista.
let pomo = {
  ativo: true,
  fase: "foco" as string | null,
  rotulo: "Foco" as string | null,
  aguardando: null as string | null,
  rotulo_aguardando: null as string | null,
  focos: 2,
  ciclos_ate_longa: 4,
  inicio: Date.now() - 11 * 60000,
  planejado_ms: 25 * 60000,
  descricao: "Aula 13 — modificadores",
  activity_type_id: "at-pausa",
};

const cfgPomo = {
  foco_min: 25, curta_min: 5, longa_min: 15, ciclos_ate_longa: 4,
  auto_pausa: false, auto_foco: false, som: true, abrir_curso: false,
  tipo_pausa: "at-pausa",
};

const respostas: Record<string, (a: any) => unknown> = {
  listar_cursos: () => CURSOS,
  listar_plataformas: () => [
    { id: "p1", nome: "Hotmart", url_base: "https://hotmart.com" },
    { id: "p2", nome: "YouTube", url_base: "https://youtube.com" },
  ],
  criar_plataforma: () => "p3",
  listar_tags_curso: () => ["blender", "3d", "rust"],
  salvar_curso: () => null,
  baixar_capa: () => null,
  curso_detalhe: (a: any) => {
    const c = CURSOS.find((x) => x.id === a.id)!;
    return {
      ...c,
      platform_id: "p1",
      plataforma: "Hotmart",
      professor: "Rafael Rodrigues",
      categoria: "3D",
      prioridade: 1,
      progresso: 42,
      meta_minutos: 3000,
      estimado_min: 4800,
      prazo: Date.now() + 40 * 86400000,
      capa_url: null,
      capa: null,
      tags: ["blender", "3d"],
      total_ms: 41 * 3600_000,
      recente_ms: 6 * 3600_000,
      semanas: [120, 210, 90, 0, 0, 45, 180, 240, 160, 60, 200, 130],
      tarefas_abertas: 3,
      tarefas_concluidas: 11,
      notas: 5,
      sessoes: [
        { id: "s1", texto: "Aula 13 — modificadores", em: Date.now() - 3 * 3600_000, extra: String(52 * 60000), concluido: false },
        { id: "s2", texto: "Retopologia", em: Date.now() - 86400000, extra: String(95 * 60000), concluido: false },
      ],
      lista_tarefas: [
        { id: "t1", texto: "Assistir aula 13 — modificadores", em: Date.now() + 2 * 86400000, extra: "aberta", concluido: false },
        { id: "t8", texto: "Assistir aula 12 e anotar", em: null, extra: "concluida", concluido: true },
      ],
      lista_notas: [
        { id: "n1", texto: "Atalhos do Blender", em: Date.now() - 5 * 86400000, extra: null, concluido: false },
      ],
    };
  },
  abrir_mini: () => null,
  fechar_mini: () => null,
  expandir: () => null,
  mini_no_topo: () => null,
  mini_altura: () => null,
  supabase_estado: () => ({
    configurado: true,
    conectado: true,
    email: "eu@exemplo.com",
  }),
  supabase_salvar_config: () => null,
  supabase_entrar: () => null,
  supabase_sair: () => null,
  supabase_recuperar_senha: () => null,
  abrir_notebooklm: () => null,
  gerar_pacote: ({ caminho }: any) => ({
    caminho,
    bytes: 41_300,
    sessoes: 38,
    notas: 3,
    notas_ocultas: 1,
    tarefas: 9,
  }),
  supabase_trocar_senha: () => null,
  supabase_encerrar_outras: () => null,
  supabase_apagar_nuvem: () => 128,
  supabase_maquinas: () => [
    { origem: "9f3c1a7e-0b21-4c5d-9e88-1122aabbccdd", lido_em: Date.now() - 4 * 60000,
      esta_maquina: true, operacoes: 412 },
    { origem: "2b71d0c4-88ae-49f1-bb03-5566778899aa", lido_em: Date.now() - 26 * 3600_000,
      esta_maquina: false, operacoes: 96 },
  ],
  exportar_dados: ({ caminho }: any) => ({
    caminho,
    bytes: 184_320,
    linhas: [
      ["settings", 6], ["activity_types", 8], ["activity_goals", 3],
      ["subjects", 2], ["platforms", 2], ["courses", 3], ["course_tags", 2],
      ["tasks", 9], ["time_entries", 412], ["notes", 3], ["note_tags", 5],
      ["time_favorites", 2], ["session_revisions", 11],
      ["open_intervals", 0], ["audit_events", 24],
    ],
  }),
  supabase_sql: () =>
    "create table if not exists public.sync_operations (...);\n-- ver supabase.rs",
  sync_pendencias: () => ({
    na_fila: 4,
    conflitos: 1,
    ultima_leitura: Date.now() - 8 * 60000,
  }),
  sync_agora: () => ({
    enviadas: 4,
    recebimento: { aplicadas: 7, ignoradas: 2, conflitos: 1 },
    erro: null,
  }),
  sync_conflitos: () => [
    {
      id: "cf1",
      entidade: "notes",
      registro_id: "n1",
      motivo: "nota editada nos dois lados",
      origem: "outra-maquina",
      criado_em: Date.now() - 300000,
      payload_remoto: "{}",
    },
  ],
  sync_resolver: () => null,
  obsidian_config: () => ({
    pasta: "D:\\vault\\Estudos",
    somente_criar: false,
    exportar_diario: true,
    exportar_cursos: true,
    exportar_notas: false,
    modelo_diario: "---\ntipo: diario-de-estudo\ndata: {{data}}\n---\n\n# {{data}}\n\nEstudo efetivo: **{{estudo}}**\n\n## Sessoes\n\n{{sessoes}}\n",
  }),
  obsidian_salvar_config: () => null,
  obsidian_exportar: () => ({
    criados: ["diario/2026-09-02.md"],
    atualizados: ["cursos/Unidaystudio - Blender para jogos.md"],
    preservados: ["cursos/T2 - Fundamentos de renda variavel.md"],
    erros: [],
  }),
  obsidian_conflitos: () => [
    { caminho: "cursos/T2 - Fundamentos de renda variavel.md", conflito_em: Date.now() - 90000 },
  ],
  obsidian_aceitar_externo: () => null,
  git_estado: () => ({
    repositorio: "D:/vault", ramo: "main", remoto: "origin",
    pendentes: ["Estudos/diario/2026-09-02.md"], fora_do_escopo: 3,
    atras: 0, adiante: 2, erro: null,
  }),
  git_sincronizar: () => ({
    passos: ["commit de 1 arquivo(s)", "atualizado a partir de origin/main", "enviado"],
    commitou: true, enviou: true, conflitos: [], erro: null,
  }),
  mcp_info: () => ({
    porta: 47823,
    token: "mcpmcpmcpmcpmcpmcpmcpmcpmcpmcpmc",
    config: {
      habilitado: true, leitura: true, escrita: true,
      ferramentas: { criar_tarefa: true, concluir_tarefa: true,
                     criar_nota: false, controlar_cronometro: true },
    },
  }),
  mcp_salvar_config: () => null,
  mcp_revogar: () => "novo-token",
  listar_auditoria: () => [
    { id: "a1", origem: "mcp", acao: "criar_nota", detalhe: '{"titulo":null}',
      resultado: "recusado", created_at: Date.now() - 120000 },
    { id: "a2", origem: "mcp", acao: "criar_tarefa",
      detalhe: '{"titulo":"Revisar aula 13"}', resultado: "ok",
      created_at: Date.now() - 300000 },
    { id: "a3", origem: "mcp", acao: "ler_planejamento", detalhe: "{}",
      resultado: "ok", created_at: Date.now() - 420000 },
  ],
  listar_tags: () => ["blender", "renda-variavel", "retopologia", "duvida"],
  salvar_nota: () => "nova",
  excluir_nota: () => null,
  fixar_nota: () => null,
  revisar_nota: () => null,
  listar_notas: ({ busca, tag, revisarAte }) => {
    const base = [
      { id: "n1", titulo: "Retopologia — o que travou",
        conteudo: "## O que aprendi\nO fluxo de retopologia manual no Blender depende de snap ativo.\n\n## Em uma frase\nSnap primeiro, malha depois.",
        modelo: "resumo", course_id: "c1", curso: CURSOS[0].titulo,
        task_id: null, tarefa: null, time_entry_id: "e4", revisar_em: null,
        revisada_em: null, disponivel_para_ia: true, fixada: true,
        created_at: Date.now() - 3600000, updated_at: Date.now() - 3600000,
        tags: ["blender", "retopologia"] },
      { id: "n2", titulo: null,
        conteudo: "## O que nao entendi\nDiferenca pratica entre ordem a mercado e ordem limitada quando o livro esta fino.\n\n## Onde procurar\nAula 13 e o material complementar.",
        modelo: "duvidas", course_id: "c2", curso: CURSOS[1].titulo,
        task_id: null, tarefa: null, time_entry_id: null,
        revisar_em: isoDia(0), revisada_em: null, disponivel_para_ia: false,
        fixada: false, created_at: Date.now() - 86400000,
        updated_at: Date.now() - 86400000, tags: ["renda-variavel", "duvida"] },
      { id: "n3", titulo: "Proximo passo do curso de Blender",
        conteudo: "## Proximo passo\nRefazer o exercicio da aula 12 do zero, sem olhar a solucao.",
        modelo: "proxima_acao", course_id: "c1", curso: CURSOS[0].titulo,
        task_id: null, tarefa: null, time_entry_id: null, revisar_em: null,
        revisada_em: null, disponivel_para_ia: false, fixada: false,
        created_at: Date.now() - 5 * 86400000, updated_at: Date.now() - 5 * 86400000,
        tags: ["blender"] },
    ];
    let r = base;
    if (busca) r = r.filter((n) => (n.conteudo + (n.titulo ?? "")).toLowerCase().includes(busca.toLowerCase()));
    if (tag) r = r.filter((n) => n.tags.includes(tag));
    if (revisarAte) r = r.filter((n) => n.revisar_em && n.revisar_em <= revisarAte && !n.revisada_em);
    return r;
  },
  paleta: () => [
    { nome: "azul", clara: "#2a78d6", escura: "#3987e5" },
    { nome: "laranja", clara: "#eb6834", escura: "#d95926" },
    { nome: "verde-água", clara: "#1baf7a", escura: "#199e70" },
    { nome: "amarelo", clara: "#eda100", escura: "#c98500" },
    { nome: "magenta", clara: "#e87ba4", escura: "#d55181" },
    { nome: "verde", clara: "#008300", escura: "#008300" },
    { nome: "violeta", clara: "#4a3aa7", escura: "#9085e9" },
    { nome: "vermelho", clara: "#e34948", escura: "#e66767" },
  ],
  criar_tipo: () => "novo",
  editar_tipo: () => null,
  excluir_tipo: () => null,
  reordenar_tipos: () => null,
  salvar_meta: () => null,
  excluir_meta: () => null,
  // Uma meta de cada forma: faixa, só piso e só teto — e uma delas estourada,
  // para o estado "acima do teto" aparecer sem precisar simular.
  listar_metas: () => [
    { id: "g1", activity_type_id: "at-estudo", atividade: "Estudo",
      cor: "#2a78d6", cor_escura: "#3987e5", periodo: "semana",
      min_minutos: 600, max_minutos: 1200 },
    { id: "g2", activity_type_id: "at-academia", atividade: "Academia",
      cor: "#eb6834", cor_escura: "#d95926", periodo: "semana",
      min_minutos: 180, max_minutos: null },
    { id: "g3", activity_type_id: "at-descanso", atividade: "Descanso",
      cor: "#e87ba4", cor_escura: "#d55181", periodo: "dia",
      min_minutos: null, max_minutos: 30 },
  ],
  "plugin:event|listen": () => 1,
  "plugin:window|is_maximized": () => false,
  "plugin:window|minimize": () => null,
  "plugin:window|toggle_maximize": () => null,
  "plugin:window|close": () => null,
  "plugin:event|unlisten": () => null,
  // O seletor de arquivo é do sistema; na prévia ele devolve um caminho de
  // mentira só para a tela seguir adiante.
  "plugin:dialog|save": () => "C:\Users\voce\Downloads\estudos.json",
  pomodoro_config: () => cfgPomo,
  pomodoro_salvar_config: () => null,
  pomodoro_estado: () => ({
    ativo: pomo.ativo,
    fase: pomo.fase,
    rotulo: pomo.rotulo,
    aguardando: pomo.aguardando,
    rotulo_aguardando: pomo.rotulo_aguardando,
    focos: pomo.focos,
    ciclos_ate_longa: pomo.ciclos_ate_longa,
    decorrido_ms: pomo.fase ? Date.now() - pomo.inicio : 0,
    planejado_ms: pomo.fase ? pomo.planejado_ms : 0,
    descricao: pomo.descricao,
    pausada: false,
    activity_type_id: pomo.activity_type_id,
  }),
  pomodoro_ciclos: () => {
    if (!pomo.ativo) return [];
    const t0 = pomo.inicio - 62 * 60000;
    const c = (rot: string, ativ: string, cor: string, escura: string,
               off: number, dur: number, plan: number | null, aberto = false) => ({
      id: `c${off}`,
      activity_type_id: rot === "Foco" ? "at-estudo" : ativ === "Caminhada com os dogs" ? "at-caminhada" : "at-pausa",
      rotulo: rot, atividade: ativ, cor, cor_escura: escura,
      inicio: t0 + off * 60000,
      fim: aberto ? null : t0 + (off + dur) * 60000,
      efetivo_ms: (aberto ? (Date.now() - (t0 + off * 60000)) / 60000 : dur) * 60000,
      planejado_ms: plan === null ? null : plan * 60000,
    });
    return [
      c("Foco", "Estudo", "#2a78d6", "#3987e5", 0, 25, 25),
      c("Pausa", "Caminhada com os dogs", "#1baf7a", "#199e70", 25, 7, 5),
      c("Foco", "Estudo", "#2a78d6", "#3987e5", 32, 28, 25),
      c("Pausa", "Pausa", "#4a3aa7", "#9085e9", 60, 2, 5),
      c("Foco", "Estudo", "#2a78d6", "#3987e5", 62, 0, 25, true),
    ];
  },
  pomodoro_iniciar: ({ descricao }) => {
    pomo = { ...pomo, ativo: true, fase: "foco", rotulo: "Foco", aguardando: null,
             rotulo_aguardando: null, focos: 0, inicio: Date.now(),
             descricao: descricao || "" };
    return null;
  },
  pomodoro_avancar: () => {
    if (pomo.aguardando) {
      pomo = { ...pomo, fase: pomo.aguardando, rotulo: pomo.rotulo_aguardando,
               aguardando: null, rotulo_aguardando: null, inicio: Date.now(),
               planejado_ms: 5 * 60000 };
    } else {
      pomo = { ...pomo, fase: null, rotulo: null, focos: pomo.focos + 1,
               aguardando: "pausa_curta", rotulo_aguardando: "Pausa curta" };
    }
    return null;
  },
  pomodoro_encerrar: () => {
    pomo = { ...pomo, ativo: false, fase: null, aguardando: null };
    return null;
  },
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
  listar_periodo: ({ inicio, fim }) => {
    const v = lancamentos
      .filter((l) => l.started_at < fim && l.ended_at > inicio)
      .map((l) => ({ ...l, sobrepoe: false }))
      .sort((a, b) => a.started_at - b.started_at);
    let maior: number | null = null;
    v.forEach((l, i) => {
      if (maior !== null && l.started_at < v[maior].ended_at) {
        l.sobrepoe = true;
        v[maior].sobrepoe = true;
      }
      if (maior === null || l.ended_at > v[maior].ended_at) maior = i;
    });
    return v;
  },
  // O calendário só prova que funciona se o bloco criado aparecer — por isso o
  // mock escreve mesmo no array, em vez de devolver um id de mentira.
  criar_lancamento: (a: any) => {
    const id = `m${Date.now()}`;
    lancamentos.push(
      monta(id, a.inicio, a.fim, a.activityTypeId, a.descricao ?? null, a.cursoId ?? null)
    );
    return id;
  },
  editar_lancamento: (a: any) => {
    const l = lancamentos.find((x) => x.id === a.id);
    if (l) {
      l.started_at = a.inicio;
      l.ended_at = a.fim;
      l.activity_type_id = a.activityTypeId;
      l.description = a.descricao ?? null;
      l.atividade = cor(a.activityTypeId).nome;
      l.cor = cor(a.activityTypeId).cor;
      l.cor_escura = cor(a.activityTypeId).cor_escura;
      l.conta_como_estudo = cor(a.activityTypeId).conta_como_estudo;
      l.course_id = a.cursoId ?? null;
      l.curso = a.cursoId ? CURSOS.find((c) => c.id === a.cursoId)!.titulo : null;
    }
    return null;
  },
  excluir_lancamento: (a: any) => {
    const i = lancamentos.findIndex((x) => x.id === a.id);
    if (i >= 0) lancamentos.splice(i, 1);
    return null;
  },
  buscar_lancamentos: (a: any) => {
    const q = (a.texto ?? "").toLowerCase();
    const v = lancamentos
      .filter(
        (l) =>
          (!q ||
            (l.description ?? "").toLowerCase().includes(q) ||
            (l.curso ?? "").toLowerCase().includes(q)) &&
          (!a.desde || l.started_at >= a.desde) &&
          (!a.cursoId || l.course_id === a.cursoId) &&
          (!a.tipoId || l.activity_type_id === a.tipoId)
      )
      .sort((x, y) => y.started_at - x.started_at);
    return {
      itens: v.slice(a.deslocamento, a.deslocamento + a.limite),
      total: v.length,
      total_ms: v.reduce((s, l) => s + (l.ended_at - l.started_at), 0),
      estudo_ms: v.reduce(
        (s, l) => s + (l.conta_como_estudo ? l.ended_at - l.started_at : 0),
        0
      ),
    };
  },
  listar_favoritos: () => [
    { id: "fv1", rotulo: "Blender de manhã", descricao: "Aula do dia",
      activity_type_id: "at-estudo", atividade: "Estudo", cor: "#4f8ef7",
      course_id: "c1", curso: CURSOS[0].titulo, task_id: null },
    { id: "fv2", rotulo: "Treino", descricao: null,
      activity_type_id: "at-academia", atividade: "Academia", cor: "#e2803c",
      course_id: null, curso: null, task_id: null },
  ],
  criar_favorito: () => "fv3",
  listar_materias: () => [
    { id: "m1", nome: "Modelagem 3D", cor: null, total_ms: 22 * 3600_000 },
    { id: "m2", nome: "Renda variável", cor: null, total_ms: 9 * 3600_000 },
  ],
  criar_materia: () => "m3",
  editar_materia: () => null,
  excluir_materia: () => null,
  salvar_vinculos: () => null,
  reclassificar_lancamento: () => null,
  listar_recentes: () => [
    { activity_type_id: "at-caminhada", atividade: "Caminhada com os dogs",
      descricao: "Volta no parque com os dogs", course_id: null,
      cor: "#1baf7a", icone: "cachorro", quando: Date.now() - 3600_000 },
    { activity_type_id: "at-academia", atividade: "Academia", descricao: "Treino B",
      course_id: null, cor: "#eb6834", icone: "halter", quando: Date.now() - 7200_000 },
    { activity_type_id: "at-estudo", atividade: "Estudo",
      descricao: "Retopologia e UV", course_id: "c1",
      cor: "#2a78d6", icone: "livro", quando: Date.now() - 10800_000 },
  ],
  salvar_detalhes: () => null,
  atualizar_bandeja: () => null,
  excluir_favorito: () => null,
  duplicar_lancamento: () => "novo",
  dividir_lancamento: () => ["a", "b"],
  unir_lancamentos: () => "unido",
  atalhos_ler: () => "{}",
  atalhos_salvar: () => null,
  pomodoro_pausar: () => { pomo.fase = null; return null; },
  pomodoro_retomar: () => null,
  timer_editar: ({ descricao, activityTypeId }: any) => {
    if (rodando) rodando.descricao = descricao;
    // Reclassificar a fase precisa aparecer no estado seguinte, senão a tela
    // parece não ter feito nada.
    if (activityTypeId) pomo.activity_type_id = activityTypeId;
    return respostas.timer_status({});
  },
  timer_ajustar_inicio: ({ inicio }: any) => {
    if (rodando) rodando.inicio = inicio;
    return respostas.timer_status({});
  },
  timer_continuar: ({ entryId }: any) => {
    const l = lancamentos.find((x) => x.id === entryId);
    rodando = { inicio: Date.now(), descricao: l?.description ?? "" };
    pausado = null;
    return respostas.timer_status({});
  },
  timer_favorito: () => {
    rodando = { inicio: Date.now(), descricao: "Blender de manhã" };
    pausado = null;
    return respostas.timer_status({});
  },
  timer_pausar: () => {
    if (rodando) {
      pausado = { acumulado: Date.now() - rodando.inicio, descricao: rodando.descricao };
      rodando = null;
    }
    return respostas.timer_status({});
  },
  timer_retomar: () => {
    if (pausado) {
      rodando = { inicio: Date.now(), descricao: pausado.descricao, acumulado: pausado.acumulado };
      pausado = null;
    }
    return respostas.timer_status({});
  },
  timer_recover: () => null,
  ponte_info: () => ({ porta: 47823, token: "mockmockmockmockmockmockmockmock" }),
  timer_status: () =>
    rodando
      ? {
          session: "mock",
          entry_id: "mock-entry",
          description: rodando.descricao,
          wall_ms: Date.now() - rodando.inicio,
          mono_ms: Date.now() - rodando.inicio,
          drift_ms: 0,
          acumulado_ms: rodando.acumulado ?? 0,
          pausado: false,
          curso_id: null,
          tarefa_id: null,
          inicio_wall: rodando.inicio,
        }
      : pausado
      ? {
          session: "",
          entry_id: "mock-entry",
          description: pausado.descricao,
          wall_ms: 0,
          mono_ms: 0,
          drift_ms: 0,
          acumulado_ms: pausado.acumulado,
          pausado: true,
          curso_id: null,
          tarefa_id: null,
          inicio_wall: 0,
        }
      : null,
  timer_start: ({ description }) => {
    rodando = { inicio: Date.now(), descricao: description };
    pausado = null;
    return {};
  },
  timer_stop: () => {
    rodando = null;
    pausado = null;
    return {};
  },
};

// `listen()` cancela o ouvinte ao desmontar a tela, e a limpeza passa por
// aqui. Sem este objeto ela estourava toda vez que a tela de Foco saía —
// erro do mock, não do app, mas que polui o console e esconde os de verdade.
(window as any).__TAURI_EVENT_PLUGIN_INTERNALS__ = {
  unregisterListener: () => {},
};

(window as any).__TAURI_INTERNALS__ = {
  // Sem `metadata`, `getCurrentWindow()` lanca e a barra de titulo propria
  // some da previa — justamente a parte que precisa ser conferida.
  metadata: {
    currentWindow: { label: location.search.includes("mini") ? "mini" : "main" },
    currentWebview: { windowLabel: "main", label: "main" },
  },
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
