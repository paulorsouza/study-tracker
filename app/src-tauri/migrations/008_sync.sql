-- Fila de sincronização (§7 do plano).
--
-- "Toda alteração é gravada primeiro no SQLite. A mesma transação cria uma
-- operação na fila local."
--
-- A fila é preenchida por **gatilho**, não por chamada de função. Isso não é
-- economia de código: gatilho torna a garantia estrutural. Com chamadas
-- espalhadas, basta alguém acrescentar um UPDATE novo em qualquer módulo e
-- esquecer a linha da fila para aquela mudança sumir na sincronização — e o
-- sintoma aparece semanas depois, na outra máquina, como dado que não chegou.
-- Com gatilho, é impossível escrever sem enfileirar.

CREATE TABLE sync_operations (
  -- Ordem local estável. É o que o cursor da outra máquina acompanha.
  seq         INTEGER PRIMARY KEY AUTOINCREMENT,
  -- Identidade da operação. É por ela que a idempotência funciona: reenviar a
  -- mesma operação duas vezes não pode produzir efeito duas vezes.
  id          TEXT NOT NULL UNIQUE,
  entidade    TEXT NOT NULL,
  registro_id TEXT NOT NULL,
  -- Versão lógica do registro no momento da operação. É o que permite decidir
  -- entre "mais nova" e "conflito de verdade" sem depender de relógio.
  version     INTEGER NOT NULL,
  device_id   TEXT NOT NULL,
  payload     TEXT NOT NULL,
  criada_em   INTEGER NOT NULL,
  -- Preenchido quando a operação já saiu daqui. Ela **não** é apagada: §7 pede
  -- que operações confirmadas continuem auditáveis por um período.
  enviada_em  INTEGER
);

CREATE INDEX idx_ops_pendentes ON sync_operations(seq) WHERE enviada_em IS NULL;

-- Até onde já lemos de cada máquina de origem.
CREATE TABLE sync_cursores (
  origem  TEXT PRIMARY KEY,
  ate_seq INTEGER NOT NULL,
  lido_em INTEGER NOT NULL
);

-- Área de recuperação (§7): o que chegou e **não** foi aplicado, com o motivo.
-- Nada é descartado em silêncio — é a diferença entre "o app resolveu" e "o app
-- perdeu meu dado".
CREATE TABLE sync_conflitos (
  id          TEXT PRIMARY KEY,
  entidade    TEXT NOT NULL,
  registro_id TEXT NOT NULL,
  motivo      TEXT NOT NULL,
  payload_remoto TEXT NOT NULL,
  payload_local  TEXT NOT NULL,
  origem      TEXT NOT NULL,
  criado_em   INTEGER NOT NULL,
  resolvido_em INTEGER,
  resolucao   TEXT
);

CREATE INDEX idx_conflitos_abertos ON sync_conflitos(criado_em) WHERE resolvido_em IS NULL;

-- Interruptor para os gatilhos.
--
-- Ao aplicar uma operação vinda de fora, a escrita não pode virar operação
-- nova: ela voltaria para a outra máquina, que a aplicaria de novo, e as duas
-- ficariam trocando a mesma mudança para sempre.
CREATE TABLE sync_estado (
  unico     INTEGER PRIMARY KEY CHECK (unico = 1),
  aplicando INTEGER NOT NULL DEFAULT 0
);
INSERT INTO sync_estado (unico, aplicando) VALUES (1, 0);

-- Gatilhos: uma operacao por escrita, na mesma transacao da escrita.
-- Gerados a partir da lista de colunas de cada tabela; acrescentar coluna
-- exige uma migracao nova que recrie o gatilho, e isso e proposital --
-- coluna que entra em silencio nao viaja para a outra maquina.


CREATE TRIGGER sync_ins_time_entries AFTER INSERT ON time_entries
WHEN (SELECT aplicando FROM sync_estado WHERE unico = 1) = 0
BEGIN
  INSERT INTO sync_operations
    (id, entidade, registro_id, version, device_id, payload, criada_em)
  VALUES (
    lower(hex(randomblob(16))), 'time_entries', NEW.id, NEW.version, NEW.device_id,
    json_object('id', NEW.id, 'started_at', NEW.started_at, 'ended_at', NEW.ended_at, 'activity_type_id', NEW.activity_type_id, 'context', NEW.context, 'parent_id', NEW.parent_id, 'description', NEW.description, 'course_id', NEW.course_id, 'subject_id', NEW.subject_id, 'task_id', NEW.task_id, 'source', NEW.source, 'planejado_ms', NEW.planejado_ms, 'device_id', NEW.device_id, 'version', NEW.version, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at),
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
    json_object('id', NEW.id, 'started_at', NEW.started_at, 'ended_at', NEW.ended_at, 'activity_type_id', NEW.activity_type_id, 'context', NEW.context, 'parent_id', NEW.parent_id, 'description', NEW.description, 'course_id', NEW.course_id, 'subject_id', NEW.subject_id, 'task_id', NEW.task_id, 'source', NEW.source, 'planejado_ms', NEW.planejado_ms, 'device_id', NEW.device_id, 'version', NEW.version, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at),
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
    json_object('id', NEW.id, 'titulo', NEW.titulo, 'course_id', NEW.course_id, 'subject_id', NEW.subject_id, 'duracao_estimada_min', NEW.duracao_estimada_min, 'prioridade', NEW.prioridade, 'prazo', NEW.prazo, 'dia_planejado', NEW.dia_planejado, 'ordem', NEW.ordem, 'estado', NEW.estado, 'concluida_em', NEW.concluida_em, 'device_id', NEW.device_id, 'version', NEW.version, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at),
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
    json_object('id', NEW.id, 'titulo', NEW.titulo, 'course_id', NEW.course_id, 'subject_id', NEW.subject_id, 'duracao_estimada_min', NEW.duracao_estimada_min, 'prioridade', NEW.prioridade, 'prazo', NEW.prazo, 'dia_planejado', NEW.dia_planejado, 'ordem', NEW.ordem, 'estado', NEW.estado, 'concluida_em', NEW.concluida_em, 'device_id', NEW.device_id, 'version', NEW.version, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at),
    CAST(strftime('%s','now') AS INTEGER) * 1000
  );
END;

CREATE TRIGGER sync_ins_courses AFTER INSERT ON courses
WHEN (SELECT aplicando FROM sync_estado WHERE unico = 1) = 0
BEGIN
  INSERT INTO sync_operations
    (id, entidade, registro_id, version, device_id, payload, criada_em)
  VALUES (
    lower(hex(randomblob(16))), 'courses', NEW.id, NEW.version, NEW.device_id,
    json_object('id', NEW.id, 'titulo', NEW.titulo, 'platform_id', NEW.platform_id, 'professor', NEW.professor, 'categoria', NEW.categoria, 'estado', NEW.estado, 'prioridade', NEW.prioridade, 'progresso', NEW.progresso, 'meta_minutos', NEW.meta_minutos, 'prazo', NEW.prazo, 'url_principal', NEW.url_principal, 'ultima_url', NEW.ultima_url, 'ultima_url_em', NEW.ultima_url_em, 'modo_de_abertura', NEW.modo_de_abertura, 'favorito', NEW.favorito, 'device_id', NEW.device_id, 'version', NEW.version, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at),
    CAST(strftime('%s','now') AS INTEGER) * 1000
  );
END;

CREATE TRIGGER sync_upd_courses AFTER UPDATE ON courses
WHEN (SELECT aplicando FROM sync_estado WHERE unico = 1) = 0
BEGIN
  INSERT INTO sync_operations
    (id, entidade, registro_id, version, device_id, payload, criada_em)
  VALUES (
    lower(hex(randomblob(16))), 'courses', NEW.id, NEW.version, NEW.device_id,
    json_object('id', NEW.id, 'titulo', NEW.titulo, 'platform_id', NEW.platform_id, 'professor', NEW.professor, 'categoria', NEW.categoria, 'estado', NEW.estado, 'prioridade', NEW.prioridade, 'progresso', NEW.progresso, 'meta_minutos', NEW.meta_minutos, 'prazo', NEW.prazo, 'url_principal', NEW.url_principal, 'ultima_url', NEW.ultima_url, 'ultima_url_em', NEW.ultima_url_em, 'modo_de_abertura', NEW.modo_de_abertura, 'favorito', NEW.favorito, 'device_id', NEW.device_id, 'version', NEW.version, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at),
    CAST(strftime('%s','now') AS INTEGER) * 1000
  );
END;

CREATE TRIGGER sync_ins_notes AFTER INSERT ON notes
WHEN (SELECT aplicando FROM sync_estado WHERE unico = 1) = 0
BEGIN
  INSERT INTO sync_operations
    (id, entidade, registro_id, version, device_id, payload, criada_em)
  VALUES (
    lower(hex(randomblob(16))), 'notes', NEW.id, NEW.version, NEW.device_id,
    json_object('id', NEW.id, 'titulo', NEW.titulo, 'conteudo', NEW.conteudo, 'modelo', NEW.modelo, 'course_id', NEW.course_id, 'task_id', NEW.task_id, 'time_entry_id', NEW.time_entry_id, 'revisar_em', NEW.revisar_em, 'revisada_em', NEW.revisada_em, 'disponivel_para_ia', NEW.disponivel_para_ia, 'fixada', NEW.fixada, 'device_id', NEW.device_id, 'version', NEW.version, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at, 'tags', (SELECT json_group_array(tag) FROM note_tags WHERE note_id = NEW.id)),
    CAST(strftime('%s','now') AS INTEGER) * 1000
  );
END;

CREATE TRIGGER sync_upd_notes AFTER UPDATE ON notes
WHEN (SELECT aplicando FROM sync_estado WHERE unico = 1) = 0
BEGIN
  INSERT INTO sync_operations
    (id, entidade, registro_id, version, device_id, payload, criada_em)
  VALUES (
    lower(hex(randomblob(16))), 'notes', NEW.id, NEW.version, NEW.device_id,
    json_object('id', NEW.id, 'titulo', NEW.titulo, 'conteudo', NEW.conteudo, 'modelo', NEW.modelo, 'course_id', NEW.course_id, 'task_id', NEW.task_id, 'time_entry_id', NEW.time_entry_id, 'revisar_em', NEW.revisar_em, 'revisada_em', NEW.revisada_em, 'disponivel_para_ia', NEW.disponivel_para_ia, 'fixada', NEW.fixada, 'device_id', NEW.device_id, 'version', NEW.version, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at, 'tags', (SELECT json_group_array(tag) FROM note_tags WHERE note_id = NEW.id)),
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
    json_object('id', NEW.id, 'nome', NEW.nome, 'cor', NEW.cor, 'cor_escura', NEW.cor_escura, 'conta_como_estudo', NEW.conta_como_estudo, 'ordem', NEW.ordem, 'device_id', NEW.device_id, 'version', NEW.version, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at),
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
    json_object('id', NEW.id, 'nome', NEW.nome, 'cor', NEW.cor, 'cor_escura', NEW.cor_escura, 'conta_como_estudo', NEW.conta_como_estudo, 'ordem', NEW.ordem, 'device_id', NEW.device_id, 'version', NEW.version, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at),
    CAST(strftime('%s','now') AS INTEGER) * 1000
  );
END;

CREATE TRIGGER sync_ins_activity_goals AFTER INSERT ON activity_goals
WHEN (SELECT aplicando FROM sync_estado WHERE unico = 1) = 0
BEGIN
  INSERT INTO sync_operations
    (id, entidade, registro_id, version, device_id, payload, criada_em)
  VALUES (
    lower(hex(randomblob(16))), 'activity_goals', NEW.id, NEW.version, NEW.device_id,
    json_object('id', NEW.id, 'activity_type_id', NEW.activity_type_id, 'periodo', NEW.periodo, 'min_minutos', NEW.min_minutos, 'max_minutos', NEW.max_minutos, 'device_id', NEW.device_id, 'version', NEW.version, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at),
    CAST(strftime('%s','now') AS INTEGER) * 1000
  );
END;

CREATE TRIGGER sync_upd_activity_goals AFTER UPDATE ON activity_goals
WHEN (SELECT aplicando FROM sync_estado WHERE unico = 1) = 0
BEGIN
  INSERT INTO sync_operations
    (id, entidade, registro_id, version, device_id, payload, criada_em)
  VALUES (
    lower(hex(randomblob(16))), 'activity_goals', NEW.id, NEW.version, NEW.device_id,
    json_object('id', NEW.id, 'activity_type_id', NEW.activity_type_id, 'periodo', NEW.periodo, 'min_minutos', NEW.min_minutos, 'max_minutos', NEW.max_minutos, 'device_id', NEW.device_id, 'version', NEW.version, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at),
    CAST(strftime('%s','now') AS INTEGER) * 1000
  );
END;

CREATE TRIGGER sync_ins_subjects AFTER INSERT ON subjects
WHEN (SELECT aplicando FROM sync_estado WHERE unico = 1) = 0
BEGIN
  INSERT INTO sync_operations
    (id, entidade, registro_id, version, device_id, payload, criada_em)
  VALUES (
    lower(hex(randomblob(16))), 'subjects', NEW.id, NEW.version, NEW.device_id,
    json_object('id', NEW.id, 'nome', NEW.nome, 'cor', NEW.cor, 'device_id', NEW.device_id, 'version', NEW.version, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at),
    CAST(strftime('%s','now') AS INTEGER) * 1000
  );
END;

CREATE TRIGGER sync_upd_subjects AFTER UPDATE ON subjects
WHEN (SELECT aplicando FROM sync_estado WHERE unico = 1) = 0
BEGIN
  INSERT INTO sync_operations
    (id, entidade, registro_id, version, device_id, payload, criada_em)
  VALUES (
    lower(hex(randomblob(16))), 'subjects', NEW.id, NEW.version, NEW.device_id,
    json_object('id', NEW.id, 'nome', NEW.nome, 'cor', NEW.cor, 'device_id', NEW.device_id, 'version', NEW.version, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at),
    CAST(strftime('%s','now') AS INTEGER) * 1000
  );
END;
