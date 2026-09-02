/**
 * Servidor MCP do Estudos.
 *
 * Ele não abre o banco. Fala com o app pela mesma ponte HTTP local que a
 * extensão do Chrome usa, com um token próprio — e é isso que faz a segurança
 * ser real em vez de declarada:
 *
 *   * as invariantes (cronômetro único, versionamento, revisões) continuam num
 *     lugar só, dentro do app, e este processo não consegue burlá-las;
 *   * o filtro de "nota disponível para a IA" acontece no servidor do app, não
 *     aqui. Um bug neste arquivo não vaza nota nenhuma;
 *   * permissão e auditoria também são do app. Este processo pede; quem decide
 *     é o outro lado.
 *
 * Configuração por variável de ambiente:
 *   ESTUDOS_TOKEN  — token de MCP, copiado de Configurações no app
 *   ESTUDOS_PORTA  — padrão 47823
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const PORTA = process.env.ESTUDOS_PORTA || "47823";
const TOKEN = process.env.ESTUDOS_TOKEN || "";
const BASE = `http://127.0.0.1:${PORTA}`;

if (!TOKEN) {
  console.error(
    "[estudos-mcp] ESTUDOS_TOKEN não definido. Copie o token em Configurações → Claude Desktop."
  );
}

async function ponte(rota, opcoes = {}) {
  let r;
  try {
    r = await fetch(BASE + rota, {
      ...opcoes,
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
        ...(opcoes.headers || {}),
      },
    });
  } catch {
    // Erro de conexão é o caso comum, não excepcional: o app fechado é a
    // situação normal fora das horas de estudo. A mensagem precisa dizer o que
    // fazer, não o código do erro.
    throw new Error(
      "O aplicativo Estudos não está aberto. Abra-o e tente de novo — a ponte vive dentro dele."
    );
  }

  const corpo = await r.json().catch(() => ({}));
  if (r.status === 401)
    throw new Error("Token recusado pelo app. Gere outro em Configurações e atualize a configuração do Claude Desktop.");
  if (r.status === 403)
    throw new Error(corpo.erro || "Ação não autorizada nas permissões do app.");
  if (!r.ok) throw new Error(corpo.erro || `O app respondeu ${r.status}.`);
  return corpo;
}

const texto = (v) => ({
  content: [{ type: "text", text: typeof v === "string" ? v : JSON.stringify(v, null, 2) }],
});

const servidor = new McpServer({ name: "estudos", version: "0.1.0" });

const p2 = (n) => String(n).padStart(2, "0");
const hojeIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
};

// --- leitura ---------------------------------------------------------------

servidor.tool(
  "planejamento",
  "Tarefas planejadas de um dia ou intervalo de dias, com estimado e realizado. Datas em AAAA-MM-DD.",
  { dia: z.string().optional(), ate: z.string().optional() },
  async ({ dia, ate }) => {
    const d = dia || hojeIso();
    const q = new URLSearchParams({ dia: d, ate: ate || d });
    return texto(await ponte(`/planejamento?${q}`));
  }
);

servidor.tool(
  "resumo_de_tempo",
  "Quanto tempo foi registrado nos últimos N dias, separado por atividade e por curso. Só as atividades marcadas como estudo contam como tempo estudado.",
  { dias: z.number().int().min(1).max(365).optional() },
  async ({ dias }) => texto(await ponte(`/resumo?dias=${dias ?? 7}`))
);

servidor.tool(
  "cursos",
  "Cursos cadastrados no app.",
  {},
  async () => texto((await ponte("/estado")).cursos)
);

servidor.tool(
  "notas",
  "Notas que o usuário marcou explicitamente como disponíveis para a IA. Notas não marcadas nunca são devolvidas — o filtro é do app, não deste servidor.",
  { busca: z.string().optional() },
  async ({ busca }) => {
    const q = busca ? `?busca=${encodeURIComponent(busca)}` : "";
    return texto(await ponte(`/notas${q}`));
  }
);

// --- escrita ---------------------------------------------------------------
// Todas passam por permissão no app e ficam na auditoria, aceitas ou recusadas.

servidor.tool(
  "criar_tarefa",
  "Cria uma tarefa no planejamento. Se `dia` for omitido, a tarefa fica sem data.",
  {
    titulo: z.string().min(1),
    dia: z.string().optional(),
    curso_id: z.string().optional(),
    duracao_min: z.number().int().positive().optional(),
  },
  async (a) =>
    texto(await ponte("/tarefas", { method: "POST", body: JSON.stringify(a) }))
);

servidor.tool(
  "concluir_tarefa",
  "Marca uma tarefa como concluída. Use o id vindo de `planejamento`.",
  { id: z.string().min(1) },
  async (a) =>
    texto(
      await ponte("/tarefas/concluir", { method: "POST", body: JSON.stringify(a) })
    )
);

servidor.tool(
  "criar_nota",
  "Cria uma nota. Ela nasce invisível para a IA: para relê-la depois, o usuário precisa marcá-la no app.",
  {
    conteudo: z.string().min(1),
    titulo: z.string().optional(),
    curso_id: z.string().optional(),
    tags: z.array(z.string()).optional(),
  },
  async (a) => texto(await ponte("/notas", { method: "POST", body: JSON.stringify(a) }))
);

servidor.tool(
  "iniciar_cronometro",
  "Começa a contar tempo de estudo. Falha se já houver um cronômetro rodando.",
  { descricao: z.string(), curso_id: z.string().optional() },
  async (a) =>
    texto(await ponte("/timer/iniciar", { method: "POST", body: JSON.stringify(a) }))
);

servidor.tool(
  "parar_cronometro",
  "Encerra o cronômetro em andamento e grava o lançamento de tempo.",
  {},
  async () => texto(await ponte("/timer/parar", { method: "POST" }))
);

await servidor.connect(new StdioServerTransport());
