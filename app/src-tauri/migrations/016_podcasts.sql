-- Podcasts (D-046).
--
-- O app não toca áudio: quem toca é o AntennaPod, no celular. O que falta lá é
-- o outro lado do mesmo problema que o app já resolve para curso e tarefa —
-- decidir o que ouvir e saber quanto tempo foi. Por isso o episódio vira
-- tarefa quando entra no plano do dia, em vez de virar uma agenda paralela.
--
-- A assinatura entra por OPML, exportado do AntennaPod. Não há API pública
-- para ler o que já foi ouvido lá, e inventar uma sincronização que não existe
-- seria pior que a importação manual.

CREATE TABLE podcasts (
  id          TEXT PRIMARY KEY,
  titulo      TEXT NOT NULL,
  feed_url    TEXT NOT NULL,
  site        TEXT,
  -- A categoria decide se o tempo conta como estudo: podcast de mercado conta,
  -- o de humor não. Sem ela, o número do dia misturaria os dois.
  activity_type_id TEXT REFERENCES activity_types(id),
  ativo       INTEGER NOT NULL DEFAULT 1,
  atualizado_em INTEGER,
  device_id   TEXT NOT NULL,
  version     INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  deleted_at  INTEGER
);

CREATE UNIQUE INDEX idx_podcasts_feed ON podcasts(feed_url) WHERE deleted_at IS NULL;

CREATE TABLE episodios (
  id            TEXT PRIMARY KEY,
  podcast_id    TEXT NOT NULL REFERENCES podcasts(id),
  titulo        TEXT NOT NULL,
  -- Identidade do episódio no feed. É por ela que o id local é derivado, então
  -- reimportar o mesmo feed não duplica nada.
  guid          TEXT,
  url           TEXT,
  publicado_em  INTEGER,
  duracao_s     INTEGER,
  estado        TEXT NOT NULL DEFAULT 'novo'
                CHECK (estado IN ('novo','fila','ouvido','pulado')),
  dia_planejado TEXT,
  ouvido_em     INTEGER,
  device_id     TEXT NOT NULL,
  version       INTEGER NOT NULL DEFAULT 1,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  deleted_at    INTEGER
);

CREATE INDEX idx_episodios_podcast ON episodios(podcast_id, publicado_em)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_episodios_estado ON episodios(estado) WHERE deleted_at IS NULL;

-- A tarefa que nasce de um episódio planejado.
ALTER TABLE tasks ADD COLUMN episodio_id TEXT REFERENCES episodios(id);

DROP TRIGGER sync_ins_tasks;
DROP TRIGGER sync_upd_tasks;

CREATE TRIGGER sync_ins_tasks AFTER INSERT ON tasks
WHEN (SELECT aplicando FROM sync_estado WHERE unico = 1) = 0
BEGIN
  INSERT INTO sync_operations
    (id, entidade, registro_id, version, device_id, payload, criada_em)
  VALUES (
    lower(hex(randomblob(16))), 'tasks', NEW.id, NEW.version, NEW.device_id,
    json_object('id', NEW.id, 'titulo', NEW.titulo, 'course_id', NEW.course_id, 'subject_id', NEW.subject_id, 'activity_type_id', NEW.activity_type_id, 'rotina_id', NEW.rotina_id, 'episodio_id', NEW.episodio_id, 'duracao_estimada_min', NEW.duracao_estimada_min, 'prioridade', NEW.prioridade, 'prazo', NEW.prazo, 'dia_planejado', NEW.dia_planejado, 'ordem', NEW.ordem, 'estado', NEW.estado, 'concluida_em', NEW.concluida_em, 'device_id', NEW.device_id, 'version', NEW.version, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at),
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
    json_object('id', NEW.id, 'titulo', NEW.titulo, 'course_id', NEW.course_id, 'subject_id', NEW.subject_id, 'activity_type_id', NEW.activity_type_id, 'rotina_id', NEW.rotina_id, 'episodio_id', NEW.episodio_id, 'duracao_estimada_min', NEW.duracao_estimada_min, 'prioridade', NEW.prioridade, 'prazo', NEW.prazo, 'dia_planejado', NEW.dia_planejado, 'ordem', NEW.ordem, 'estado', NEW.estado, 'concluida_em', NEW.concluida_em, 'device_id', NEW.device_id, 'version', NEW.version, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at),
    CAST(strftime('%s','now') AS INTEGER) * 1000
  );
END;

CREATE TRIGGER sync_ins_podcasts AFTER INSERT ON podcasts
WHEN (SELECT aplicando FROM sync_estado WHERE unico = 1) = 0
BEGIN
  INSERT INTO sync_operations
    (id, entidade, registro_id, version, device_id, payload, criada_em)
  VALUES (
    lower(hex(randomblob(16))), 'podcasts', NEW.id, NEW.version, NEW.device_id,
    json_object('id', NEW.id, 'titulo', NEW.titulo, 'feed_url', NEW.feed_url, 'site', NEW.site, 'activity_type_id', NEW.activity_type_id, 'ativo', NEW.ativo, 'device_id', NEW.device_id, 'version', NEW.version, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at),
    CAST(strftime('%s','now') AS INTEGER) * 1000
  );
END;

CREATE TRIGGER sync_upd_podcasts AFTER UPDATE ON podcasts
WHEN (SELECT aplicando FROM sync_estado WHERE unico = 1) = 0
BEGIN
  INSERT INTO sync_operations
    (id, entidade, registro_id, version, device_id, payload, criada_em)
  VALUES (
    lower(hex(randomblob(16))), 'podcasts', NEW.id, NEW.version, NEW.device_id,
    json_object('id', NEW.id, 'titulo', NEW.titulo, 'feed_url', NEW.feed_url, 'site', NEW.site, 'activity_type_id', NEW.activity_type_id, 'ativo', NEW.ativo, 'device_id', NEW.device_id, 'version', NEW.version, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at),
    CAST(strftime('%s','now') AS INTEGER) * 1000
  );
END;

CREATE TRIGGER sync_ins_episodios AFTER INSERT ON episodios
WHEN (SELECT aplicando FROM sync_estado WHERE unico = 1) = 0
BEGIN
  INSERT INTO sync_operations
    (id, entidade, registro_id, version, device_id, payload, criada_em)
  VALUES (
    lower(hex(randomblob(16))), 'episodios', NEW.id, NEW.version, NEW.device_id,
    json_object('id', NEW.id, 'podcast_id', NEW.podcast_id, 'titulo', NEW.titulo, 'guid', NEW.guid, 'url', NEW.url, 'publicado_em', NEW.publicado_em, 'duracao_s', NEW.duracao_s, 'estado', NEW.estado, 'dia_planejado', NEW.dia_planejado, 'ouvido_em', NEW.ouvido_em, 'device_id', NEW.device_id, 'version', NEW.version, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at),
    CAST(strftime('%s','now') AS INTEGER) * 1000
  );
END;

CREATE TRIGGER sync_upd_episodios AFTER UPDATE ON episodios
WHEN (SELECT aplicando FROM sync_estado WHERE unico = 1) = 0
BEGIN
  INSERT INTO sync_operations
    (id, entidade, registro_id, version, device_id, payload, criada_em)
  VALUES (
    lower(hex(randomblob(16))), 'episodios', NEW.id, NEW.version, NEW.device_id,
    json_object('id', NEW.id, 'podcast_id', NEW.podcast_id, 'titulo', NEW.titulo, 'guid', NEW.guid, 'url', NEW.url, 'publicado_em', NEW.publicado_em, 'duracao_s', NEW.duracao_s, 'estado', NEW.estado, 'dia_planejado', NEW.dia_planejado, 'ouvido_em', NEW.ouvido_em, 'device_id', NEW.device_id, 'version', NEW.version, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at),
    CAST(strftime('%s','now') AS INTEGER) * 1000
  );
END;
