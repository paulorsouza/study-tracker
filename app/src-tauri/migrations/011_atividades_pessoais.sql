-- Atividades pessoais e bem-estar (§3.5 do plano).
--
-- "Nenhuma atividade pessoal exige curso, matéria ou tarefa" e "nenhum campo
-- além do tempo precisa ser obrigatório" — então tudo aqui é anulável, e nada
-- disto aparece em categoria que não peça.

-- Observação vale para qualquer lançamento: é o "o que foi estudado" de §3.5 e
-- o "como foi o treino" na mesma linha.
ALTER TABLE time_entries ADD COLUMN observacao TEXT;
-- Em metros e inteiro para poder somar sem erro de ponto flutuante; a
-- interface mostra em km.
ALTER TABLE time_entries ADD COLUMN distancia_m INTEGER;
ALTER TABLE time_entries ADD COLUMN treino TEXT;

-- Qual campo extra a categoria pede, se pede algum: 'distancia' ou 'treino'.
-- Fica na categoria e não numa regra no código porque quem decide que academia
-- registra treino é o usuário — ele pode criar "Natação" amanhã.
ALTER TABLE activity_types ADD COLUMN campos_extra TEXT
  CHECK (campos_extra IS NULL OR campos_extra IN ('distancia', 'treino'));

-- Sem isto o planejamento do dia só sabe falar de estudo. §3.5: "o planejamento
-- diário pode misturar blocos de estudo, exercício, caminhada e descanso".
ALTER TABLE tasks ADD COLUMN activity_type_id TEXT REFERENCES activity_types(id);

UPDATE activity_types SET campos_extra = 'distancia'
 WHERE id IN ('at-caminhada', 'at-deslocamento');
UPDATE activity_types SET campos_extra = 'treino'
 WHERE id IN ('at-academia', 'at-exercicio');

-- Ícones das categorias semeadas. Só preenche o que ainda está vazio: quem já
-- escolheu um ícone não deve perdê-lo para o padrão.
UPDATE activity_types SET icone = 'livro'    WHERE id = 'at-estudo'       AND icone IS NULL;
UPDATE activity_types SET icone = 'halter'   WHERE id = 'at-academia'     AND icone IS NULL;
UPDATE activity_types SET icone = 'cachorro' WHERE id = 'at-caminhada'    AND icone IS NULL;
UPDATE activity_types SET icone = 'corrida'  WHERE id = 'at-exercicio'    AND icone IS NULL;
UPDATE activity_types SET icone = 'cama'     WHERE id = 'at-descanso'     AND icone IS NULL;
UPDATE activity_types SET icone = 'carro'    WHERE id = 'at-deslocamento' AND icone IS NULL;
UPDATE activity_types SET icone = 'cafe'     WHERE id = 'at-pausa'        AND icone IS NULL;
UPDATE activity_types SET icone = 'pessoa'   WHERE id = 'at-pessoal'      AND icone IS NULL;

-- Gatilhos refeitos com as colunas novas. `icone` entrava em nenhum payload até
-- aqui — o ícone escolhido numa máquina nunca chegava na outra.
DROP TRIGGER sync_ins_time_entries;
DROP TRIGGER sync_upd_time_entries;
DROP TRIGGER sync_ins_activity_types;
DROP TRIGGER sync_upd_activity_types;
DROP TRIGGER sync_ins_tasks;
DROP TRIGGER sync_upd_tasks;

CREATE TRIGGER sync_ins_time_entries AFTER INSERT ON time_entries
WHEN (SELECT aplicando FROM sync_estado WHERE unico = 1) = 0
BEGIN
  INSERT INTO sync_operations
    (id, entidade, registro_id, version, device_id, payload, criada_em)
  VALUES (
    lower(hex(randomblob(16))), 'time_entries', NEW.id, NEW.version, NEW.device_id,
    json_object('id', NEW.id, 'started_at', NEW.started_at, 'ended_at', NEW.ended_at, 'activity_type_id', NEW.activity_type_id, 'context', NEW.context, 'parent_id', NEW.parent_id, 'description', NEW.description, 'course_id', NEW.course_id, 'subject_id', NEW.subject_id, 'task_id', NEW.task_id, 'source', NEW.source, 'planejado_ms', NEW.planejado_ms, 'observacao', NEW.observacao, 'distancia_m', NEW.distancia_m, 'treino', NEW.treino, 'device_id', NEW.device_id, 'version', NEW.version, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at),
    CAST(strftime('%s','now') AS INTEGER) * 1000
  );
END;

CREATE TRIGGER sync_upd_time_entries AFTER UPDATE ON time_entries
WHEN (SELECT aplicando FROM sync_estado WHERE unico = 1) = 0
BEGIN
  INSERT INTO sync_operations
    (id, entidade, registro_id, version, device_id, payload, criada_em)
  VALUES (
    lower(hex(randomblob(16))), 'time_entries', NEW.id, NEW.version, NEW.device_id,
    json_object('id', NEW.id, 'started_at', NEW.started_at, 'ended_at', NEW.ended_at, 'activity_type_id', NEW.activity_type_id, 'context', NEW.context, 'parent_id', NEW.parent_id, 'description', NEW.description, 'course_id', NEW.course_id, 'subject_id', NEW.subject_id, 'task_id', NEW.task_id, 'source', NEW.source, 'planejado_ms', NEW.planejado_ms, 'observacao', NEW.observacao, 'distancia_m', NEW.distancia_m, 'treino', NEW.treino, 'device_id', NEW.device_id, 'version', NEW.version, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at),
    CAST(strftime('%s','now') AS INTEGER) * 1000
  );
END;

CREATE TRIGGER sync_ins_activity_types AFTER INSERT ON activity_types
WHEN (SELECT aplicando FROM sync_estado WHERE unico = 1) = 0
BEGIN
  INSERT INTO sync_operations
    (id, entidade, registro_id, version, device_id, payload, criada_em)
  VALUES (
    lower(hex(randomblob(16))), 'activity_types', NEW.id, NEW.version, NEW.device_id,
    json_object('id', NEW.id, 'nome', NEW.nome, 'cor', NEW.cor, 'cor_escura', NEW.cor_escura, 'icone', NEW.icone, 'campos_extra', NEW.campos_extra, 'conta_como_estudo', NEW.conta_como_estudo, 'ordem', NEW.ordem, 'device_id', NEW.device_id, 'version', NEW.version, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at),
    CAST(strftime('%s','now') AS INTEGER) * 1000
  );
END;

CREATE TRIGGER sync_upd_activity_types AFTER UPDATE ON activity_types
WHEN (SELECT aplicando FROM sync_estado WHERE unico = 1) = 0
BEGIN
  INSERT INTO sync_operations
    (id, entidade, registro_id, version, device_id, payload, criada_em)
  VALUES (
    lower(hex(randomblob(16))), 'activity_types', NEW.id, NEW.version, NEW.device_id,
    json_object('id', NEW.id, 'nome', NEW.nome, 'cor', NEW.cor, 'cor_escura', NEW.cor_escura, 'icone', NEW.icone, 'campos_extra', NEW.campos_extra, 'conta_como_estudo', NEW.conta_como_estudo, 'ordem', NEW.ordem, 'device_id', NEW.device_id, 'version', NEW.version, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at),
    CAST(strftime('%s','now') AS INTEGER) * 1000
  );
END;

CREATE TRIGGER sync_ins_tasks AFTER INSERT ON tasks
WHEN (SELECT aplicando FROM sync_estado WHERE unico = 1) = 0
BEGIN
  INSERT INTO sync_operations
    (id, entidade, registro_id, version, device_id, payload, criada_em)
  VALUES (
    lower(hex(randomblob(16))), 'tasks', NEW.id, NEW.version, NEW.device_id,
    json_object('id', NEW.id, 'titulo', NEW.titulo, 'course_id', NEW.course_id, 'subject_id', NEW.subject_id, 'activity_type_id', NEW.activity_type_id, 'duracao_estimada_min', NEW.duracao_estimada_min, 'prioridade', NEW.prioridade, 'prazo', NEW.prazo, 'dia_planejado', NEW.dia_planejado, 'ordem', NEW.ordem, 'estado', NEW.estado, 'concluida_em', NEW.concluida_em, 'device_id', NEW.device_id, 'version', NEW.version, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at),
    CAST(strftime('%s','now') AS INTEGER) * 1000
  );
END;

CREATE TRIGGER sync_upd_tasks AFTER UPDATE ON tasks
WHEN (SELECT aplicando FROM sync_estado WHERE unico = 1) = 0
BEGIN
  INSERT INTO sync_operations
    (id, entidade, registro_id, version, device_id, payload, criada_em)
  VALUES (
    lower(hex(randomblob(16))), 'tasks', NEW.id, NEW.version, NEW.device_id,
    json_object('id', NEW.id, 'titulo', NEW.titulo, 'course_id', NEW.course_id, 'subject_id', NEW.subject_id, 'activity_type_id', NEW.activity_type_id, 'duracao_estimada_min', NEW.duracao_estimada_min, 'prioridade', NEW.prioridade, 'prazo', NEW.prazo, 'dia_planejado', NEW.dia_planejado, 'ordem', NEW.ordem, 'estado', NEW.estado, 'concluida_em', NEW.concluida_em, 'device_id', NEW.device_id, 'version', NEW.version, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at),
    CAST(strftime('%s','now') AS INTEGER) * 1000
  );
END;
