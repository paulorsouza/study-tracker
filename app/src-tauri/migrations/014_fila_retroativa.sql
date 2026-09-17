-- Fila retroativa (D-043).
--
-- A fila de sincronização nasceu na migração 008, preenchida por gatilho. O
-- que já existia antes dela nunca foi alterado desde então e, portanto, nunca
-- entrou na fila: numa máquina nova, as tarefas chegavam apontando para um
-- curso que não viajou. A chave estrangeira recusava, e a tarefa ia para a
-- quarentena para sempre.
--
-- O conserto usa o próprio gatilho: um UPDATE que não muda nada ainda dispara
-- `sync_upd_*`, e o payload sai montado pelo mesmo código de sempre — nenhuma
-- lista de colunas duplicada aqui para envelhecer em silêncio.
--
-- Só entra o que nunca teve operação. A versão não muda, então uma máquina
-- que já tem o registro reconhece a operação como repetida e a ignora.
--
-- A ordem segue as dependências (categoria antes de curso, curso antes de
-- tarefa, tarefa antes de lançamento). Não é a garantia — quem garante é a
-- nova tentativa da quarentena em `sync.rs` —, mas poupa a volta.
--
-- As categorias semeadas ficam de fora enquanto estiverem na versão 1: toda
-- máquina nasce com elas, com os mesmos ids, e mandar a cópia de uma para a
-- outra só produziria "edição concorrente" (mesma versão, device_id e datas
-- diferentes). Numa instalação nova as tabelas estão vazias e isto não faz nada.

UPDATE activity_types SET version = version
 WHERE id NOT IN (SELECT registro_id FROM sync_operations WHERE entidade = 'activity_types')
   AND NOT (version = 1 AND id IN ('at-estudo', 'at-academia', 'at-caminhada', 'at-exercicio',
                                   'at-descanso', 'at-deslocamento', 'at-pausa', 'at-pessoal'));

UPDATE subjects SET version = version
 WHERE id NOT IN (SELECT registro_id FROM sync_operations WHERE entidade = 'subjects');

UPDATE courses SET version = version
 WHERE id NOT IN (SELECT registro_id FROM sync_operations WHERE entidade = 'courses');

UPDATE tasks SET version = version
 WHERE id NOT IN (SELECT registro_id FROM sync_operations WHERE entidade = 'tasks');

UPDATE time_entries SET version = version
 WHERE id NOT IN (SELECT registro_id FROM sync_operations WHERE entidade = 'time_entries');

UPDATE notes SET version = version
 WHERE id NOT IN (SELECT registro_id FROM sync_operations WHERE entidade = 'notes');

UPDATE activity_goals SET version = version
 WHERE id NOT IN (SELECT registro_id FROM sync_operations WHERE entidade = 'activity_goals');

UPDATE time_favorites SET version = version
 WHERE id NOT IN (SELECT registro_id FROM sync_operations WHERE entidade = 'time_favorites');
