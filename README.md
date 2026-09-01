# Estudos

Aplicativo desktop de gestão de estudos: cursos online, planejamento diário,
Pomodoro, registro flexível de tempo, modo foco e notas. Windows e Linux.

## Onde as coisas estão

| Caminho | O que é |
|---|---|
| `docs/00-plano.md` | plano completo do produto (fonte da verdade do escopo) |
| `docs/01-decisoes.md` | decisões tomadas, com data e motivo, e perguntas abertas |
| `docs/02-fase0-spike.md` | o que o spike precisa provar + matriz de compatibilidade |
| `docs/03-modelo-de-tempo.md` | modelo de dados do registro de tempo |
| `app/` | aplicativo Tauri 2 (React + TypeScript + Rust) |

## Estado

**Fase 0 — spike técnico.** O código em `app/` é descartável e existe só para
preencher a matriz de compatibilidade. A Fase 1 começa quando a matriz estiver
preenchida nos dois sistemas operacionais.

## Rodar

```bash
cd app
npm install
npm run tauri dev
```

Pré-requisitos: Node 20+, Rust estável, e — no Windows — WebView2 Runtime e o
workload C++ do Visual Studio; no Linux, `webkit2gtk-4.1` e `libayatana-appindicator`.
