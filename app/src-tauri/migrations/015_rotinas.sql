-- Rotinas: a tarefa que se repete (§3.3, adiada em D-011, decidida em D-044).
--
-- A rotina é a regra; a tarefa do dia continua sendo uma linha comum de
-- `tasks`. Assim planejamento, cronômetro, relatórios e sincronização não
-- precisam saber que rotina existe — quem materializa é `rotinas.rs`.
--
-- `dias` é um texto com os dias da semana em que ela cai, 0 = domingo:
-- '0123456' é todo dia, '135' é segunda, quarta e sexta.

CREATE TABLE rotinas (
  id            TEXT PRIMARY KEY,
  titulo        TEXT NOT NULL,
  course_id     TEXT REFERENCES courses(id),
  activity_type_id TEXT REFERENCES activity_types(id),
  duracao_estimada_min INTEGER,
  prioridade    INTEGER NOT NULL DEFAULT 0,
  dias          TEXT NOT NULL,
  ativa         INTEGER NOT NULL DEFAULT 1,
  -- Janela opcional: um plano de estudos com data para acabar não deve
  -- continuar gerando tarefa depois do prazo.
  inicio        TEXT,
  fim           TEXT,
  device_id     TEXT NOT NULL,
  version       INTEGER NOT NULL DEFAULT 1,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  deleted_at    INTEGER
);

-- De qual rotina a tarefa nasceu. Nulo é tarefa avulsa, como todas até aqui.
ALTER TABLE tasks ADD COLUMN rotina_id TEXT REFERENCES rotinas(id);

-- Gatilhos de sincronização: a rotina viaja entre as máquinas, e a tarefa
-- ganha a coluna nova no payload (mesma regra de 011 e 013 — coluna que entra
-- em silêncio nunca chega do outro lado).
DROP TRIGGER sync_ins_tasks;
DROP TRIGGER sync_upd_tasks;

CREATE TRIGGER sync_ins_tasks AFTER INSERT ON tasks
WHEN (SELECT aplicando FROM sync_estado WHERE unico = 1) = 0
BEGIN
  INSERT INTO sync_operations
    (id, entidade, registro_id, version, device_id, payload, criada_em)
  VALUES (
    lower(hex(randomblob(16))), 'tasks', NEW.id, NEW.version, NEW.device_id,
    json_object('id', NEW.id, 'titulo', NEW.titulo, 'course_id', NEW.course_id, 'subject_id', NEW.subject_id, 'activity_type_id', NEW.activity_type_id, 'rotina_id', NEW.rotina_id, 'duracao_estimada_min', NEW.duracao_estimada_min, 'prioridade', NEW.prioridade, 'prazo', NEW.prazo, 'dia_planejado', NEW.dia_planejado, 'ordem', NEW.ordem, 'estado', NEW.estado, 'concluida_em', NEW.concluida_em, 'device_id', NEW.device_id, 'version', NEW.version, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at),
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
    json_object('id', NEW.id, 'titulo', NEW.titulo, 'course_id', NEW.course_id, 'subject_id', NEW.subject_id, 'activity_type_id', NEW.activity_type_id, 'rotina_id', NEW.rotina_id, 'duracao_estimada_min', NEW.duracao_estimada_min, 'prioridade', NEW.prioridade, 'prazo', NEW.prazo, 'dia_planejado', NEW.dia_planejado, 'ordem', NEW.ordem, 'estado', NEW.estado, 'concluida_em', NEW.concluida_em, 'device_id', NEW.device_id, 'version', NEW.version, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at),
    CAST(strftime('%s','now') AS INTEGER) * 1000
  );
END;

CREATE TRIGGER sync_ins_rotinas AFTER INSERT ON rotinas
WHEN (SELECT aplicando FROM sync_estado WHERE unico = 1) = 0
BEGIN
  INSERT INTO sync_operations
    (id, entidade, registro_id, version, device_id, payload, criada_em)
  VALUES (
    lower(hex(randomblob(16))), 'rotinas', NEW.id, NEW.version, NEW.device_id,
    json_object('id', NEW.id, 'titulo', NEW.titulo, 'course_id', NEW.course_id, 'activity_type_id', NEW.activity_type_id, 'duracao_estimada_min', NEW.duracao_estimada_min, 'prioridade', NEW.prioridade, 'dias', NEW.dias, 'ativa', NEW.ativa, 'inicio', NEW.inicio, 'fim', NEW.fim, 'device_id', NEW.device_id, 'version', NEW.version, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at),
    CAST(strftime('%s','now') AS INTEGER) * 1000
  );
END;

CREATE TRIGGER sync_upd_rotinas AFTER UPDATE ON rotinas
WHEN (SELECT aplicando FROM sync_estado WHERE unico = 1) = 0
BEGIN
  INSERT INTO sync_operations
    (id, entidade, registro_id, version, device_id, payload, criada_em)
  VALUES (
    lower(hex(randomblob(16))), 'rotinas', NEW.id, NEW.version, NEW.device_id,
    json_object('id', NEW.id, 'titulo', NEW.titulo, 'course_id', NEW.course_id, 'activity_type_id', NEW.activity_type_id, 'duracao_estimada_min', NEW.duracao_estimada_min, 'prioridade', NEW.prioridade, 'dias', NEW.dias, 'ativa', NEW.ativa, 'inicio', NEW.inicio, 'fim', NEW.fim, 'device_id', NEW.device_id, 'version', NEW.version, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at),
    CAST(strftime('%s','now') AS INTEGER) * 1000
  );
END;
