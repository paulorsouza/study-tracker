# Modo família

Cada pessoa continua com seu próprio app e seu próprio projeto Supabase (D-024,
sem mudança). O modo família soma um segundo destino, menor e separado: um
**hub** que recebe só o total de minutos por categoria e dia de quem optou por
compartilhar aquela categoria. Ver D-042 em `01-decisoes.md`.

## O que sai da máquina, e o que não sai

- Sai: `membro_id`, dia (AAAA-MM-DD, dia local de quem enviou), nome da
  categoria, total de minutos do dia.
- Não sai nunca por este caminho: nome de curso, matéria, tarefa, descrição,
  nota, observação. Isso continua só no projeto pessoal de cada um (D-024).
- Por categoria, começa desligado (`activity_types.compartilhar_familia = 0`,
  migração 013). Cada pessoa decide quais das suas categorias entram.

## Esquema do hub

Projeto Supabase novo, **separado** do projeto pessoal de cada membro. Rodar
uma vez, no SQL Editor desse projeto:

```sql
create table if not exists family_daily_stats (
  membro_id          text not null,
  dia                text not null,  -- 'AAAA-MM-DD', dia local de quem enviou
  activity_type_nome text not null,
  minutos            integer not null check (minutos >= 0),
  atualizado_em      timestamptz not null default now(),
  primary key (membro_id, dia, activity_type_nome)
);

alter table family_daily_stats enable row level security;

-- Sem login por pessoa no hub — só a chave anon, compartilhada entre os apps
-- da família. A política é deliberadamente permissiva dentro desta tabela:
-- é o preço de não exigir uma segunda conta só para ver o resumo da família.
-- A chave não abre nenhuma outra tabela porque não existe nenhuma outra
-- tabela neste projeto (D-037 é o precedente: anon nunca ganha mais do que a
-- RLS explicitamente concede).
create policy "familia_le_tudo" on family_daily_stats
  for select using (true);

create policy "familia_escreve" on family_daily_stats
  for insert with check (true);

create policy "familia_atualiza" on family_daily_stats
  for update using (true) with check (true);
```

Upsert por `(membro_id, dia, activity_type_nome)`: cada envio sobrescreve o
total do dia inteiro, não soma em cima do que já estava lá. Não há fila nem
histórico de operações como em `sync_operations` — não faz falta, porque não
há conflito possível em "qual é o total de hoje".

## O que ainda falta (fora do F0)

- **F1 — envio**: módulo `familia.rs` (`familia_configurar`,
  `familia_enviar_hoje`), disparado num intervalo e ao encerrar um
  lançamento. Reaproveita o padrão de chamada HTTP de `supabase.rs`.
- **F2 — tela Família**: leitura do hub (`familia_buscar`), grade membro ×
  categoria por dia/semana.
- **F3 — onboarding**: tela para colar URL/chave do hub e escolher o nome do
  membro; roteiro de instalação nas máquinas de quem ainda não usa o app.

Nenhum destes três está implementado. A coluna `compartilhar_familia` existe
no banco local mas hoje só é alterável por SQL direto — a interface para
ligá-la por categoria entra no F1, junto com o comando que efetivamente lê e
envia.
