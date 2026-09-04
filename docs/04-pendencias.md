# Pendências

Auditoria do `00-plano.md` contra o que existe, feita em 2026-09-02 e
revisada em 2026-09-04, na versão 0.0.2.

Três listas, e a primeira importa tanto quanto as outras: **o que foi
descartado não é dívida.** Sem essa separação, cada retomada reabre discussão
já encerrada.

---

## Descartado por decisão

| Item | Onde | Decisão |
|---|---|---|
| Central Hotmart, T2, navegador de estudo e modo foco | §3.7, §3.8, §3.9 | D-007 — o app não abre conteúdo de plataforma |
| Recorrência de tarefas e modelos de rotina | §3.3 | D-011 — exige decidir materialização e não-duplicação na sync |
| **Exportação CSV/JSON e a tela de Relatórios** | §3.11 | **D-030** |
| Sincronização do vault pelo próprio app | — | D-021 — o git faz isso melhor |
| Calendário externo e gamificação | §16 | fora do MVP no próprio plano |
| ~~App móvel~~ | §16 | **voltou** — como companheiro, não como o app inteiro; `07-android.md` |

O que sobreviveu dessas seções já está pronto: "continuar estudando", cadastro
por link, navegador dedicado.

---

## A fazer

Em ordem acordada. Os itens 1 a 8 estão fechados, o 9 foi adiado e o 10 é o
que está aberto — nele, o que falta é atualização assinada e documentação
de uso.

### 1. Detalhe do curso — §3.6 ✅

- [x] Página do curso, aberta a partir da lista
- [x] Professor, categoria, tags, plataforma, capa
- [x] Estados: não iniciado, ativo, pausado, concluído, arquivado
- [x] Meta, prazo, prioridade, tempo estimado
- [x] Progresso manual
- [x] Tempo total, tempo recente e distribuição semanal
- [x] Tarefas, sessões e notas ligadas ao curso
- [x] Busca e filtro por estado na lista
- [x] Cadastro de plataforma personalizada — falta um formulário na tela;
      hoje só pelo comando `criar_plataforma`

### 2. Cronômetro e lançamentos — §3.5 ✅

- [x] Pausar e retomar (cronômetro e Pomodoro)
- [x] Trocar descrição ou curso com o cronômetro rodando
- [x] Corrigir a hora de início sem parar
- [x] Continuar um lançamento anterior num clique
- [x] Favoritar combinações frequentes
- [x] Duplicar lançamento
- [x] Dividir uma sessão em duas
- [x] Unir lançamentos consecutivos compatíveis
- [x] **Destacar sobreposição** — continua permitida, agora visível
- [x] Atalhos de teclado configuráveis — dentro do app, não globais (D-032)

### 3. Visualizações do tempo — §3.5 ✅

- [x] Semana: grade por dia, sem obrigação de preenchimento
- [x] Calendário: blocos criados, movidos e redimensionados
- [x] Histórico: busca e filtros por período, curso, tarefa, tipo e tag

> O aviso continua valendo: é o bloco mais fácil de construir errado, e só o
> uso real dirá se o formato serve. As quatro visões moram em **Tempo**, que
> substituiu **Hoje** na navegação — são recortes de uma tabela só.
>
> ~~**Matéria ficou de fora do filtro.**~~ Resolvido no item 5: a tela de
> matérias existe, e o Histórico filtra por ela.
>
> Filtrar por **tag** filtra pela etiqueta do *curso* — lançamento não tem
> etiqueta própria no modelo.

### 4. Atividades pessoais — §3.5 ✅

- [x] Ícone por categoria
- [x] Atalhos de início rápido ("Caminhar com os dogs", "Academia") — os
      recentes aparecem no cronômetro da lateral e na bandeja
- [x] Bandeja do sistema com atividades recentes
- [x] Observação, distância ou treino no lançamento
- [x] Planejamento misturando blocos de estudo, exercício e descanso

> A bandeja **não foi verificada em execução** — ela existe só no app montado,
> não na prévia do navegador. Compila e linka; o menu, o clique e o ícone na
> área de notificação ficam para o primeiro uso real.

### 5. Pomodoro — §3.4 ✅

- [x] Abrir a página do curso junto com o ciclo — opção desligada por padrão
- [x] Reclassificar a pausa na própria tela de Foco — a que está correndo e as
      já encerradas, na lista de ciclos
- [x] Vincular a matéria e aula, não só curso e tarefa (D-035)

### 6. Painel — §3.2 ✅

- [x] Próxima tarefa planejada
- [x] Botão de início rápido
- [x] Cursos recentes
- [x] Pomodoros concluídos
- [x] Aviso de conflito de sincronização na tela inicial, não só em Configurações

> O Painel **deixou de ser a tela inicial** em D-039, e no celular sai da
> navegação. O aviso de conflito acompanhou: quem abre o app cai no
> Planejamento, e é lá que ele aparece.

### 7. Conta — §3.1 ✅ (com dois limites de desenho)

- [x] Recuperação de senha — link por e-mail, mais troca de senha estando logado
- [x] ~~Listar~~ e encerrar sessões de outras máquinas — **parcial** (D-037)
- [x] Exportar os próprios dados
- [x] ~~Excluir conta~~ e dados sincronizados — **parcial** (D-037)

> Dois itens não são possíveis de dentro do app e **não** vão ser: listar as
> sessões de autenticação e excluir a conta em si exigem a chave `service_role`
> do Supabase, que dá poder de administrador sobre o projeto inteiro. Um app
> instalado no computador não pode guardá-la.
>
> O que existe no lugar: a lista de **máquinas que sincronizaram**, tirada dos
> dados que o app já tem, e o botão que encerra as sessões das outras máquinas
> (`scope=others`, que não precisa de administrador). Excluir a conta fica no
> painel do Supabase, e a tela diz isso em vez de esconder.
>
> A migração 012 não muda nada aqui, mas o **SQL do esquema mudou**: ganhou a
> política de `delete`. Sem ela "apagar os dados do servidor" falharia calado.
> É preciso rodar o script de novo — ele agora é idempotente.

### 8. NotebookLM — §4.3 ✅

- [x] Pacote por curso ou período — **em Markdown só** (D-038)
- [x] Abrir o NotebookLM e orientar a adição das fontes

> §4.3 lista "Markdown, PDF e CSV". O NotebookLM **não aceita CSV** como fonte,
> e PDF exigiria uma caixa de geração inteira para entregar o mesmo texto num
> formato que o NotebookLM converte de volta para texto. Ficou Markdown.
>
> Integração via Google Drive e envio automático de fonte continuam **fora**:
> o próprio plano condiciona integração direta a "interface oficial, estável e
> adequada", e ela não existe.

### 9. Acessibilidade e idioma — §9 ⏸ adiado

Adiado por decisão do usuário em 2026-09-03. **Não é descarte**: continua na
lista, só saiu da fila de agora.

- [ ] Tema de alto contraste
- [ ] Escala de interface e texto
- [ ] Operação completa por teclado nas funções centrais
- [ ] Idioma

> O que já existe e não se perde enquanto isso: a paleta é validada para
> daltonismo nos dois temas (D-012), os atalhos de teclado do cronômetro são
> configuráveis (D-032) e os controles têm rótulo acessível. O que falta é o
> tema de alto contraste, a escala e a cobertura de teclado nas telas que ainda
> dependem do ponteiro — o calendário é a mais evidente, porque criar e mover
> bloco hoje **só** funciona com arrasto.

### 10. Empacotamento — Fase 6 (em andamento)

- [x] Instaladores Windows e Linux — gerados e baixados; ver
      `05-empacotamento.md`
- [x] APK do Android, assinado e instalável — ver `07-android.md`
- [ ] Atualização assinada e rollback
- [ ] Documentação de uso

> Windows sai desta máquina (`npm run tauri build`). **Linux não sai daqui**: o
> Tauri não faz cross-compile, porque o webview é do sistema. Quem monta é o
> CI, em `ubuntu-22.04`.
>
> Só o **Android** foi instalado e aberto de verdade. O instalador do Windows e
> os pacotes do Linux foram produzidos e baixados, não executados — e "compila"
> não é "funciona". É o que a lista abaixo separa.

---

## Não verificado

Escrito e compilando, **nunca exercitado de verdade**. Não conta como pronto.

- [ ] Bandeja do sistema: ícone, menu, clique e início rápido (D-034)
- [ ] Notificação do Pomodoro com a janela minimizada
- [ ] Proteção do vault: exportar, editar no Obsidian, exportar de novo
- [ ] Sincronização contra um Supabase real — autenticação, envio, recepção
- [ ] Conta: recuperar senha, trocar senha, encerrar as outras sessões e apagar
      os dados do servidor (tudo depende do Supabase real; D-037)
- [ ] MCP ligado no Claude Desktop de verdade
- [ ] Instalar pelo instalador do Windows, numa máquina que não seja a de
      desenvolvimento — o que roda aqui é o `tauri dev`
- [ ] Redimensionar a janela pelas bordas, com a decoração desligada (D-028)
- [ ] Linux, inteiro (D-003) — roteiro em `06-linux.md`
- [x] ~~**Android, inteiro.**~~ **Parcial.** A 0.0.2 foi instalada e usada num
      celular: o app sobe, a interface funciona e o toque responde — e foi esse
      uso que produziu o D-039. Continuam sem prova o **tablet** (a faixa entre
      760px e 900px), onde o banco nasce, a notificação do Pomodoro em segundo
      plano e a sincronização. Ver `07-android.md`
