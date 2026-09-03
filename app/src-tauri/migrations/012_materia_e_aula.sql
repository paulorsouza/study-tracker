-- Matéria e aula no lançamento (§3.4 e §3.5 do plano).
--
-- `subjects` existe desde a migração 001 e nunca foi exposta em lugar nenhum:
-- a coluna `subject_id` de `time_entries` e de `tasks` estava lá, morta, e o
-- plano cita "matéria" em oito lugares. Esta migração não cria a tabela —
-- ela só acrescenta o que faltava e liga o resto ao que já existia.

-- Aula é texto livre, e não uma tabela.
--
-- Modelar aulas exigiria decidir numeração, módulos, ordem e o que acontece
-- quando a plataforma reorganiza o curso — decisões que o plano não toma e que
-- o uso ainda não pediu. "Aula 13 — modificadores" resolve hoje, e vira tabela
-- no dia em que houver pergunta que texto não responda.
ALTER TABLE time_entries ADD COLUMN aula TEXT;

DROP TRIGGER sync_ins_time_entries;
DROP TRIGGER sync_upd_time_entries;

CREATE TRIGGER sync_ins_time_entries AFTER INSERT ON time_entries
WHEN (SELECT aplicando FROM sync_estado WHERE unico = 1) = 0
BEGIN
  INSERT INTO sync_operations
    (id, entidade, registro_id, version, device_id, payload, criada_em)
  VALUES (
    lower(hex(randomblob(16))), 'time_entries', NEW.id, NEW.version, NEW.device_id,
    json_object('id', NEW.id, 'started_at', NEW.started_at, 'ended_at', NEW.ended_at, 'activity_type_id', NEW.activity_type_id, 'context', NEW.context, 'parent_id', NEW.parent_id, 'description', NEW.description, 'course_id', NEW.course_id, 'subject_id', NEW.subject_id, 'task_id', NEW.task_id, 'aula', NEW.aula, 'source', NEW.source, 'planejado_ms', NEW.planejado_ms, 'observacao', NEW.observacao, 'distancia_m', NEW.distancia_m, 'treino', NEW.treino, 'device_id', NEW.device_id, 'version', NEW.version, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at),
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
    json_object('id', NEW.id, 'started_at', NEW.started_at, 'ended_at', NEW.ended_at, 'activity_type_id', NEW.activity_type_id, 'context', NEW.context, 'parent_id', NEW.parent_id, 'description', NEW.description, 'course_id', NEW.course_id, 'subject_id', NEW.subject_id, 'task_id', NEW.task_id, 'aula', NEW.aula, 'source', NEW.source, 'planejado_ms', NEW.planejado_ms, 'observacao', NEW.observacao, 'distancia_m', NEW.distancia_m, 'treino', NEW.treino, 'device_id', NEW.device_id, 'version', NEW.version, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at),
    CAST(strftime('%s','now') AS INTEGER) * 1000
  );
END;

CREATE INDEX idx_entries_materia ON time_entries(subject_id) WHERE subject_id IS NOT NULL;
