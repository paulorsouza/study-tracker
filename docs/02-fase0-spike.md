# Fase 0 — spike técnico

> **ENCERRADA em 2026-09-01.** O spike cumpriu o papel: provou que o modo
> integrado era viável tecnicamente no Windows *e* que era pior de usar que o
> navegador dedicado. A segunda descoberta valeu mais que a primeira e levou a
> D-007 — o app deixou de abrir conteúdo de plataforma.
>
> A matriz abaixo fica como registro histórico. A maior parte das linhas deixou
> de importar: sem webview embarcada não há motor para testar. O que sobreviveu
> foram os achados, especialmente A-005 (vazamento em log de diagnóstico) e o
> teste do cronômetro em P4, que continua valendo.

Código deliberadamente descartável. Existe para responder quatro perguntas que
travam decisões caras. Nada aqui precisa ser bonito, testado ou reaproveitado —
mas o **resultado** é obrigatório antes da Fase 1.

## As quatro provas

### P1 — Login e sessão persistente
Entrar na Hotmart e na T2 dentro de uma janela do app, fechar o app, reabrir e
continuar logado. Sem copiar cookie de navegador nenhum.

**Aprova se:** sessão sobrevive a reinício do app nos dois sites, nos dois SOs.

### P2 — Reprodução de aula
Abrir uma aula real e tocar o vídeo: play, pause, velocidade, legenda e tela
cheia, quando o player oferecer.

**Aprova se:** vídeo toca sem travar e a tela cheia é reversível pelo app.

### P3 — DRM (a prova que decide a stack)
Detectar se o player usa Widevine e se o motor embarcado consegue tocar. O
painel de diagnóstico do spike reporta, por página:

- `navigator.requestMediaKeySystemAccess('com.widevine.alpha')` → suportado?
- a página chegou a pedir uma key session?
- erros de mídia no console

**Aprova se:** ou o conteúdo não usa DRM, ou usa e toca. Reprova se usa DRM e
não toca — nesse caso o curso cai para navegador dedicado (D-004), e se isso
valer para a maioria dos cursos, reabre D-001.

### P4 — Cronômetro através de suspensão e reinício
O relógio monotônico (QPC no Windows) **não avança durante suspensão**, e o
relógio de parede pode ser alterado pelo usuário. Nenhum dos dois sozinho
resolve. O desenho testado aqui:

- ao iniciar, grava `inicio_parede` e `inicio_monotonico`;
- um heartbeat grava os dois a cada 5 s em arquivo append-only;
- na retomada, `delta_parede - delta_monotonico` revela quanto tempo a máquina
  passou suspensa;
- lacuna entre heartbeats acima do limiar = app morto ou máquina dormindo →
  vira um **intervalo em aberto**, nunca contado como estudo em silêncio.

**Aprova se:** depois de suspender 10 min e de matar o processo à força, o tempo
registrado bate com o tempo real de estudo, e cada lacuna aparece como pergunta
ao usuário — sem inventar nem descartar tempo sozinho.

## Matriz de compatibilidade

Preencher durante o spike. `—` = não testado.

| Cenário | Win / WebView2 | Linux / WebKitGTK | Observação |
|---|---|---|---|
| Hotmart — login e-mail+senha | — | — | |
| Hotmart — login via Google OAuth | **OK** | — | WebView2 não foi bloqueado pelo Google |
| Hotmart — verificação em duas etapas | — | — | |
| Hotmart — sessão após reiniciar app | — | — | |
| Hotmart — curso no Club, sem DRM | — | — | |
| Hotmart — curso no Club, com DRM | — | — | **decide D-001** |
| Hotmart — produto em área externa | — | — | |
| Hotmart — tela cheia do player | — | — | |
| Hotmart — material para download | — | — | |
| Hotmart — link que abre nova janela | — | — | |
| T2 — login | — | — | |
| T2 — sessão após reiniciar app | — | — | |
| T2 — reprodução de aula | — | — | |
| T2 — tela cheia | — | — | |
| Timer — suspensão de 10 min | — | — | |
| Timer — hibernação | — | — | |
| Timer — kill do processo | — | — | |
| Timer — relógio do sistema alterado | — | — | |

## Fora do spike

Banco, sincronização, planejamento, notas, Pomodoro, Obsidian, MCP, relatórios,
design system. Se aparecer vontade de construir qualquer um deles aqui, a
resposta é não — vai para a Fase 1.

---

# Achados

## A-001 — Janela de curso ficava sem saída
**2026-09-01**

No primeiro teste do modo integrado a janela abriu e não fechava. Causa provável:
site que entra em tela cheia por conta própria engole as decorações da janela, e
como a página remota não tem canal de volta para o app (por decisão de
segurança), não sobrava nenhum controle.

Correção: o controle passou para a janela principal, que lista as janelas de
curso abertas e oferece **Fechar** e **Sair da tela cheia**. Isso é o §3.9 do
plano ("recuperar controles se o site também entrar em tela cheia") aparecendo
mais cedo do que o previsto — e não é gambiarra de spike, é o desenho certo:
quem não pode ter privilégio é a página, não o usuário.

## A-002 — Painel de diagnóstico não aparecia na página remota
**2026-09-01**

O overlay aplicava estilo via `setAttribute('style', ...)`. Páginas com
`style-src` estrita bloqueiam o **atributo** `style`, e o painel virava texto
sem formatação perdido no rodapé da página. CSSOM (`el.style.x = y`) não é
alcançado pela CSP — a correção foi trocar a forma de aplicar o estilo.

Achado mais importante do que a correção: **depender de script injetado em
página de terceiro é frágil por natureza.** A sonda de CDM foi movida para a
janela principal, que é página nossa. Disponibilidade de Widevine é propriedade
do motor, não da origem, então a pergunta que decide D-001 é respondida sem
tocar na Hotmart. Na página remota ficou só o que de fato precisa estar lá:
saber se *aquele curso específico* pede DRM.

## A-003 — Deadlock ao criar janela em comando síncrono
**2026-09-01**

Sintoma: a janela de curso abria em branco e não respondia ao fechamento.

Causa: Tauri executa comando síncrono na thread principal, e
`WebviewWindowBuilder::build()` bloqueia esperando essa mesma thread. Deadlock —
a janela é criada, mas nunca pinta e nunca processa mensagens de janela. Foi
diagnosticado errado duas vezes antes (CSP, tela cheia) porque "branca e travada"
parecia problema de conteúdo, e era de threading.

Correção: `abrir_curso`, `fechar_curso` e `sair_tela_cheia` viraram `async`, o
que faz o Tauri executá-los no runtime assíncrono. Regra geral para este
projeto: **todo comando que cria ou destrói janela é `async`.**

## A-004 — P1 aprovado na Hotmart, incluindo OAuth do Google
**2026-09-01**

Com o deadlock resolvido, a cadeia completa de login rodou dentro do WebView2:
`consumer.hotmart.com` → SSO da Hotmart → contas Google → callback → `/main`.

O resultado que vale registrar é o segundo: **o Google não bloqueou a webview
embarcada.** Login federado recusando webview ("este navegador pode não ser
seguro") era um risco Alto de §17 do plano, com o modo navegador dedicado como
única resposta. No Windows, esse risco não se materializou.

Continua em aberto no Linux, onde o WebKitGTK apresenta outro user-agent.

## A-005 — A instrumentação vazou o fluxo OAuth para o log
**2026-09-01**

O `on_page_load` registrava a URL completa. Numa cadeia OAuth a query string
carrega `code`, `state` e `session_state` — e é o `code` que se troca por token
de sessão. O log de desenvolvimento ficou com a sequência inteira do login em
texto puro, violando §8 do plano ("logs sem tokens... ou URLs sensíveis
completas").

Correção: o log agora registra só esquema, host e caminho.

Vale a lição, porque ela vai se repetir: **o vazamento não nasceu no código de
produção, nasceu no código de diagnóstico.** Qualquer instrumentação futura que
toque URL, cabeçalho ou corpo de requisição precisa nascer redigida — a regra de
§8 vale para o log temporário do dev igual ao log do app instalado.

## A-006 — Curso não abria: pedido de nova janela descartado
**2026-09-01**

A plataforma abre a aula com `target="_blank"` / `window.open`. Webview
embarcada **descarta o pedido de nova janela sem erro nenhum** — o clique
simplesmente não faz nada, sem console, sem falha de rede, sem sintoma.

Correção: o script injetado intercepta os dois casos e redireciona para a mesma
janela. Com isso a navegação até a aula do Club funcionou.

Este é o item "links que abrem nova janela" de §12 do plano, e vale promovê-lo
de caso de teste a **requisito**: qualquer plataforma nova vai precisar do mesmo
tratamento, e o sintoma é mudo — sem instrumentação de navegação não há como
diagnosticar.

## A-007 — Sessão pedida de novo após reinício
**2026-09-01 · inconclusivo**

Depois de um reinício, a Hotmart redirecionou para `/login` em vez de `/main`.
Mas o reinício foi por `taskkill /F` durante a depuração, e o WebView2 grava
cookie de forma preguiçosa — kill à força perde o que estava em memória.

Pendente: fechar o app pela janela, reabrir e verificar. Só então isto vira
resultado de P1. O perfil em si persiste (`AppData/Local/com.prs.estudos/EBWebView`
existe e é reaproveitado), então não é diretório volátil.

Observação colhida no caminho: o perfil traz uma pasta `WidevineCdm` — o
WebView2 embarca o CDM, coerente com a sonda da janela principal.

## A-008 — O spike foi bem-sucedido ao ser descartado
**2026-09-01**

O modo integrado funcionou: login OAuth passou, a aula abriu, o Widevine existe
no WebView2. Tecnicamente aprovado — e mesmo assim abandonado, porque no uso
real o Chrome ganha: a sessão já está lá, o caminho até a aula é mais curto e o
player é o que o usuário conhece.

Vale registrar porque contraria o instinto: as três correções que fiz no modo
integrado (deadlock, CSP, nova janela) foram todas legítimas e todas jogadas
fora. **Isso é o spike funcionando, não desperdiçado** — quatro horas de código
descartável evitaram construir a Fase 2 inteira sobre uma premissa que o uso
real derrubaria.

O critério que decidiu não estava na matriz de compatibilidade. Nenhuma linha
dela perguntava "isto é melhor do que o que o usuário já faz hoje?".
