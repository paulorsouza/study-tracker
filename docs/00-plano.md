# Plano completo — aplicativo desktop de gestão de estudos

## 1. Visão do produto

Criar um aplicativo desktop para Windows e Linux que centralize cursos online, planejamento diário, Pomodoro, registro flexível do tempo, modo foco, anotações e histórico da rotina. O centro do produto continuará sendo o estudo, mas o usuário também poderá registrar pausas, exercícios e atividades pessoais que sustentam essa rotina. O aplicativo deve funcionar sem internet, sincronizar os dados quando a conexão voltar e manter o usuário conectado com segurança.

O diferencial não será apenas abrir sites em uma janela: o produto conectará quatro elementos que hoje ficam separados:

1. onde o usuário estuda;
2. o que ele planejou estudar;
3. quanto tempo realmente estudou;
4. o conhecimento produzido durante a sessão.

As primeiras plataformas suportadas serão:

- T2 Educação (`https://app.t2.com.br/`);
- Hotmart, com uma central própria para organizar muitos cursos;
- qualquer site cadastrado manualmente.

Também haverá integrações graduais com Obsidian, Claude Desktop e Google NotebookLM.

## 2. Objetivos e indicadores

### Objetivos do usuário

- Encontrar rapidamente o curso e a aula que deseja continuar.
- Planejar o dia sem precisar usar outro aplicativo.
- Iniciar uma sessão de estudo com um único botão.
- Estudar em tela cheia e com menos distrações.
- Registrar automaticamente o tempo real de estudo.
- Manter login, histórico e planejamento entre reinicializações.
- Consultar resultados por curso, matéria, tarefa, dia e semana.
- Transformar sessões em notas e materiais de revisão.
- Entender como estudo, descanso, exercício e atividades pessoais se distribuem na rotina.

### Indicadores de sucesso do produto

- Percentual de sessões iniciadas a partir do planejamento diário.
- Número de dias com pelo menos uma sessão concluída.
- Taxa de sessões encerradas corretamente, sem perda de tempo registrado.
- Taxa de sincronização sem intervenção do usuário.
- Tempo necessário para abrir e continuar um curso.
- Retenção semanal e mensal.
- Quantidade de cursos ativos versus abandonados ou arquivados.
- Taxa de falhas de login e reprodução por plataforma e sistema operacional.

## 3. Escopo funcional

### 3.1 Conta e perfil

- Cadastro com e-mail e senha.
- Confirmação de e-mail e recuperação de senha.
- Login persistente.
- Tela para listar e encerrar sessões em outros computadores.
- Preferências de idioma, tema, sons, duração do Pomodoro e início automático.
- Exportação dos dados do usuário.
- Exclusão de conta e dados sincronizados.
- Modo local sem conta, com opção posterior de criar uma conta e sincronizar.

O token de renovação da sessão não deve ficar exposto no armazenamento comum do frontend. Ele será protegido pelo cofre de credenciais do sistema ou por um cofre criptografado do aplicativo. A senha do usuário nunca será salva diretamente.

### 3.2 Dashboard

- Resumo do dia.
- Meta diária e progresso.
- Tempo estudado hoje e na semana.
- Próxima tarefa planejada.
- Botão de início rápido.
- Cursos recentes.
- Pomodoros concluídos.
- Sequência de dias de estudo, sem punições excessivas por pausas.
- Avisos de conflito de sincronização ou sessão de cronômetro recuperada.

### 3.3 Planejamento diário e semanal

- Criar tarefas com título, curso, matéria, duração estimada, prioridade e prazo.
- Organizar tarefas em blocos de horário.
- Arrastar e reordenar tarefas.
- Repetição diária ou semanal.
- Dividir uma tarefa grande em sessões menores.
- Replanejar automaticamente tarefas não concluídas, sempre com confirmação.
- Visualizações de hoje, semana, atrasadas e concluídas.
- Modelos de rotina, como “segunda de matemática” ou “revisão de sábado”.
- Integração futura com calendários, fora do MVP.

### 3.4 Pomodoro

- Duração configurável de foco, pausa curta e pausa longa.
- Quantidade configurável de ciclos até a pausa longa.
- Iniciar, pausar, retomar, pular pausa e encerrar.
- Vincular a curso, tarefa, matéria e aula.
- Sons e notificações configuráveis.
- Continuação confiável após minimizar o app, suspender o computador ou reiniciar.
- Registro da diferença entre tempo planejado e tempo efetivo.
- Registro completo das pausas curtas e longas, com início, fim e duração.
- Pausas vinculadas à sessão e classificadas como descanso, caminhada, alongamento ou outra atividade escolhida.
- Opção de iniciar a página do curso junto com o Pomodoro.
- Opção de iniciar automaticamente a pausa, nunca ativada por padrão.

### 3.5 Registro de tempo de estudos

O registro será inspirado na simplicidade do Clockify, mas adaptado à rotina individual. A unidade central será o **lançamento de tempo**: um período com uma descrição e associações opcionais. Não haverá folha de ponto, aprovação, horas obrigatórias, faturamento ou bloqueio de lançamentos.

Cada registro terá um **tipo de tempo**, permitindo separar estudo focado, pausa, exercício, cuidado pessoal e outras atividades sem perder a visão do dia completo.

#### Timer rápido

- Campo principal “O que você vai estudar?”.
- Seleção opcional de curso, matéria, módulo/aula, tarefa, tipo de atividade e tags.
- Botão grande para iniciar e parar.
- Pausar e retomar.
- Trocar descrição ou associações enquanto o timer está ativo.
- Corrigir o horário inicial sem precisar encerrar o timer.
- Continuar um lançamento anterior com um clique.
- Favoritar combinações frequentes, como “Hotmart · curso X · exercícios”.
- Atalhos de teclado configuráveis.
- Timer compacto sempre acessível no app.

#### Lançamento manual

- Informar início e fim ou somente a duração.
- Escolher qualquer data passada ou o dia atual.
- Adicionar registro mesmo enquanto outro timer está ativo.
- Duplicar um lançamento e ajustar seus dados.
- Dividir uma sessão em duas atividades.
- Unir lançamentos consecutivos compatíveis.
- Editar ou excluir com opção imediata de desfazer.
- Adicionar observação curta sobre o que foi estudado.
- Aceitar formatos simples como `45m`, `1h30` e `1:30`.

#### Visualizações

- **Hoje:** lista cronológica, total estudado e espaços sem registro.
- **Semana:** grade simples de atividades por dia, semelhante a uma folha de horas, mas sem obrigação de preenchimento.
- **Calendário:** blocos numa linha do tempo, criados, movidos e redimensionados visualmente.
- **Histórico:** busca e filtros por período, curso, matéria, tarefa, tipo e tag.
- **Resumo:** totais por dia, curso e tipo de atividade.

#### Atividades pessoais e bem-estar

- Categorias iniciais: estudo, pausa, caminhada com os dogs, academia, exercício, deslocamento, descanso e pessoal.
- Categorias, nomes, cores e ícones personalizáveis.
- Atalhos de início rápido para “Caminhar com os dogs” e “Academia”.
- Atividades recentes e favoritas disponíveis no dashboard e na bandeja do sistema.
- Possibilidade de adicionar observação, distância ou treino realizado, sempre opcional.
- Nenhuma atividade pessoal exige curso, matéria ou tarefa.
- O planejamento diário pode misturar blocos de estudo, exercício, caminhada e descanso.
- Relatórios mostram a rotina completa e permitem filtrar apenas o tempo de estudo.

#### Flexibilidade e recuperação

- Nenhum campo além do tempo precisa ser obrigatório.
- Sobreposições serão permitidas, mas destacadas para possível correção.
- Ausência de lançamentos nunca será tratada como falta ou erro.
- Detecção de inatividade apenas perguntará se o usuário deseja manter, retirar ou dividir o período.
- Sessão longa gerará um lembrete discreto, sem ser interrompida automaticamente.
- O usuário poderá corrigir qualquer lançamento próprio; mudanças relevantes ficam recuperáveis no histórico.
- Detectar sessão esquecida e perguntar o que deve ser contabilizado.
- Recuperar cronômetro depois de travamento, reinício ou queda de energia.
- Impedir dois cronômetros ativos no mesmo dispositivo.
- Tratar sessões simultâneas em dispositivos diferentes como sobreposição visível, sem apagar dados.

#### Relação com Pomodoro

- O Pomodoro reutiliza o mesmo modelo de lançamento de tempo.
- Períodos de foco e todas as pausas ficam registrados, cada um com início, fim e duração.
- Somente os períodos de foco contam no indicador “tempo efetivo de estudo”.
- Foco e pausas contam no indicador “tempo total da sessão Pomodoro”.
- Pausas também aparecem nos totais de descanso e na linha do tempo do dia.
- Se o usuário caminhar com os dogs, alongar ou fizer outra atividade durante a pausa, poderá trocar o tipo da pausa sem perder o vínculo com o Pomodoro.
- Nesse caso, a atividade principal será “caminhada com os dogs” e o contexto continuará sendo “pausa do Pomodoro”; ela poderá aparecer nas duas análises, mas será contada apenas uma vez no total cronológico do dia.
- Vários ciclos consecutivos podem aparecer agrupados como uma sessão, com opção de ver os ciclos.
- O usuário pode editar o lançamento final sem alterar o histórico bruto dos ciclos.
- Também é possível estudar sem Pomodoro, sem curso cadastrado ou sem planejamento prévio.

### 3.6 Biblioteca de cursos

- Curso, plataforma, professor, capa, categoria, tags e link principal.
- Estados: não iniciado, ativo, pausado, concluído e arquivado.
- Meta, prazo, prioridade e tempo estimado.
- Progresso manual.
- Última página ou aula acessada.
- Tempo total, tempo recente e distribuição semanal.
- Tarefas, sessões e notas relacionadas.
- Favoritos e busca.
- Cadastro de plataforma personalizada.

### 3.7 Central Hotmart

A Hotmart terá uma área dedicada, pois uma conta pode conter muitos produtos e áreas de membros diferentes.

- Acesso inicial por `https://consumer.hotmart.com`.
- Importação assistida da lista “Minhas compras”.
- Alternativas de cadastro por link e cadastro manual.
- Cards independentes por curso, mesmo quando vários pertencem ao mesmo produtor.
- Filtros por produtor, categoria, estado, prioridade e prazo.
- Botão “Continuar estudando” usando a última URL válida.
- Histórico de páginas ou aulas recentes.
- Associação de tarefas, sessões e notas a cada curso.
- Detecção de mudança de URL para sugerir atualização da última aula.
- Progresso manual no MVP.
- Nenhuma tentativa de baixar vídeos protegidos ou alterar o progresso interno da Hotmart sem uma interface oficial apropriada.

### 3.8 T2 Educação

- Atalho de acesso e perfil de navegação persistente.
- Cadastro do curso ou trilha no app.
- Última página acessada.
- Sessões e tarefas associadas.
- Modo foco e tela cheia.
- Notas rápidas.
- Progresso inicialmente manual.
- Qualquer automação adicional só será definida depois de testes autenticados e validação dos termos da plataforma.

### 3.9 Navegador de estudo e modo foco

Serão oferecidos dois modos de abertura:

**Modo integrado**

- Curso dentro de uma janela do app.
- Barra mínima com voltar, avançar, recarregar, início, cronômetro, notas e sair do foco.
- Tela cheia.
- Lista de domínios permitidos por plataforma.
- Links externos ou suspeitos abertos fora do contexto privilegiado do app.
- Janelas, downloads e permissões tratados de forma explícita.

**Modo navegador dedicado**

- Abre Chrome, Edge ou navegador escolhido pelo usuário em uma janela separada.
- Usado quando login, DRM, player, videoconferência ou autenticação não funcionarem no modo integrado.
- Mantém o cronômetro e o painel de notas no app.
- Pode usar o login já existente do navegador, sem copiar cookies ou senhas.

O modo foco não tentará impedir completamente o usuário de sair. O objetivo é reduzir distrações, não bloquear o computador de forma hostil.

### 3.10 Notas e revisão

- Nota rápida durante uma sessão.
- Nota associada a curso, aula, tarefa e instante da sessão.
- Modelos: resumo, dúvidas, conceitos, exercícios e próxima ação.
- Revisões futuras e lembretes.
- Exportação em Markdown e PDF numa fase posterior.
- Pesquisa por texto e tags.

### 3.11 Relatórios

- Tempo por dia, semana, mês, curso, matéria e tarefa.
- Tempo registrado por categoria: estudo, pausa, caminhada, academia e demais atividades.
- Separação clara entre tempo efetivo de estudo, pausas e duração total da sessão Pomodoro.
- Visão da rotina completa sem misturar exercício ou descanso com horas estudadas.
- Planejado versus realizado.
- Pomodoros iniciados, concluídos e interrompidos.
- Horários com maior consistência.
- Cursos sem atividade recente.
- Metas e sequência de estudo.
- Exportação CSV e JSON.
- Relatório semanal em Markdown para Obsidian ou NotebookLM.

Os relatórios devem apoiar decisões e não classificar o usuário como produtivo ou improdutivo com base apenas em horas.

## 4. Integrações

### 4.1 Obsidian — primeira integração completa

- Usuário escolhe explicitamente uma pasta dentro de um vault.
- O app solicita acesso apenas a essa pasta.
- Criação de nota diária.
- Criação ou atualização de nota do curso.
- Registro de sessões em Markdown com propriedades configuráveis.
- Links entre curso, tarefa, aula e data.
- Abertura de notas pelo protocolo `obsidian://`.
- Modelos editáveis pelo usuário.
- Detecção de alterações externas sem sobrescrever silenciosamente.
- Modo somente exportação, no qual o app nunca modifica notas já existentes.

### 4.2 Claude Desktop por MCP

Um servidor MCP local permitirá consultar dados e executar ações autorizadas.

**Recursos de leitura**

- planejamento de hoje e da semana;
- cursos, metas e progresso;
- histórico e estatísticas;
- notas que o usuário marcou como disponíveis para IA.

**Ferramentas de escrita**

- criar ou reprogramar tarefa;
- iniciar ou finalizar sessão;
- atualizar meta ou progresso;
- criar uma nota ou revisão.

Regras:

- leitura e escrita terão permissões separadas;
- ações destrutivas ou alterações em lote exigirão confirmação;
- o usuário poderá desativar ferramentas individualmente;
- todas as alterações via MCP ficarão em um histórico de auditoria;
- o servidor local não aceitará conexões externas por padrão.

### 4.3 Google NotebookLM

Primeiro será implementada uma integração baseada em formatos suportados, não em automação de cliques.

- Gerar pacote por curso ou período em Markdown, PDF e CSV.
- Incluir resumos, notas, links, perguntas, cronologia e referências a materiais.
- Salvar localmente ou numa pasta sincronizada pelo usuário.
- Abrir o NotebookLM e orientar a adição das fontes.
- Fase posterior: integração via Google Drive para fontes que possam ser sincronizadas.
- Uma integração direta só será adotada se houver interface oficial, estável e adequada ao caso de uso.

## 5. Arquitetura proposta

### Aplicativo desktop

- Tauri 2.
- React e TypeScript para a interface.
- Rust para comandos nativos, segurança, ciclo do cronômetro, acesso controlado a arquivos e integração com o sistema.
- SQLite local como fonte de verdade durante o uso.
- Migrações versionadas do banco local.
- Fila local de operações para sincronização.
- Estado da interface separado do estado persistente.

### Servidor

Opção inicial: Supabase com PostgreSQL, autenticação e políticas de acesso por linha.

- Autenticação com e-mail e senha; login social pode vir depois.
- PostgreSQL para dados sincronizados.
- Políticas para cada usuário acessar apenas suas próprias linhas.
- Funções de servidor para operações sensíveis.
- Armazenamento de anexos apenas quando essa funcionalidade for aprovada.
- Ambiente separado de desenvolvimento, homologação e produção.

### Separação de segurança

- A interface principal do app tem apenas as permissões necessárias.
- A janela que carrega Hotmart, T2 ou outro site não recebe comandos nativos privilegiados.
- Conteúdo remoto não poderá chamar livremente funções do sistema.
- Lista de domínios e política de navegação por plataforma.
- Segredos fora de logs, URLs, relatórios de erro e banco SQLite comum.
- Atualizações do aplicativo assinadas.

### Compatibilidade do navegador

- Windows: WebView2, baseado em Chromium.
- Linux: WebKitGTK.
- O comportamento de autenticação, vídeo, DRM, tela cheia, downloads e pop-ups será validado separadamente.
- Quando o site falhar no motor integrado, o modo navegador dedicado será a alternativa oficial, não uma gambiarra invisível.

## 6. Modelo inicial de dados

Todas as entidades sincronizáveis terão `id`, `user_id`, `created_at`, `updated_at`, `deleted_at`, `device_id` e uma versão lógica.

- `profiles`: preferências e configuração geral.
- `devices`: dispositivos autorizados e última sincronização.
- `platforms`: Hotmart, T2 e plataformas personalizadas.
- `activity_types`: categorias personalizáveis, como estudo, pausa, caminhada com os dogs e academia.
- `courses`: metadados, estado, progresso, prazo e última URL.
- `course_links`: links úteis e histórico de páginas.
- `subjects`: matérias ou áreas de conhecimento.
- `tasks`: planejamento, prioridade, recorrência e estado.
- `schedule_blocks`: posicionamento no dia ou semana.
- `time_entries`: lançamento de tempo com tipo de atividade, descrição, início, fim, duração efetiva, origem, associações opcionais e estado de recuperação.
- `time_segments`: partes de um lançamento, incluindo foco, pausa e interrupções.
- `session_revisions`: histórico recuperável de correções, divisões, uniões e exclusões.
- `pomodoro_cycles`: foco, pausa, duração planejada e resultado.
- `notes`: conteúdo, referência externa e política de sincronização.
- `review_items`: revisão, data prevista e resultado.
- `goals`: metas diárias, semanais e por curso.
- `attachments`: somente metadados no MVP; arquivo remoto depois.
- `sync_operations`: fila local, tentativas e erro mais recente.
- `audit_events`: alterações sensíveis, especialmente via MCP.
- `integration_settings`: configuração sem segredos em texto puro.

## 7. Estratégia de sincronização offline

1. Toda alteração é gravada primeiro no SQLite.
2. A mesma transação cria uma operação na fila local.
3. Quando houver conexão, o app envia operações idempotentes ao servidor.
4. O servidor confirma as versões aceitas e retorna mudanças remotas desde o último cursor.
5. O app aplica as mudanças localmente numa transação.
6. Operações confirmadas saem da fila ativa, mas permanecem auditáveis por um período definido.

### Conflitos

- Campos simples: mudança mais recente apenas quando não houver edição concorrente real.
- Notas: preservar as duas versões e pedir escolha ou mesclagem.
- Sessões de tempo: nunca descartar; manter ambas e sinalizar sobreposição.
- Exclusão contra edição: conservar a edição numa área de recuperação.
- Tarefas reordenadas: usar posição estável e normalização posterior.
- O relógio do servidor ajuda a ordenar eventos, mas não substitui IDs de operação e versões.

## 8. Segurança e privacidade

- Senhas nunca armazenadas pelo app.
- Tokens protegidos em cofre seguro.
- Sessões de sites isoladas por perfil de navegação do app.
- Nunca importar automaticamente cookies do Chrome.
- Criptografia em trânsito.
- Políticas de acesso por usuário em todas as tabelas expostas.
- Privilégio mínimo em janelas, comandos, arquivos e integrações.
- CSP restritiva na interface local.
- Sanitização de Markdown e conteúdo exibido.
- Bloqueio de navegação para esquemas perigosos.
- Confirmação antes de abrir arquivos executáveis ou URLs externas incomuns.
- Logs sem tokens, senhas, cookies, conteúdo de notas ou URLs sensíveis completas.
- Telemetria opcional, documentada e desativável.
- Exportação e exclusão de dados.
- Backups testados e restauração documentada.
- Dependências verificadas e atualizadas regularmente.
- Instaladores e atualizações assinados.
- Plano de resposta a incidentes.

## 9. Experiência visual

### Navegação principal

- Hoje
- Planejamento
- Cursos
- Hotmart
- Foco
- Notas
- Relatórios
- Integrações
- Configurações

### Princípios

- Iniciar estudo em no máximo dois cliques a partir da tela inicial.
- Timer sempre legível, sem dominar a aula.
- Recuperação clara quando algo falhar.
- Atalhos de teclado configuráveis.
- Tema claro, escuro e alto contraste.
- Escala de interface e texto configurável.
- Operação completa por teclado nas funções centrais.
- Sem padrões punitivos ou gamificação agressiva.

## 10. Etapas de execução

Os prazos abaixo são referências para uma equipe pequena com produto/design, desenvolvimento desktop e apoio de backend/QA. Uma pessoa trabalhando sozinha deve tratar as fases como sequência de entregas, não como calendário fixo.

### Fase 0 — descoberta e prova técnica (2 a 3 semanas)

**Trabalho**

- Entrevistas e definição do fluxo principal.
- Protótipo navegável das telas centrais.
- Prova de abertura autenticada da Hotmart e T2 no Windows e Linux.
- Testes de vídeo, tela cheia, pop-ups, downloads e login.
- Prova do modo navegador dedicado.
- Prova de persistência de timer após suspensão e reinício.
- Definição do modelo de dados e protocolo de sincronização.
- Revisão de termos aplicáveis às plataformas.

**Saída obrigatória**

- Matriz real de compatibilidade da Hotmart e T2.
- Decisão documentada sobre quando usar cada modo de navegação.
- Protótipo aprovado.
- Riscos críticos com plano de tratamento.

### Fase 1 — fundação local (3 a 4 semanas)

**Trabalho**

- Estrutura Tauri, React, Rust e SQLite.
- Migrações locais.
- Design system básico.
- Biblioteca de cursos.
- Tarefas e planejamento diário.
- Pomodoro e cronômetro livre.
- Recuperação de sessão após falha.
- Relatórios locais básicos.

**Critério de saída**

Um usuário consegue cadastrar um curso, planejar, estudar, fechar o app, reabrir e encontrar todos os dados e o timer no estado correto, sem servidor.

### Fase 2 — cursos e modo foco (3 a 4 semanas)

**Trabalho**

- Janela integrada sem privilégios nativos.
- Navegador dedicado.
- Tela cheia e barra mínima.
- Perfis iniciais de Hotmart e T2.
- Última página acessada.
- Central Hotmart e importação assistida.
- Notas durante a sessão.
- Tratamento de links, pop-ups e downloads.

**Critério de saída**

Hotmart e T2 funcionam nos cenários definidos pela matriz de compatibilidade em Windows e Linux; cada falha prevista oferece alternativa compreensível.

### Fase 3 — conta e sincronização (3 a 4 semanas)

**Trabalho**

- Cadastro, login, recuperação e sessão persistente.
- Banco remoto e políticas de acesso.
- Fila offline e sincronização incremental.
- Conflitos e área de recuperação.
- Lista de dispositivos e encerramento remoto de sessão.
- Exportação e exclusão de conta.

**Critério de saída**

Dois computadores podem editar dados offline e sincronizar sem perda silenciosa. Nenhum usuário consegue ler ou alterar registros de outro usuário.

### Fase 4 — Obsidian e exportações (2 a 3 semanas)

**Trabalho**

- Seleção controlada de pasta.
- Modelos Markdown.
- Nota diária e nota de curso.
- Detecção de alteração externa e conflitos.
- Exportação CSV, JSON, Markdown e pacote para NotebookLM.

**Critério de saída**

O app cria e atualiza notas sem corromper o vault, preserva alterações externas e gera um pacote aceito como fonte pelo NotebookLM.

### Fase 5 — Claude Desktop por MCP (2 a 3 semanas)

**Trabalho**

- Servidor MCP local.
- Recursos de leitura.
- Ferramentas de escrita com confirmação.
- Configuração guiada.
- Auditoria e revogação.
- Testes de entradas maliciosas e abuso de permissões.

**Critério de saída**

Claude Desktop consulta o planejamento e cria uma tarefa autorizada sem receber segredos nem acesso irrestrito ao computador.

### Fase 6 — beta e lançamento (3 a 5 semanas)

**Trabalho**

- Instaladores Windows e Linux.
- Atualização assinada.
- Telemetria consentida e relatórios de falha sem dados sensíveis.
- Teste beta com perfis de hardware e distribuições diferentes.
- Correção de acessibilidade, desempenho e compatibilidade.
- Documentação, suporte, política de privacidade e procedimento de rollback.

**Critério de saída**

Nenhum defeito crítico aberto; restauração, atualização, sincronização, login, cronômetro e fluxos Hotmart/T2 aprovados na matriz suportada.

## 11. Estratégia de testes

### Níveis

- Testes unitários: regras de negócio puras.
- Testes de componentes: interface e estados visuais.
- Testes de integração: SQLite, Rust, arquivos, autenticação e sincronização.
- Testes de contrato: cliente, servidor, MCP e formatos de exportação.
- Testes ponta a ponta: jornadas completas no aplicativo instalado.
- Testes exploratórios: plataformas externas, vídeo e comportamentos não previstos.
- Testes não funcionais: segurança, desempenho, acessibilidade, recuperação e compatibilidade.

### Ambientes mínimos

- Windows 11 atualizado.
- Windows 10 na versão ainda definida como suportada pelo produto.
- Ubuntu LTS atual e anterior suportada.
- Uma segunda distribuição Linux a definir após pesquisa com usuários, preferencialmente Fedora.
- Monitores 1366×768, Full HD e alta densidade.
- Um e dois monitores.
- Rede rápida, lenta, instável e totalmente offline.
- Conta Hotmart com poucos cursos e conta com muitos cursos.
- Contas com áreas de membros e produtores diferentes.

## 12. Catálogo de testes funcionais

### Conta e sessão

- Criar conta válida.
- Rejeitar e-mail inválido e senha fora da política.
- Confirmar e-mail.
- Entrar com credenciais válidas.
- Exibir erro seguro para credenciais inválidas.
- Recuperar e alterar senha.
- Permanecer conectado após fechar, reiniciar e atualizar o app.
- Renovar token expirado.
- Operar offline com sessão previamente válida.
- Sair apenas do dispositivo atual.
- Sair de todos os dispositivos.
- Revogar dispositivo remoto.
- Não restaurar sessão depois de logout explícito.
- Não vazar token em logs ou mensagens de erro.
- Migrar dados do modo local para uma conta.
- Excluir conta e verificar a remoção definida pela política.

### Cursos

- Criar, editar, arquivar, restaurar e excluir curso.
- Validar URL e aceitar curso sem URL.
- Impedir duplicação acidental e permitir duplicação intencional.
- Buscar por nome, professor e tag.
- Filtrar e ordenar.
- Alterar estado e progresso.
- Salvar última página.
- Preservar histórico depois de arquivar.
- Abrir link inválido ou indisponível com recuperação clara.

### Hotmart

- Login por e-mail e senha.
- Login com verificação adicional, se apresentado.
- Sessão preservada após reiniciar.
- Logout da Hotmart não encerra a conta do app.
- Vários produtores e áreas de membros.
- Curso hospedado no Club.
- Produto redirecionado a área externa.
- Importação assistida de poucos e muitos cursos.
- Curso removido, expirado ou sem acesso.
- Atualização da última aula após navegação.
- Player: reproduzir, pausar, velocidade, legenda e tela cheia, quando oferecidos.
- Links que abrem nova janela.
- Materiais para download.
- Comunidade e agenda sem quebrar o modo de estudo.
- Alternar para navegador dedicado quando necessário.
- Não capturar senha, cookies ou conteúdo protegido nos logs.

### T2

- Login e logout.
- Persistência de sessão.
- Navegação entre cursos e aulas disponíveis à conta de teste.
- Player e tela cheia.
- Downloads e links externos.
- Retorno à última URL válida.
- Modo integrado e navegador dedicado.
- Mudança de layout do site sem travar o restante do app.

### Planejamento

- Criar tarefa simples, recorrente e com prazo.
- Editar duração e prioridade.
- Reordenar tarefas.
- Mover entre dias.
- Concluir, reabrir e cancelar.
- Replanejar tarefa atrasada com confirmação.
- Tratar mudança de fuso horário e horário de verão.
- Não duplicar recorrências após sincronização.
- Exibir corretamente tarefas sem curso.

### Pomodoro

- Iniciar foco, pausar, retomar e concluir.
- Pular pausa e encerrar antes do fim.
- Executar sequência com pausa longa.
- Alterar configuração somente para ciclos futuros.
- Receber notificação com app aberto, minimizado e em tela cheia.
- Continuar corretamente após bloqueio, suspensão e hibernação.
- Recuperar após encerramento forçado.
- Não contar pausa como foco.
- Associar ciclo à tarefa e curso corretos.
- Evitar múltiplos timers locais.

### Cronômetro livre

- Iniciar, pausar, retomar e finalizar.
- Trocar curso ou tarefa.
- Iniciar sem descrição, curso ou tarefa.
- Iniciar rapidamente caminhada com os dogs e academia.
- Criar, editar e ordenar categorias pessoais.
- Registrar atividade pessoal sem associação a curso.
- Preencher e alterar descrição enquanto o timer está ativo.
- Corrigir a hora inicial do timer ativo.
- Continuar um lançamento anterior com um clique.
- Iniciar a partir de favorito ou atividade recente.
- Corrigir sessão manualmente com registro da alteração.
- Criar manualmente por início/fim e por duração.
- Aceitar `45m`, `1h30`, `1:30` e formatos regionais definidos.
- Criar lançamento em data passada.
- Duplicar e editar lançamento.
- Dividir uma sessão e conferir a soma das partes.
- Unir sessões compatíveis sem alterar o total.
- Excluir, desfazer e restaurar pelo histórico.
- Criar, mover e redimensionar bloco no calendário.
- Preencher a grade semanal e conferir totais por dia e atividade.
- Permitir sobreposição com aviso visível.
- Manter, remover ou dividir um intervalo detectado como inativo.
- Avisar sobre timer muito longo sem pará-lo automaticamente.
- Recuperar sessão interrompida.
- Detectar duração impossível ou negativa.
- Tratar mudança manual do relógio do sistema.
- Tratar dois dispositivos registrando simultaneamente.
- Impedir perda durante falta de internet.
- Agrupar ciclos Pomodoro sem contar pausas como estudo.
- Registrar cada pausa Pomodoro com início, fim e duração.
- Conferir separadamente foco, pausa e duração total do Pomodoro.
- Reclassificar uma pausa como caminhada ou alongamento sem perder o vínculo com o ciclo.
- Garantir que uma caminhada feita durante a pausa apareça nos dois filtros sem duplicar o total do dia.
- Mostrar caminhada e academia na linha do tempo e nos relatórios, sem somá-las às horas estudadas.
- Editar o lançamento agrupado sem corromper os ciclos originais.

### Modo foco e navegação

- Entrar e sair de tela cheia por botão e teclado.
- Recuperar controles se o site também entrar em tela cheia.
- Voltar, avançar, recarregar e ir ao início.
- Tratar pop-up permitido e bloqueado.
- Abrir domínio externo no local configurado.
- Bloquear esquemas de URL perigosos.
- Solicitar permissão de câmera, microfone e notificações somente quando necessário.
- Manter timer enquanto a página recarrega ou falha.
- Recuperar de erro de certificado, DNS e ausência de rede.
- Não conceder comandos nativos à página remota.

### Notas e Obsidian

- Criar nota rápida e associá-la corretamente.
- Exportar caracteres especiais, emojis, links e blocos de código.
- Criar nota diária com modelo.
- Atualizar nota existente sem duplicação.
- Detectar edição simultânea externa.
- Preservar arquivo em conflito.
- Tratar vault movido, removido ou sem permissão.
- Impedir escrita fora da pasta autorizada.
- Abrir nota correta pelo Obsidian URI.
- Não quebrar links internos e propriedades Markdown.

### NotebookLM

- Exportar pacote por curso, período e seleção manual.
- Validar Markdown, PDF e CSV gerados.
- Incluir somente dados selecionados.
- Omitir conteúdo privado marcado para não exportar.
- Repetir exportação sem gerar duplicações desnecessárias.
- Importar amostras no NotebookLM e validar leitura das fontes.
- Tratar limites de arquivo e conteúdo não suportado com mensagem clara.

### Claude Desktop e MCP

- Instalar, detectar e remover integração.
- Listar recursos permitidos.
- Negar recurso desativado.
- Criar tarefa com confirmação.
- Recusar alteração destrutiva sem autorização.
- Validar esquemas de entrada.
- Rejeitar IDs de outro usuário.
- Impedir acesso a arquivos arbitrários.
- Impedir conexão de rede externa por padrão.
- Registrar evento de auditoria.
- Revogar imediatamente a integração.
- Tratar Claude Desktop fechado, protocolo incompatível e timeout.
- Testar prompt injection presente em notas ou nomes de cursos.

### Sincronização

- Primeiro envio e primeiro download.
- Alteração local offline seguida de reconexão.
- Alteração remota enquanto o dispositivo está offline.
- Mesma tarefa editada nos dois dispositivos.
- Nota editada simultaneamente.
- Exclusão em um dispositivo e edição em outro.
- Repetição da mesma operação sem duplicar dados.
- Interrupção no meio do envio e do download.
- Resposta parcial do servidor.
- Cursor inválido ou expirado.
- Banco local em versão antiga.
- Grande fila acumulada.
- Relógios dos dispositivos fora de sincronia.
- Anexo ausente ou incompleto quando anexos forem suportados.
- Usuário A nunca recebe dados do usuário B.

## 13. Testes não funcionais

### Segurança

- Análise estática de TypeScript e Rust.
- Auditoria de dependências e licenças.
- Verificação de segredos no repositório e nos artefatos.
- Testes das políticas de acesso do banco para leitura, criação, alteração e exclusão.
- XSS em notas, nomes, links e conteúdos importados.
- Injeção em consultas e comandos.
- Path traversal e links simbólicos na integração com Obsidian.
- URLs `file:`, `javascript:`, `data:` e protocolos personalizados.
- Página remota tentando chamar comandos nativos.
- Roubo ou reutilização de token.
- Sessão revogada e token expirado.
- Manipulação do banco SQLite local.
- Atualização falsa, corrompida ou sem assinatura.
- Dependência ou servidor indisponível.
- Prompt injection via conteúdo entregue ao MCP.
- Teste de penetração antes do lançamento público.

### Desempenho

- Tempo de abertura a frio e a quente.
- Consumo de memória no dashboard, curso e vídeo.
- Uso de CPU com timer ocioso e ativo.
- Biblioteca com 10, 100, 1.000 e 10.000 registros relevantes.
- Histórico com vários anos de sessões.
- Sincronização de fila pequena e grande.
- Busca e filtros.
- Exportação grande.
- App minimizado por várias horas.
- Vazamento de memória ao abrir e fechar cursos repetidamente.

Metas numéricas devem ser fixadas após a prova técnica e medidas no hardware mínimo suportado.

### Confiabilidade e recuperação

- Encerramento forçado durante cada gravação importante.
- Queda de energia simulada.
- Disco cheio.
- Banco bloqueado ou corrompido.
- Migração interrompida.
- Falha de servidor durante sincronização.
- Atualização interrompida e rollback.
- Backup e restauração.
- Recuperação de timer sem aumentar ou reduzir artificialmente o tempo.
- Operação offline prolongada.

### Acessibilidade

- Navegação completa por teclado.
- Ordem de foco e foco visível.
- Leitor de tela nas jornadas centrais.
- Nomes acessíveis para controles e gráficos.
- Contraste em temas claro e escuro.
- Zoom de 200%.
- Escala do sistema operacional.
- Não depender apenas de cor.
- Respeitar preferência de movimento reduzido.
- Sons acompanhados de alternativa visual.
- Timer compreensível sem animação.

### Compatibilidade

- WebView2 atualizado e cenário de instalação/recuperação do runtime.
- Versões suportadas do WebKitGTK.
- NVIDIA, AMD, Intel e renderização por software conforme disponibilidade no beta.
- Diferentes gerenciadores de janelas Linux.
- Um e dois monitores.
- Suspensão e retomada em notebook.
- Áudio conectado e desconectado durante a sessão.
- Proxy, VPN e DNS filtrado.
- Fuso horário e formatos regionais brasileiros.

### Usabilidade

- Usuário novo cadastra primeiro curso sem ajuda.
- Usuário com muitos cursos encontra um curso específico rapidamente.
- Usuário inicia uma sessão a partir do plano diário.
- Usuário recupera uma sessão esquecida.
- Usuário entende a diferença entre modo integrado e navegador dedicado.
- Usuário resolve conflito de sincronização sem linguagem técnica.
- Usuário configura Obsidian sem risco ao vault.

## 14. Automação, integração contínua e qualidade

Em cada alteração:

- formatação e lint;
- verificação de tipos;
- testes unitários e de componentes;
- testes Rust;
- migrações aplicadas em banco vazio e banco atualizado;
- testes das políticas de acesso;
- análise de dependências e segredos;
- build de desenvolvimento.

Antes de cada versão candidata:

- builds reais para Windows e Linux;
- instalação limpa e atualização da versão anterior;
- testes ponta a ponta críticos;
- smoke test manual de Hotmart e T2;
- teste offline e sincronização em dois dispositivos;
- verificação de assinatura;
- acessibilidade automatizada e revisão manual;
- relatório de mudanças e plano de rollback.

## 15. Critérios para lançamento

- Zero defeitos críticos ou de perda/corrupção de dados conhecidos.
- Zero falhas conhecidas que exponham dados entre usuários.
- Todos os fluxos críticos automatizados ou cobertos por roteiro manual repetível.
- Hotmart e T2 aprovados na matriz oficial de sistemas suportados.
- Login persistente, logout e revogação aprovados.
- Timer aprovado em suspensão, reinício, falha e modo offline.
- Sincronização aprovada com conflitos e interrupções.
- Atualização e rollback comprovados.
- Política de privacidade, termos, exportação e exclusão disponíveis.
- Canal de suporte e processo de incidentes definidos.

## 16. Fora do MVP

- Aplicativos para celular.
- Bloqueio rígido de outros programas ou sites.
- Download de vídeos protegidos.
- Alteração automática do progresso interno de plataformas sem integração oficial.
- Marketplace ou venda de cursos.
- Rede social própria.
- Gamificação competitiva avançada.
- Integração direta com todos os calendários.
- IA tomando ações irreversíveis sem confirmação.

## 17. Riscos principais e respostas

| Risco | Impacto | Resposta planejada |
|---|---:|---|
| Hotmart ou T2 não funcionarem no WebKitGTK | Alto | Modo navegador dedicado e matriz por plataforma |
| Login externo bloquear WebView | Alto | Autenticação no navegador dedicado; não copiar cookies |
| Mudança de layout quebrar importação assistida | Médio | Cadastro por link/manual sempre disponível |
| Perda de tempo por suspensão ou falha | Alto | Persistir eventos e calcular por relógio monotônico + timestamps |
| Conflitos offline apagarem dados | Alto | Operações versionadas, idempotência e cópia de recuperação |
| Conteúdo remoto alcançar funções nativas | Crítico | Janelas isoladas, permissões mínimas e nenhuma API privilegiada remota |
| MCP executar ação indevida | Alto | Permissões separadas, confirmação, validação e auditoria |
| Obsidian ter nota sobrescrita | Alto | Escopo de pasta, detecção de versão e cópia de conflito |
| Crescimento prematuro do escopo | Alto | Critérios de saída por fase e funcionalidades posteriores explícitas |

## 18. Backlog após o lançamento

- Calendário Google/Microsoft.
- Repetição espaçada mais avançada.
- Metas e relatórios personalizados.
- Captura opcional de timestamp de vídeo quando tecnicamente permitido.
- Outros provedores: Udemy, Coursera, YouTube e plataformas personalizadas.
- Widgets e atalhos globais.
- Sessão colaborativa ou grupo de estudos, se houver demanda.
- Aplicativo móvel complementar.
- Integração oficial mais profunda com NotebookLM, quando disponível e apropriada.

## 19. Referências técnicas oficiais

- [Tauri — versões dos WebViews](https://v2.tauri.app/reference/webview-versions/)
- [Tauri — Content Security Policy](https://v2.tauri.app/security/csp/)
- [Tauri — permissões e capacidades](https://v2.tauri.app/security/permissions/)
- [Tauri — atualizações assinadas](https://v2.tauri.app/es/plugin/updater/)
- [Supabase — sessões de usuário](https://supabase.com/docs/guides/auth/sessions)
- [Supabase — Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Anthropic — MCP](https://docs.anthropic.com/en/docs/mcp)
- [MCP — SDK oficial TypeScript](https://ts.sdk.modelcontextprotocol.io/v2/)
- [Obsidian — Obsidian URI](https://help.obsidian.md/Extending%2BObsidian/Obsidian%2BURI)
- [NotebookLM — fontes suportadas](https://support.google.com/notebooklm/answer/16215270)
- [Hotmart — acesso aos cursos comprados](https://help.hotmart.com/pt-br/article/360038506812/como-eu-faco-para-acessar-o-hotmart-club-)
- [Clockify — timer, lançamento manual e continuação](https://clockify.me/features/timer)
- [Clockify — visualização semanal](https://clockify.me/features/timesheet)
- [Clockify — calendário e blocos de tempo](https://clockify.me/features/calendar)

## 20. Próxima ação recomendada

Começar pela Fase 0 e não pelo desenvolvimento completo. O primeiro marco deve ser uma prova técnica instalável em Windows e Linux com quatro ações: entrar na Hotmart, entrar na T2, reproduzir uma aula e manter um cronômetro correto durante suspensão e reinício. Se esse marco for aprovado, a equipe inicia a fundação local com os riscos mais caros já conhecidos.
