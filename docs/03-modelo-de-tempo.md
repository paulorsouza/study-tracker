# Modelo de tempo

Substitui as três tabelas do plano original (`time_entries`, `time_segments`,
`pomodoro_cycles`) por uma. Sobreposição entre tabelas de tempo vira erro de
totalização, e este produto tem uma regra de totalização difícil (ver abaixo).

## Uma tabela

```
time_entries
  id              uuid
  started_at      timestamp   -- relógio de parede, UTC
  ended_at        timestamp?  -- nulo enquanto roda
  activity_type_id fk         -- estudo | pausa | caminhada | academia | ...
  context         enum?       -- pomodoro_focus | pomodoro_break | null
  parent_id       fk?         -- agrupa ciclos numa sessão Pomodoro
  description     text?
  course_id       fk?
  subject_id      fk?
  task_id         fk?
  source          enum        -- timer | manual | recuperado | dividido | unido
  -- campos de sync desde já (D-002)
  device_id, version, created_at, updated_at, deleted_at
```

Um ciclo Pomodoro é um par de linhas com o mesmo `parent_id`: uma com
`context = pomodoro_focus`, outra com `pomodoro_break`. Não existe tabela de
ciclos — ela seria derivada, e derivada que se materializa é derivada que
diverge.

## Por que dois campos e não um

A regra mais delicada do plano (§3.5): o usuário caminha com os dogs **durante
a pausa do Pomodoro**. Isso precisa aparecer no relatório de exercício, aparecer
no relatório do Pomodoro, e contar **uma vez só** no total cronológico do dia.

Com dois campos independentes cai sozinho:

| Pergunta | Campo que responde |
|---|---|
| O que o usuário estava fazendo? | `activity_type` = caminhada |
| Dentro de que estrutura? | `context` = pomodoro_break |
| Quanto tempo do dia isso ocupou? | `ended_at - started_at`, uma vez |

`activity_type` é a **verdade cronológica** — é o que entra na linha do tempo do
dia e não pode duplicar. `context` é uma **etiqueta de estrutura** — filtra
relatórios e nunca soma nada. Um campo para cada pergunta.

Consequências diretas:
- "tempo efetivo de estudo" = soma de `activity_type = estudo`;
- "duração total da sessão Pomodoro" = soma das entries com aquele `parent_id`,
  qualquer `activity_type`;
- reclassificar uma pausa como caminhada é trocar `activity_type` e manter
  `context` e `parent_id` — o vínculo com o ciclo não se perde.

## Correções e histórico

`session_revisions` do plano continua, como log append-only de alterações: toda
edição, divisão, união e exclusão grava o estado anterior. É o que permite
"editar o lançamento agrupado sem corromper os ciclos originais" e o desfazer
de §3.5.

## Intervalos em aberto

Lacuna de heartbeat (P4 do spike) **não** vira `time_entry`. Vira um registro
separado de intervalo pendente, que o app mostra como pergunta: manter, remover
ou dividir. Tempo que o app não observou nunca entra no total sozinho.

## Como o Pomodoro se encaixa

Nenhuma tabela nova (D-005). Cada período de foco e **cada pausa** é uma linha
de `time_entries` — porque cada um é um período real de relógio, e o plano
(§3.4) exige registrar a pausa com início, fim e duração, não só o foco.

**O identificador da sessão é o `id` da primeira entrada de foco**, e todas as
linhas da sessão — inclusive essa primeira — carregam esse valor em `parent_id`.
A primeira aponta para si mesma.

Parece estranho, mas resolve um problema real: `parent_id` tem chave estrangeira
para `time_entries`, então um id de sessão inventado não existiria como linha e
a inserção falharia. Com a auto-referência, "todas as linhas da sessão X" é
`WHERE parent_id = X`, sem exceção para a primeira e sem tabela de sessão.
Exclusão é lógica, então a linha-âncora nunca some.

| Campo | Foco | Pausa |
|---|---|---|
| `activity_type_id` | `at-estudo` | `at-pausa` — ou o que o usuário trocar |
| `context` | `pomodoro_focus` | `pomodoro_break` |
| `parent_id` | id da sessão | id da sessão |
| `planejado_ms` | duração configurada | duração configurada |

"Tempo efetivo de estudo" continua saindo de `conta_como_estudo`, não de
`context`: foco usa uma categoria que conta, pausa usa uma que não conta. A
regra vale para o cronômetro livre do mesmo jeito — não existe caso especial
para Pomodoro na contabilidade.

E é isto que faz a regra difícil de §3.5 funcionar: trocar a pausa para
"caminhada com os dogs" muda só `activity_type_id`. O `context` e o `parent_id`
ficam, então a caminhada continua listada como pausa daquele ciclo, aparece no
relatório de exercício, e conta **uma vez só** na linha do tempo do dia.

`planejado_ms` é a coluna nova: guarda quanto a fase deveria ter durado. Sem
ela não dá para responder "planejado versus efetivo" por ciclo, que §3.4 pede.
