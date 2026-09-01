# Fase 0 — spike técnico

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
