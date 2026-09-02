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

**ENCERRADA em 2026-09-01 — Tauri, sem ressalva.** Ver D-007: o modo integrado
foi abandonado. Sem webview embarcada não há risco de DRM, não há matriz de
motor para manter e não há motivo para Electron. O argumento que sustentava a
alternativa deixou de existir.

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

## D-007 — Sem webview embarcada; navegador dedicado + extensão do Chrome
**2026-09-01 · decidido**

O modo integrado foi testado e perdeu para o navegador dedicado em uso real: no
Chrome o login já está feito, o caminho até a aula é mais curto e o player é o
que o usuário conhece. Nenhuma das correções do spike (interceptar nova janela,
capturar última URL) compensou essa diferença.

Decisão: **o app não abre conteúdo de plataforma.** Ele cuida da gestão —
cursos, planejamento, tempo, notas, relatórios — e o estudo acontece no Chrome.

A ponte é uma **extensão do Chrome**: estando na aula, o usuário salva aquela
rota como curso e inicia o cronômetro sem sair da página.

Consequências, todas de redução:

- Fase 2 do plano deixa de existir como estava. Sobram deep links e a extensão.
- §3.9 (navegador de estudo e modo foco) sai do MVP: modo foco dentro do app
  não faz sentido se o estudo acontece fora dele.
- §3.7 (central Hotmart) encolhe: nada de importação assistida por DOM. A
  extensão salva a rota da aula em que o usuário já está, que é mais confiável
  e não quebra com mudança de layout — D-006 levado às últimas consequências.
- D-004 (`modo_de_abertura` por curso) perde sentido: só existe um modo. O
  campo continua no esquema por ora, mas sem uso.
- A matriz de compatibilidade de §11 encolhe para o que o app faz sozinho.
- Some o risco "conteúdo remoto alcançar funções nativas" de §17, que era o
  único classificado como Crítico: não há mais conteúdo remoto dentro do app.

**O que entra no lugar do risco que saiu:** a ponte local entre extensão e app
vira a nova superfície de ataque. Ver D-008.

## D-008 — Ponte por HTTP local com token, não native messaging
**2026-09-01 · decidido**

A extensão precisa falar com o app. Três caminhos considerados:

| Caminho | Por quê não / por quê sim |
|---|---|
| Native messaging | Instalação exige registrar manifesto no registro do Windows apontando para um executável, e o processo hospedeiro é separado do app já rodando. Fricção alta para ganho nenhum aqui. |
| Protocolo `estudos://` | Só ida, sem resposta. Serve para "salvar rota", não para a extensão mostrar o cronômetro rodando. |
| **HTTP em 127.0.0.1** | Bidirecional, depurável, sem instalação extra. Escolhido. |

Regras de segurança, porque um servidor local é alcançável por qualquer coisa
na máquina — inclusive por página web comum, já que o navegador **permite**
requisição a `localhost`:

- escuta só em `127.0.0.1`, nunca em `0.0.0.0`;
- toda rota exige `Authorization: Bearer <token>`. O token é gerado pelo app e
  colado uma vez nas opções da extensão;
- exigir o cabeçalho não é detalhe: ele força *preflight* CORS, e é isso que
  impede um site qualquer de disparar escrita no app pelo navegador do usuário;
- CORS liberado só para a origem `chrome-extension://`;
- nenhuma rota aceita caminho de arquivo, comando ou URL para abrir — a
  extensão manda dado, não ação sobre o sistema.

## D-009 — Sistema visual: cor saturada é reservada para dado
**2026-09-01**

A interface tinha cara de ferramenta de diagnóstico. A passada de redesenho
fixou duas regras que valem para tudo que vier depois:

1. **Cor saturada só para dado.** As categorias de atividade são a única coisa
   vivamente colorida na tela. Se botões e cabeçalhos também fossem, a cor
   deixaria de significar "isto é uma categoria" e viraria decoração.
2. **Número que se compara é tabular.** Durações alinhadas em coluna são a
   diferença entre ler e conferir.

Estrutura: navegação lateral fixa com o cronômetro ancorado no rodapé dela —
começar a contar fica a um clique de qualquer tela, que é o "dois cliques" de
§9 do plano. Tema claro e escuro por tokens; alto contraste fica para depois.

A janela abria em 760px de largura, estreita demais para lateral + conteúdo.
Passou para 1120 com mínimo de 880, largura em que a interface foi conferida.

## D-010 — Mock de desenvolvimento para a interface
**2026-09-01**

`npm run dev` abre a interface no navegador, onde `invoke` não existe — toda
tela aparece vazia e não dá para avaliar layout nem densidade. `src/mock-dev.ts`
instala um backend falso, só quando `import.meta.env.DEV` é verdadeiro **e** o
app não está dentro do Tauri. Confirmado ausente do bundle de produção.

Os dados de exemplo são propositalmente irregulares — sessões curtas, buracos
no meio do dia, um curso parado há meses. Dado bonitinho esconde justamente os
casos que quebram layout.

## D-011 — A tarefa é o começo da sessão, não um item de lista
**2026-09-01**

O indicador nº 1 de §2 do plano é "percentual de sessões iniciadas a partir do
planejamento diário". Esse número só sobe se começar pela tarefa for **mais
fácil** que apertar o cronômetro solto — então cada tarefa tem um botão de play
que já vincula curso e tarefa ao lançamento.

Consequência no modelo: `time_entries.task_id` passa a ser preenchido pelo
cronômetro, e "planejado versus realizado" vira uma soma na consulta, não um
total guardado. Total guardado desatualiza na primeira edição de lançamento.

**Fora desta primeira versão, de propósito:** recorrência diária/semanal,
modelos de rotina e blocos de horário. Recorrência exige decidir quando
materializar as ocorrências e como não duplicá-las na sincronização (§12 do
plano cobra isso explicitamente) — é uma decisão que merece estar sozinha, não
carona numa entrega de tela.

## D-012 — A paleta das categorias foi trocada porque reprovou no validador
**2026-09-01**

As cores semeadas originalmente foram escolhidas no olho, para tema escuro.
Rodadas num validador de paleta categórica, reprovaram no tema claro em três
checagens:

- **faixa de luminosidade** — quatro cores claras demais para a superfície;
- **piso de croma** — Pausa e Pessoal liam como cinza, e cinza significa
  "sem dado";
- **piso de visão normal** — o par Pausa/Estudo ficava com ΔE 12,2, abaixo do
  mínimo de 15. Difícil de distinguir **mesmo com visão de cores completa**.

Trocada por uma paleta validada nos dois temas (`migrations/002`). Três coisas
que passam despercebidas e ficam registradas:

1. **Um tom não serve para os dois temas.** O passo escuro é escolhido contra a
   superfície escura; não é o claro clareado. Daí a coluna `cor_escura`.
2. **A ordem das categorias é o mecanismo de segurança**, não estética: são os
   pares *vizinhos* que precisam se separar. Reordenar sem revalidar quebra a
   acessibilidade em silêncio.
3. **Três cores do tema claro ficam abaixo de 3:1 de contraste.** Isso é
   aceitável só porque toda categoria aparece com nome escrito ao lado — a
   identidade nunca depende só da cor.

A migração só troca a linha que ainda está com a cor original: personalização
do usuário sobrevive.

## D-013 — O painel faz uma consulta só
**2026-09-01**

Todos os blocos — hoje, semana, sequência, média, série diária, por curso, por
atividade — saem do mesmo conjunto de lançamentos, buscado uma vez com a janela
mais longa de que qualquer bloco precisa (90 dias).

O motivo não é desempenho: é que números do mesmo painel vindos de consultas
diferentes **discordam entre si** na virada do dia ou quando um lançamento é
editado no meio. Uma fonte, uma verdade.

Regras de gráfico adotadas: série única é cor única (barra mais escura porque é
maior codificaria o comprimento duas vezes); nada de eixo duplo; rótulo direto
só no melhor dia, o resto no hover; grade em fio sólido, nunca tracejado.

## D-014 — O ciclo do Pomodoro corre no Rust
**2026-09-01**

Não é preferência por backend: é o cenário real deste produto. Com D-007, o
usuário estuda **no Chrome**, e a janela do Estudos fica minimizada. Navegador
estrangula `setInterval` em janela sem foco, então um Pomodoro cronometrado no
frontend atrasaria exatamente nas horas em que precisa funcionar.

Pelo mesmo motivo a **notificação sai do Rust**, não da API de JavaScript: com a
janela escondida, a interface pode nem estar renderizando. Notificar de dentro
do processo é o que garante o aviso chegar — e sem aviso que chega, um Pomodoro
para quem estuda fora do app é decorativo.

Consequência prática: a interface só pergunta o estado e desenha. Se ela
estiver fechada, o ciclo continua igual.

## D-015 — Nenhuma tabela para o Pomodoro
**2026-09-01**

Cada foco e cada pausa é uma linha de `time_entries` (D-005). O identificador da
sessão é o `id` da primeira entrada de foco, e todas as linhas da sessão —
inclusive ela — apontam para esse valor em `parent_id`; a primeira aponta para
si mesma.

A auto-referência não é truque: `parent_id` tem chave estrangeira para
`time_entries`, então um id de sessão inventado não existiria como linha e a
inserção falharia. Assim, "todas as linhas da sessão X" é `WHERE parent_id = X`,
sem exceção para a primeira e sem tabela de sessão.

Coluna nova `planejado_ms` (migração 003): quanto a fase deveria durar. §3.4
pede planejado versus efetivo, e o efetivo já saía dos timestamps.

A sessão em andamento é gravada em `settings`, não só em memória: fechar o app
no meio de um ciclo não pode zerar a contagem de focos, senão a pausa longa
nunca chega na hora certa.

## D-016 — O MVP é o produto completo, de uso pessoal
**2026-09-02**

Q-002 ficou aberta desde o primeiro dia. A resposta: **não há corte**. O alvo é
o §3 inteiro do plano, para uma pessoa.

Isso não reabre o que já foi descartado — D-007 continua valendo, e a Fase 2
(navegador embarcado, modo foco dentro do app) segue fora, não por corte de
escopo mas porque perdeu no uso real. "Completo" é o conjunto de funcionalidades
que sobrou depois das decisões, não o plano original intacto.

O que falta, em ordem de dependência:

| Bloco | §  | Observação |
|---|---|---|
| Notas e revisão | 3.10 | nenhuma linha escrita ainda; é o maior buraco |
| Relatórios e exportação | 3.11 | painel existe, exportação CSV/JSON/Markdown não |
| Recorrência e modelos de rotina | 3.3 | adiado em D-011, com motivo registrado |
| Sincronização entre as duas máquinas | Fase 3 | volta ao caminho crítico: Windows **e** Linux são usados |
| Obsidian | Fase 4 | depende de notas existirem |
| MCP para o Claude Desktop | Fase 5 | depende de notas e relatórios |
| Empacotamento e atualização | Fase 6 | reduzido: sem loja, sem telemetria |

**O que muda de verdade:** a sincronização sai da geladeira. Com uso pessoal
num computador só ela era dispensável; com duas máquinas reais e o produto
completo, ela vira requisito — e é o bloco mais caro de todos. O modelo de
dados já nasceu preparado (D-002), o que era exatamente a aposta.

## D-017 — Metas têm piso e teto, e nenhum dos dois é obrigatório
**2026-09-02**

Meta de um número só responde uma pergunta. A rotina tem duas: *"estudei o
bastante?"* e *"descansei demais?"*. Então cada categoria pode ter piso, teto,
ou os dois — e ao menos um, senão a meta não diz nada (o banco recusa).

Estudo costuma querer piso. Lazer, teto. Academia os dois, porque treinar de
menos e treinar de mais são problemas distintos.

Três decisões de apresentação que valem registro:

1. **Situação vira texto, nunca só cor.** "faltam 2h para o piso" e "40m acima
   do teto" são coisas diferentes, e nenhuma é erro. Cor sozinha excluiria quem
   não distingue as duas — e o plano pede que relatório não classifique o
   usuário como produtivo ou não.
2. **A faixa aceitável fica atrás da barra, em tom neutro.** Ela é referência,
   não um segundo dado disputando atenção.
3. **Período padrão é semana**, não dia. Dia é rígido demais para rotina real, e
   o plano é explícito em não punir pausa.

## D-018 — Categoria nova escolhe cor de uma paleta fechada
**2026-09-02**

O usuário passou a criar, renomear, reordenar e apagar categorias. A cor **não**
vem de um seletor livre: sai das oito da paleta validada.

Não é limitação por preguiça. Cor de categoria é identidade em gráfico, e um tom
escolhido no olho pode ficar indistinguível de outro — foi exatamente o que
aconteceu com a paleta original deste projeto (D-012), que reprovou em três
checagens. Oito é o teto real: além disso não há como manter a separação entre
pares, e uma nona cor gerada colidiria com alguma existente.

Duas proteções que vêm junto:

- **`ordem` é acessibilidade, não estética.** A separação exigida é entre pares
  *vizinhos*, então a sequência faz parte da validação. Reordenar é operação
  explícita, e a interface diz por quê.
- **`at-estudo` e `at-pausa` não podem ser apagadas** — o cronômetro e o
  Pomodoro as referenciam por id. O app recusa com explicação em vez de deixar
  quebrar depois. Renomear continua liberado: o nome é do usuário, o id é do
  sistema.

---

# Perguntas

Todas respondidas. Ficam registradas porque a resposta explica decisões.

## ~~Q-001 — Ambiente Linux de teste~~ · respondida em 2026-09-01
Outro computador. Testes em lote, depois da versão Windows. Ver D-003.


## ~~Q-002 — Corte de MVP~~ · respondida em 2026-09-02
**Não há corte: o MVP é o produto completo, para uso pessoal.** Ver D-016.

## ~~Q-003 — Métricas pessoais~~ · respondida em 2026-09-02
Respondida na prática, em duas partes: "um dash com visão macro, bem simples"
(painel entregue em 2026-09-01) e metas de piso e teto por categoria (D-017).
As métricas não são de desempenho — são de **equilíbrio da rotina**.

## D-019 — O servidor MCP não abre o banco
**2026-09-02**

Claude Desktop sobe servidores MCP como subprocesso por stdio, então o caminho
óbvio seria o servidor abrir o SQLite direto. Recusado: ele viraria um **segundo
escritor**, e as invariantes do produto (cronômetro único por dispositivo,
versionamento, histórico de revisões, exclusão lógica) vivem no Rust do app, não
no esquema. Duplicá-las num processo separado é como elas divergem.

O servidor MCP é um **adaptador fino sobre a ponte HTTP** que a extensão já usa.
Três consequências que valem mais que a economia de código:

1. **O filtro de nota está no app, não no adaptador.** `GET /notas` só devolve
   linha com `disponivel_para_ia = 1`. Um defeito no servidor MCP não vaza nota
   nenhuma — ele simplesmente não recebe o que não foi liberado.
2. **Permissão e auditoria ficam num lugar só.** Não existe caminho que escreva
   sem passar por elas.
3. **Herda a trava de token.** Nada de superfície de rede nova.

O custo: o app precisa estar aberto. É a mesma restrição da extensão, e é
honesta — a ponte vive dentro do app.

## D-020 — Dois tokens, e a escrita nasce desligada
**2026-09-02**

Token da extensão e token do MCP são distintos. Não é preciosismo: eles são
revogáveis separadamente e têm alcances diferentes. Se o token da extensão vazar
num backup do perfil do Chrome, revogá-lo não pode derrubar a integração com o
Claude Desktop.

Camadas de permissão do MCP, todas verificadas no app:

| Camada | Padrão | Por quê |
|---|---|---|
| Integração ativa | **desligada** | um MCP recém-instalado não deve ler nada |
| Leitura | ligada | inútil sem isso, e não altera nada |
| Escrita | **desligada** | criar e apagar por padrão é a configuração errada |
| Cada ferramenta | ligada | só vale com escrita ligada; §4.2 pede desligar uma a uma |

Toda escrita vai para `audit_events` — **inclusive as recusadas**, que são
justamente as que interessa investigar depois. O detalhe gravado é cortado em
400 caracteres: auditoria é rastro, não cópia do conteúdo, senão o próprio log
vira o vazamento.

Revogar troca o token e vale no pedido seguinte: a ponte relê o token a cada
requisição em vez de guardá-lo na subida.

## D-021 — Obsidian é exportação, não sincronização
**2026-09-02**

Foi levantada a ideia de o app virar repositório de dados para manter o vault
sincronizado entre as duas máquinas. **Recusada.**

Sincronizar vault é problema resolvido — Git com obsidian-git, Syncthing, ou o
Sync oficial. Para o app assumir esse papel seria preciso construir um motor de
sincronização de arquivos arbitrários com resolução de conflito em Markdown, o
que é **mais difícil** que sincronizar nossos dados estruturados, que ainda nem
existe. Seria construir um Syncthing pior.

**O que resolve a intenção sem construir nada:** o vault já sincronizado por
uma dessas ferramentas, e o app escrevendo dentro dele. As notas exportadas
viajam junto de graça. Não cobre tempo e tarefas — mas cobre a metade que é
texto, hoje, sem código de sincronização nenhum.

Isso também não elimina a Fase 3: sincronizar `time_entries` entre as máquinas
continua sendo problema nosso, e continua sendo o bloco mais caro.

## D-022 — Nunca sobrescrever edição no vault, e como isso é garantido
**2026-09-02**

§17 marca "Obsidian ter nota sobrescrita" como risco Alto. Um vault é trabalho
de anos e a perda não tem desfazer.

O mecanismo não depende de o usuário configurar nada: antes de reescrever, o app
compara o conteúdo em disco com o **hash do que ele mesmo gravou** da última
vez. Igual, atualiza. Diferente, recua e registra conflito. Arquivo sem registro
nosso também não é tocado — sem registro, o arquivo é de outra pessoa.

Guardar hash e não conteúdo é deliberado: o conteúdo já está no vault, e
duplicá-lo no banco criaria uma segunda cópia para divergir.

Segurança de caminho, que §13 cobra explicitamente:

- todo destino é montado a partir da raiz canonizada, segmento por segmento;
- `..`, `.`, segmento vazio e barra invertida dentro de segmento são recusados;
- o diretório pai é canonizado e conferido contra a raiz — é este passo que pega
  **link simbólico apontando para fora do vault**;
- título de curso ou nota passa por saneamento antes de virar nome de arquivo.

Cinco testes cobrem isso. Um deles pegou um erro **meu** durante a escrita: eu
tinha previsto a saída errada do saneamento. O código estava certo, a
expectativa não — e é exatamente para isso que o teste existe.

O modo **somente criar** existe para quem não quer risco algum: o app cria
arquivos novos e nunca mexe em existente. O custo é o diário não se atualizar
durante o dia.

## D-023 — O app orquestra o git; não sincroniza
**2026-09-02**

Complemento de D-021, e uma distinção que não é retórica: **construir
sincronização** (diferença, mesclagem, resolução de conflito em Markdown) fica
recusado; **chamar o git** para fazer isso é aceito e implementado.

Regras que definem o comportamento:

1. **`git add` só na pasta de exportação, nunca `-A`.** O vault quase sempre é
   um repositório com outras coisas dentro. Commitar tudo empacotaria o
   rascunho que o usuário estava escrevendo naquele instante. A tela mostra
   quantas alterações ficam de fora, para isso ser visível e não silencioso.
2. **Nenhuma credencial passa pelo app.** O `push` usa o que o git já tem
   configurado na máquina. O app roda com `GIT_TERMINAL_PROMPT=0` para não
   travar esperando um prompt que ninguém vai ver.
3. **Conflito não vira meia-mesclagem.** Rebase que falha é abortado, o
   repositório volta ao estado anterior, e o app diz quais arquivos
   conflitaram. Vault parado no meio de um rebase é o estado que ninguém sabe
   desfazer.
4. **Nunca `push --force`.** Reescrever histórico do vault da outra máquina é
   perda de trabalho, não sincronização.

**O risco que fica com o usuário, e por isso está escrito na tela:** o plugin
obsidian-git também faz commit automático. Dois processos commitando o mesmo
repositório sem se coordenar é como se cria commit no meio de uma edição. O app
tem o cuidado de tocar só no que é dele; o commit automático do plugin não tem.
Escolher um dos dois é decisão do usuário, e ela precisa ser consciente.

Quatro testes rodam contra um git de verdade — remoto nu e dois clones — e
cobrem o caminho feliz entre duas máquinas, o escopo do `add`, o aborto em
conflito e o caso sem remoto. Dois deles pegaram expectativas erradas minhas
durante a escrita.

**O que isto ainda não resolve:** `time_entries` e tarefas continuam sem
sincronizar. Isto cobre o vault, que é texto. A Fase 3 segue de pé.

## D-024 — Sincronização: a arquitetura da §7, com Supabase por pessoa
**2026-09-02**

Adotada a arquitetura planejada em §7, sem desvio: fila de operações na mesma
transação da escrita, operações idempotentes, cursor, e área de recuperação
para o que não pode ser aplicado.

**Transporte: Supabase, um projeto por pessoa.** Não existe backend
compartilhado — some o problema mais caro de um serviço multi-inquilino, e não
há banco meu com dado de estudo de ninguém.

Duas decisões de implementação que valem mais que o resto:

**A fila é preenchida por gatilho, não por chamada de função.** Isso torna a
garantia estrutural. Com chamadas espalhadas pelos módulos, basta alguém
acrescentar um `UPDATE` novo e esquecer a linha da fila para aquela mudança
sumir da sincronização — e o sintoma aparece semanas depois, na outra máquina,
como dado que nunca chegou. Com gatilho, é impossível escrever sem enfileirar.
Verificado escrevendo direto no banco, por fora do app: a fila encheu.

**Um interruptor (`sync_estado.aplicando`) desliga os gatilhos ao aplicar o que
veio de fora.** Sem ele a escrita viraria operação nova, voltaria para a outra
máquina, e as duas ficariam trocando a mesma mudança para sempre. Verificado:
escrita com o interruptor ligado não gerou operação; a escrita local seguinte
voltou a gerar.

**Idempotência sai de graça.** Reaplicar uma operação não faz nada na segunda
vez: a versão local já é igual e o conteúdo idêntico, então a função sai antes
de escrever. Não é preciso guardar quais operações já foram vistas — o que
também torna inofensivo o reenvio depois de uma queda no meio.

Regras de conflito, todas de §7:

| Situação | O que acontece |
|---|---|
| versão remota menor | ignora — estamos à frente |
| versões iguais, conteúdo diferente | **edição concorrente real**: vira conflito, o app não escolhe |
| exclusão remota × edição local mais recente | conflito; a edição local fica de pé |
| nota editada dos dois lados | as duas versões preservadas |
| lançamentos de tempo distintos | ambos ficam; sobreposição é sinalizada, nunca descartada |

## D-025 — Onde cada segredo mora
**2026-09-02**

- **Chave `anon`**: no banco local, em texto. É pública por desenho no
  Supabase — quem protege as linhas é a política de acesso por usuário, não o
  sigilo da chave. Escondê-la daria falsa sensação de segurança.
- **Token de renovação**: no **cofre de credenciais do sistema** (Gerenciador
  de Credenciais no Windows, keyring no Linux), como §3.1 exige. É o que impede
  que uma cópia do arquivo do banco entregue a sessão junto.
- **Senha**: nunca guardada. Vai uma vez para o Supabase e o app esquece.

O Supabase rotaciona o token de renovação a cada uso, então guardar o novo é
obrigatório — sem isso a sincronização seguinte encontraria um token queimado.

## D-026 — Janela compacta: só relógio e Pomodoro
**2026-09-02**

§3.5 pede "timer compacto sempre acessível". Com D-007, o estudo acontece no
Chrome e a janela principal fica escondida a maior parte do tempo — então é a
compacta que faz sentido ficar visível, não a completa.

390×112, sem decoração do sistema, arrastável pela própria barra, sempre no
topo (desafixável), fora da barra de tarefas — é acessório da janela principal,
não uma segunda instância do app.

Três decisões:

1. **As duas janelas partilham o mesmo pacote** e se distinguem pelo rótulo. Um
   segundo `index.html` duplicaria a configuração do Vite e o carregamento do
   React para não ganhar nada.
2. **Fechar a compacta não para nada.** O relógio e o ciclo correm no processo
   do app desde D-014; ela só mostra e comanda.
3. **Os comandos que criam janela são `async`**, pela mesma razão de A-003 —
   comando síncrono trava a thread principal e a janela nasce em branco. A
   lição de setembro voltou a valer aqui.

Em desenvolvimento, `?mini` na URL renderiza a compacta no navegador: dá para
ajustar estilo sem recompilar o Rust a cada mudança.

## D-027 — Configurações em seções, e por que o visual mudou
**2026-09-02**

Tema, categorias, metas, sincronização, Obsidian, MCP e extensão empilhados
numa página só produziam uma rolagem em que nada era achável. **Isso não é
problema de estilo, é de estrutura** — dividir em Aparência, Categorias e
metas, Sincronização e Integrações resolve o que nenhuma cor resolveria.

No sistema visual, o que mudou e por quê:

- **quatro degraus de superfície** em vez de dois, para profundidade vir de
  superfície e sombra curta em vez de borda dura. Borda grossa em tudo é o que
  faz interface parecer formulário antigo;
- **escala de espaço em múltiplos de quatro**. Valor avulso é o que produz
  aquele desalinhamento que ninguém sabe nomear mas todo mundo percebe;
- **marca fina à esquerda na seção ativa**, porque o preenchimento sozinho
  praticamente some para quem enxerga pouco contraste;
- as regras `[data-tema="claro"]` espalhadas para corrigir trilhos **sumiram**:
  com a escala de superfície, o mesmo token serve nos dois temas.

## D-028 — Barra de título própria e ícone gerado por código
**2026-09-02**

A decoração do sistema foi desligada na janela principal para ela combinar com
o resto da interface. Isso **transfere responsabilidade**: minimizar, maximizar,
fechar e a área de arrasto passam a ser nossos, e sem os três controles a
janela ficaria sem saída. O vermelho aparece só no hover do fechar — é o único
controle cujo engano custa caro, e realce permanente viraria ruído.

**Ponto a verificar em uso:** com a decoração desligada, o redimensionamento
pelas bordas depende do comportamento do Tauri no Windows. Se não funcionar, é
reverter uma linha de configuração.

O ícone é **gerado por código** (`icons/gerar-icone.mjs`), sem editor gráfico e
sem dependência: desenha um anel de progresso — a mesma forma que o Pomodoro
mostra dentro do app — num ladrilho arredondado, com suavização por
superamostragem 3×3. Repetir uma forma que o usuário já vê é reconhecido mais
rápido que um símbolo novo.

As pastas de Android e iOS que o `tauri icon` cria foram removidas: aplicativo
móvel está fora do escopo em §16, e elas só engordariam o repositório.

## D-029 — A janela compacta é troca de modo, não segunda janela
**2026-09-02**

Ajustes depois do primeiro uso:

- **abre no canto inferior direito**, não no centro. Janela sempre-no-topo no
  meio da tela atrapalha exatamente o que está atrás dela — o navegador onde o
  estudo acontece;
- **lembra onde foi deixada**. Sem isso o usuário a arrasta para o mesmo canto
  toda vez, que é o atrito que faz um acessório deixar de ser usado;
- **a janela principal some** enquanto a compacta está aberta, e volta ao
  fechar ou expandir. Duas janelas do mesmo app disputando a barra de tarefas é
  confusão, não recurso. Fechar a compacta traz a principal de volta: sem isso
  o app sumiria da vista sem ter encerrado.

O menu de cursos **cresce a janela** em vez de flutuar: janela sem decoração
recorta o que passa da borda, então um painel sobreposto simplesmente não
apareceria.

Nele, clicar no nome abre o curso e o botão de play abre **e** começa a contar
— duas ações explícitas em vez de uma. Ligar o cronômetro como efeito colateral
de abrir uma página é o tipo de surpresa que faz o registro deixar de ser
confiável.

## D-030 — Exportação e tela de Relatórios ficam fora
**2026-09-02**

§3.11 pedia exportação CSV/JSON, relatório semanal em Markdown e uma tela de
Relatórios com corte por mês, matéria, Pomodoros concluídos e horários de maior
consistência. **Cortados.**

O que já existe cobre a pergunta que o plano queria responder: o Painel mostra
estudo por dia, por curso, por atividade, sequência e metas; a exportação para o
Obsidian já leva sessões, tarefas e notas para fora do app em Markdown.

O que se perde, para ficar registrado: não há como abrir os dados numa planilha,
nem consultar por mês ou por matéria, nem ver quantos Pomodoros foram
interrompidos. Se algum desses virar pergunta real durante o uso, o item volta —
mas volta por necessidade demonstrada, não por estar no plano original.

---

## D-031 — a capa do curso fica na máquina, o endereço é que viaja

A capa entra no banco como `data:` URL, e não como arquivo nem como URL remota:
`img-src` já aceita `data:`, enquanto liberar `https:` faria a janela do app
buscar imagem em host arbitrário toda vez que a tela abrisse.

São duas colunas de propósito. `capa_url` é o endereço e entra no payload de
sincronização; `capa` é a imagem e **não** entra. Capa é decoração, e centenas
de kilobytes por operação não valem o custo na fila — a outra máquina baixa
sozinha a partir do endereço, quando o usuário quiser.

Isso expôs dois defeitos reais no motor de sincronização, os dois corrigidos:

- `INSERT OR REPLACE` apagava a linha e reinseria, zerando qualquer coluna
  ausente do payload. A capa local sumiria ao aplicar uma alteração vinda da
  outra máquina. Virou `ON CONFLICT(id) DO UPDATE SET`, que só toca as colunas
  que chegaram.
- As tags viajavam no payload mas só eram gravadas de volta para `notes`. Um
  curso etiquetado numa máquina chegava sem etiqueta na outra. A tabela filha
  agora sai de `tabela_de_tags()`, e a próxima entidade com tags acrescenta uma
  linha em vez de descobrir o silêncio semanas depois.

---

## D-032 — pausar fecha o segmento; o Pomodoro pausa por fase

Pausar **não** deixa a linha aberta atravessando o intervalo parado. Fecha o
segmento e abre outro ao retomar, com o mesmo `parent_id` — a mesma âncora que
o Pomodoro já usava, com a primeira entrada apontando para si mesma.

Duas razões, e nenhuma é de estilo:

- `activity_type` é a verdade cronológica do dia
  (`03-modelo-de-tempo.md`). Uma linha que engolisse o almoço faria o total do
  dia mentir, e o total do dia é o número em que o app pede para acreditar.
- Segmento fechado sobrevive a queda de energia. É a razão de o módulo do
  cronômetro existir; deixar tempo só na memória a contradiz.

O Pomodoro pausa por outro caminho, de propósito. Ali o que precisa sobreviver
é a **fase**, com o que falta dela: `gasto_ms` guarda o que já correu e retomar
abre o restante. Sem isso, pausar viraria uma forma silenciosa de esticar o
ciclo de 25 minutos.

Os atalhos de teclado ficam **dentro do app**, não registrados no sistema. Um
atalho global sequestraria a tecla dentro do Chrome — que é exatamente onde o
usuário estuda (D-007). Quem escuta é a interface; o Rust só guarda o mapa.

Unir lançamentos recusa em vez de adivinhar: categorias ou cursos diferentes
quebrariam o total por atividade, e mais de 30 minutos de intervalo entre eles
inflaria o dia em silêncio. Sobreposição continua **permitida** — caminhar com
os dogs durante a pausa é legítimo — mas agora aparece marcada, porque dois
lançamentos sobrepostos por engano fazem o dia passar de 24 horas sem ninguém
notar.

A ordem do que resta está em `04-pendencias.md`.

---

## D-033 — as quatro visões do tempo moram juntas, e o calendário é uma régua

Dia, Semana, Calendário e Histórico viraram abas de uma tela só, **Tempo**, que
tomou o lugar de **Hoje** na navegação. São recortes de uma única tabela
(`03-modelo-de-tempo.md`); separá-los no menu faria parecer que existem quatro
registros de tempo diferentes, que é justamente o erro que o modelo de uma
tabela evita.

Decisões dentro de cada uma:

- **Semana** soma pelo dia do **início** do lançamento. Repartir uma sessão que
  atravessa a meia-noite entre dois dias faria a folha divergir da lista do Dia,
  que é onde o usuário confere. E célula vazia fica vazia: um zero afirma que
  nada aconteceu, o vazio só diz que nada foi registrado — num app que se pode
  esquecer de ligar, são coisas diferentes.

- **Calendário** é uma régua, não uma biblioteca: um minuto vale `H/60` pixels e
  toda posição sai dessa conta. Blocos que dividem relógio repartem a largura em
  vez de empilhar — sobreposição é permitida no modelo, e um calendário que
  escondesse um lançamento atrás do outro falharia na única coisa que ele faz.
  Arrastar atravessa colunas: um bloco preso ao dia em que nasceu obrigaria a
  excluir e recriar para corrigir a data, que é o erro mais comum de quem lança
  à mão. Passo de 5 minutos, e clique sem arrasto não cria nada.

- **Histórico** monta a consulta em pedaços, mas todo valor entra por marcador
  `?N` — o que é concatenado são só os marcadores e as cláusulas escritas no
  código. Os totais vêm de **todos** os que casaram com o filtro, não da página
  visível: quem filtra quer saber quanto tempo aquilo deu, não quanto deu nos
  quarenta primeiros.

`subjects` continua sem tela e por isso ficou fora dos filtros — oferecer um
seletor sempre vazio seria pior que não oferecer.

A ordem do que resta está em `04-pendencias.md`.
