# Estudos

Aplicativo de gestão de estudos: cursos, planejamento diário, registro flexível
de tempo, Pomodoro e uma visão macro da rotina. Windows, Linux e Android,
funcionando offline.

O estudo em si acontece no **Chrome** — uma extensão salva a aula em que você
está e inicia o cronômetro sem sair da página. O app cuida da gestão.

## Como está organizado

| Caminho | O que é |
|---|---|
| `app/` | aplicativo Tauri 2 (React + TypeScript + Rust) |
| `extensao/` | extensão do Chrome (MV3) |
| `mcp/` | servidor MCP para o Claude Desktop |
| `docs/00-plano.md` | plano completo do produto |
| `docs/01-decisoes.md` | **decisões tomadas, com data e motivo** |
| `docs/02-fase0-spike.md` | o spike técnico e o que ele revelou |
| `docs/03-modelo-de-tempo.md` | modelo de dados do registro de tempo |
| `docs/04-pendencias.md` | o que falta, o que foi cortado e o que **não foi verificado** |
| `docs/05-empacotamento.md` | como gerar os instaladores |
| `docs/06-linux.md` | montar e testar no Linux, do zero |
| `docs/07-android.md` | o que vai e o que não vai para o celular, e por quê |

Quem for mexer no código: comece por `01-decisoes.md`. Boa parte do que parece
arbitrário está explicado lá, incluindo as escolhas que foram revertidas.

## O que já funciona

O app abre no **Planejamento** — o que fazer agora, não o resumo do que já
passou (D-039).

- **Planejamento** — tarefas por dia e semana, atrasadas, planejado × realizado,
  e o cronômetro começando pela tarefa. Mistura estudo, exercício e descanso.
- **Tempo** — quatro recortes da mesma tabela: o dia, a semana, o calendário
  (bloco criado, movido e esticado com o mouse) e o histórico com busca por
  período, curso, matéria, tarefa, tipo e etiqueta.
- **Cronômetro** — pausar e retomar, trocar curso ou descrição rodando,
  corrigir a hora de início sem parar, continuar um lançamento anterior,
  favoritos, duplicar, dividir e unir, e sobreposição visível em vez de
  proibida.
- **Foco** — Pomodoro com o ciclo correndo no processo do app e notificação do
  sistema, para funcionar com a janela minimizada.
- **Cursos** — página por curso com professor, capa, estado, meta, prazo,
  progresso, tempo recente e o que está ligado a ele; guarda a rota da última
  aula.
- **Notas** — busca, tags, modelos, revisão, e nota rápida amarrada à sessão.
- **Painel** — estudo por dia, sequência, onde foi o tempo, cursos parados.
- **Modo compacto** — janela pequena, sempre no topo, com relógio, Pomodoro e
  um menu rápido de cursos. É a que faz sentido ficar visível enquanto o estudo
  acontece no navegador.
- **Bandeja do sistema** — atividades recentes a um clique, sem abrir a janela.
- **Extensão do Chrome** — salvar a rota e controlar o cronômetro de dentro da
  página da aula.
- **Claude Desktop por MCP** — leitura e escrita com permissão por ferramenta,
  auditoria, e nota só visível para a IA se marcada.
- **Obsidian e NotebookLM** — exportação para o vault (com o git cuidando da
  sincronização) e um pacote de fontes em Markdown por curso ou período.

Os dados vivem num **SQLite local** e o app funciona inteiro sem conta. A
sincronização por Supabase é opcional e serve a um caso só: as suas máquinas
convergirem. Sem ela, nada sai do computador.

No **Android** o app é um companheiro de bolso, não o desktop espremido — vale
a pena ler o porquê em `docs/07-android.md` antes de estranhar uma ausência.

## Rodar

```bash
cd app
npm install
npm run tauri dev
```

O ícone é gerado por código, sem editor gráfico:

```bash
cd app/src-tauri/icons && node gerar-icone.mjs && cd ../.. && npx tauri icon src-tauri/icons/origem.png
```

Pré-requisitos: Node 20+, Rust estável. No Windows, WebView2 Runtime e o
workload C++ do Visual Studio; no Linux, `webkit2gtk-4.1` e
`libayatana-appindicator`.

A extensão é carregada sem compactação em `chrome://extensions`, apontando para
`extensao/`. O token de pareamento fica em Configurações, dentro do app.

## Histórico

O branch [`legado-2025`](../../tree/legado-2025) guarda a primeira tentativa
deste projeto, de julho de 2025 — outra arquitetura, com backend separado.
