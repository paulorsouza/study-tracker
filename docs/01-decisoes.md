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
