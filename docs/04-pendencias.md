# Pendências

Auditoria do `00-plano.md` contra o que existe, feita em 2026-09-02.

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
| Calendário externo, app móvel, gamificação | §16 | fora do MVP no próprio plano |

O que sobreviveu dessas seções já está pronto: "continuar estudando", cadastro
por link, navegador dedicado.

---

## A fazer

Em ordem acordada. O cronômetro é o próximo.

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

### 2. Cronômetro e lançamentos — §3.5

- [ ] Pausar e retomar (cronômetro e Pomodoro)
- [ ] Trocar descrição ou curso com o cronômetro rodando
- [ ] Corrigir a hora de início sem parar
- [ ] Continuar um lançamento anterior num clique
- [ ] Favoritar combinações frequentes
- [ ] Duplicar lançamento
- [ ] Dividir uma sessão em duas
- [ ] Unir lançamentos consecutivos compatíveis
- [ ] **Destacar sobreposição** — hoje ela é permitida mas passa despercebida
- [ ] Atalhos de teclado configuráveis

### 3. Visualizações do tempo — §3.5

- [ ] Semana: grade por dia, sem obrigação de preenchimento
- [ ] Calendário: blocos criados, movidos e redimensionados
- [ ] Histórico: busca e filtros por período, curso, tarefa, tipo e tag

> Bloco grande e o mais fácil de construir errado. Vale esperar uso real —
> como você consulta o histórico decide o formato.

### 4. Atividades pessoais — §3.5

- [ ] Ícone por categoria
- [ ] Atalhos de início rápido ("Caminhar com os dogs", "Academia")
- [ ] Bandeja do sistema com atividades recentes
- [ ] Observação, distância ou treino no lançamento
- [ ] Planejamento misturando blocos de estudo, exercício e descanso

### 5. Pomodoro — §3.4

- [ ] Abrir a página do curso junto com o ciclo
- [ ] Reclassificar a pausa na própria tela de Foco (o modelo já suporta)
- [ ] Vincular a matéria e aula, não só curso e tarefa

### 6. Painel — §3.2

- [ ] Próxima tarefa planejada
- [ ] Botão de início rápido
- [ ] Cursos recentes
- [ ] Pomodoros concluídos
- [ ] Aviso de conflito de sincronização na tela inicial, não só em Configurações

### 7. Conta — §3.1

- [ ] Recuperação de senha
- [ ] Listar e encerrar sessões de outras máquinas
- [ ] Exportar os próprios dados
- [ ] Excluir conta e dados sincronizados

### 8. NotebookLM — §4.3

- [ ] Pacote por curso ou período
- [ ] Abrir o NotebookLM e orientar a adição das fontes

### 9. Acessibilidade e idioma — §9

- [ ] Tema de alto contraste
- [ ] Escala de interface e texto
- [ ] Operação completa por teclado nas funções centrais
- [ ] Idioma

### 10. Empacotamento — Fase 6

- [ ] Instaladores Windows e Linux
- [ ] Atualização assinada e rollback
- [ ] Documentação de uso

---

## Não verificado

Escrito e compilando, **nunca exercitado de verdade**. Não conta como pronto.

- [ ] Notificação do Pomodoro com a janela minimizada
- [ ] Proteção do vault: exportar, editar no Obsidian, exportar de novo
- [ ] Sincronização contra um Supabase real — autenticação, envio, recepção
- [ ] MCP ligado no Claude Desktop de verdade
- [ ] Redimensionar a janela pelas bordas, com a decoração desligada (D-028)
- [ ] Linux, inteiro (D-003)
