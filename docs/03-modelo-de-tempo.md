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
