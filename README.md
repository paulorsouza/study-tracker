# Estudos

Aplicativo desktop de gestão de estudos: cursos, planejamento diário, registro
flexível de tempo, Pomodoro e uma visão macro da rotina. Windows e Linux,
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

Quem for mexer no código: comece por `01-decisoes.md`. Boa parte do que parece
arbitrário está explicado lá, incluindo as escolhas que foram revertidas.

## O que já funciona

- **Painel** — estudo por dia, sequência, onde foi o tempo, cursos parados.
- **Hoje** — linha do tempo do dia, lançamento manual, edição com desfazer.
- **Planejamento** — tarefas por dia e semana, atrasadas, planejado × realizado,
  e o cronômetro começando pela tarefa.
- **Foco** — Pomodoro com o ciclo correndo no processo do app e notificação do
  sistema, para funcionar com a janela minimizada.
- **Cursos** — cada curso guarda a rota da última aula.
- **Notas** — busca, tags, modelos, revisão, e nota rápida amarrada à sessão.
- **Extensão do Chrome** — salvar a rota e controlar o cronômetro de dentro da
  página da aula.
- **Claude Desktop por MCP** — leitura e escrita com permissão por ferramenta,
  auditoria, e nota só visível para a IA se marcada.

Sem conta, sem servidor, sem nuvem: tudo em SQLite local.

## Rodar

```bash
cd app
npm install
npm run tauri dev
```

Pré-requisitos: Node 20+, Rust estável. No Windows, WebView2 Runtime e o
workload C++ do Visual Studio; no Linux, `webkit2gtk-4.1` e
`libayatana-appindicator`.

A extensão é carregada sem compactação em `chrome://extensions`, apontando para
`extensao/`. O token de pareamento fica em Configurações, dentro do app.

## Histórico

O branch [`legado-2025`](../../tree/legado-2025) guarda a primeira tentativa
deste projeto, de julho de 2025 — outra arquitetura, com backend separado.
