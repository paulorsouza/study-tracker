-- Combinações frequentes de lançamento (§3.5).
--
-- "Favoritar combinações frequentes" é atalho, não histórico: o valor está em
-- não redigitar descrição, curso e categoria toda segunda-feira. Por isso é
-- tabela própria e não uma marca em `time_entries` — favoritar uma sessão
-- específica amarraria o atalho a um dia, e o atalho tem que sobreviver ao dia.

CREATE TABLE time_favorites (
  id               TEXT PRIMARY KEY,
  rotulo           TEXT NOT NULL,
  descricao        TEXT,
  activity_type_id TEXT NOT NULL REFERENCES activity_types(id),
  course_id        TEXT REFERENCES courses(id),
  task_id          TEXT REFERENCES tasks(id),
  -- Ordena a lista por uso real. Quem usa três atalhos não quer caçá-los.
  usos             INTEGER NOT NULL DEFAULT 0,
  device_id        TEXT NOT NULL,
  version          INTEGER NOT NULL DEFAULT 1,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL,
  deleted_at       INTEGER
);

CREATE INDEX idx_favoritos_uso ON time_favorites(usos DESC) WHERE deleted_at IS NULL;

CREATE TRIGGER sync_ins_time_favorites AFTER INSERT ON time_favorites
WHEN (SELECT aplicando FROM sync_estado WHERE unico = 1) = 0
BEGIN
  INSERT INTO sync_operations
    (id, entidade, registro_id, version, device_id, payload, criada_em)
  VALUES (
    lower(hex(randomblob(16))), 'time_favorites', NEW.id, NEW.version, NEW.device_id,
    json_object('id', NEW.id, 'rotulo', NEW.rotulo, 'descricao', NEW.descricao, 'activity_type_id', NEW.activity_type_id, 'course_id', NEW.course_id, 'task_id', NEW.task_id, 'usos', NEW.usos, 'device_id', NEW.device_id, 'version', NEW.version, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at),
    CAST(strftime('%s','now') AS INTEGER) * 1000
  );
END;

CREATE TRIGGER sync_upd_time_favorites AFTER UPDATE ON time_favorites
WHEN (SELECT aplicando FROM sync_estado WHERE unico = 1) = 0
BEGIN
  INSERT INTO sync_operations
    (id, entidade, registro_id, version, device_id, payload, criada_em)
  VALUES (
    lower(hex(randomblob(16))), 'time_favorites', NEW.id, NEW.version, NEW.device_id,
    json_object('id', NEW.id, 'rotulo', NEW.rotulo, 'descricao', NEW.descricao, 'activity_type_id', NEW.activity_type_id, 'course_id', NEW.course_id, 'task_id', NEW.task_id, 'usos', NEW.usos, 'device_id', NEW.device_id, 'version', NEW.version, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at),
    CAST(strftime('%s','now') AS INTEGER) * 1000
  );
END;
