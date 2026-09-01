# Decisões

Registro das decisões tomadas e das que continuam abertas. Cada uma tem data,
o que foi decidido e por quê — para não reabrir discussão já encerrada.

## D-001 — Stack: Tauri 2 + React + TypeScript + Rust
**2026-09-01 · decidido**

Mantida a stack do plano original. A alternativa considerada foi Electron, que
elimina por construção o risco de DRM no Linux (Chromium + Widevine embarcados,
mesmo motor nos dois SOs) ao custo de ~150 MB de bundle.

Decisão: seguir com Tauri e **medir** o comportamento do WebView2 e do WebKitGTK
no spike da Fase 0 antes de escrever código de produção da Fase 2.

**Gatilho de reversão:** se o spike mostrar que aula com DRM não reproduz no
WebKitGTK e o modo navegador dedicado se provar ruim de usar, reabrir D-001.

## D-002 — Alvo: pessoal agora, produto depois
**2026-09-01 · decidido**

O app é ferramenta pessoal na v1. Consequências:

- Fase 3 (conta, servidor, RLS) sai do caminho crítico.
- Fase 6 (instaladores assinados, telemetria, política de privacidade) idem.
- **Mas** o modelo de dados nasce sincronizável: todo registro com `id` (UUID),
  `created_at`, `updated_at`, `deleted_at` (soft delete), `device_id` e versão
  lógica — mesmo sem servidor. Retrofit de sync em modelo não preparado é caro.
- Métricas de §2 do plano (retenção semanal/mensal, taxa de falha por SO) ficam
  suspensas: não fazem sentido com um usuário.

## D-003 — Windows primeiro; Linux é marco posterior
**2026-09-01 · decidido** (revisto no mesmo dia)

Versão original: os dois sistemas eram bloqueantes na Fase 0.

Revisão: o ambiente Linux é **outro computador**, não dual boot nem VM. Testar
lá custa troca de máquina a cada iteração, o que trava o ritmo por um risco que
não bloqueia nada do trabalho local. Então:

- a Fase 0 fecha só com a coluna Windows da matriz;
- Linux vira marco próprio, rodado em lote quando houver o que testar;
- **a consequência precisa ficar consciente:** D-001 só pode ser reavaliada de
  verdade depois do teste no Linux. Até lá, seguir com Tauri é uma aposta em
  aberto, não uma decisão validada. Quanto mais código de Fase 2 for escrito
  antes disso, mais caro fica reverter.

Mitigação: a Fase 1 (fundação local) não depende do motor de webview. Dá para
avançar bastante sem aumentar a exposição a esse risco. Já a Fase 2 não deveria
começar antes da coluna Linux existir.

## D-004 — Modo de abertura é por curso, não por plataforma
**2026-09-01 · decidido**

Na Hotmart, DRM é opção do produtor: dois cursos da mesma conta podem se
comportar de forma diferente. Logo "Hotmart: aprovado" nunca será verdadeiro.

Cada curso ganha o campo `modo_de_abertura`: `integrado` | `navegador_dedicado`
| `auto`. Em `auto`, o app tenta integrado e cai para o dedicado quando o player
falhar, gravando o resultado no curso para não repetir a falha.

Isso vira requisito de §3.6 do plano, não item de teste.

## D-005 — Um modelo de tempo, não três
**2026-09-01 · decidido**

`time_entries` + `time_segments` + `pomodoro_cycles` se sobrepõem, e sobreposição
em modelo de dados vira erro de totalização. Ver `03-modelo-de-tempo.md`.

## D-006 — Importação da Hotmart nunca é pré-requisito
**2026-09-01 · decidido**

Cadastro por link e cadastro manual são o caminho principal e precisam ser bons
o bastante para a importação assistida ser só conveniência. A importação lê o
DOM da página em que o usuário já está logado, sempre disparada por clique dele.

---

# Perguntas abertas

## ~~Q-001 — Ambiente Linux de teste~~ · respondida em 2026-09-01
Outro computador. Testes em lote, depois da versão Windows. Ver D-003.


## Q-002 — Corte de MVP
O plano tem 6 fases e nenhuma linha dizendo qual é a menor versão utilizável.
Proposta: Fase 1 completa (cursos + planejamento + timer + relatório local,
offline, sem conta) é a v0.1 e já deve ser usada de verdade antes da Fase 2.

## Q-003 — Métricas pessoais
Com D-002, §2 do plano precisa de objetivos pessoais em vez de métricas de
produto. O que você quer conseguir responder olhando os relatórios?
