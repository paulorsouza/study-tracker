-- Imagens nas notas (D-047).
--
-- O desenho feito à caneta no tablet chega como imagem e fica presa à nota.
-- O arquivo mora fora do banco, em `anexos/` na pasta de dados do app: guardar
-- bytes no SQLite incharia o WAL e cada linha de sincronização. Aqui fica só o
-- que descreve a imagem — e é isso que viaja na sincronização.
--
-- `sha256` identifica o conteúdo, para conferir o arquivo que chegar de outra
-- máquina sem confiar no nome.

CREATE TABLE note_images (
  id          TEXT PRIMARY KEY,
  note_id     TEXT NOT NULL REFERENCES notes(id),
  ordem       INTEGER NOT NULL DEFAULT 0,
  mime        TEXT NOT NULL CHECK (mime IN ('image/webp','image/png','image/jpeg')),
  largura     INTEGER NOT NULL,
  altura      INTEGER NOT NULL,
  bytes       INTEGER NOT NULL,
  sha256      TEXT NOT NULL,
  device_id   TEXT NOT NULL,
  version     INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  deleted_at  INTEGER
);

CREATE INDEX idx_note_images_nota ON note_images(note_id, ordem)
  WHERE deleted_at IS NULL;

CREATE TRIGGER sync_ins_note_images AFTER INSERT ON note_images
WHEN (SELECT aplicando FROM sync_estado WHERE unico = 1) = 0
BEGIN
  INSERT INTO sync_operations
    (id, entidade, registro_id, version, device_id, payload, criada_em)
  VALUES (
    lower(hex(randomblob(16))), 'note_images', NEW.id, NEW.version, NEW.device_id,
    json_object('id', NEW.id, 'note_id', NEW.note_id, 'ordem', NEW.ordem, 'mime', NEW.mime, 'largura', NEW.largura, 'altura', NEW.altura, 'bytes', NEW.bytes, 'sha256', NEW.sha256, 'device_id', NEW.device_id, 'version', NEW.version, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at),
    CAST(strftime('%s','now') AS INTEGER) * 1000
  );
END;

CREATE TRIGGER sync_upd_note_images AFTER UPDATE ON note_images
WHEN (SELECT aplicando FROM sync_estado WHERE unico = 1) = 0
BEGIN
  INSERT INTO sync_operations
    (id, entidade, registro_id, version, device_id, payload, criada_em)
  VALUES (
    lower(hex(randomblob(16))), 'note_images', NEW.id, NEW.version, NEW.device_id,
    json_object('id', NEW.id, 'note_id', NEW.note_id, 'ordem', NEW.ordem, 'mime', NEW.mime, 'largura', NEW.largura, 'altura', NEW.altura, 'bytes', NEW.bytes, 'sha256', NEW.sha256, 'device_id', NEW.device_id, 'version', NEW.version, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at),
    CAST(strftime('%s','now') AS INTEGER) * 1000
  );
END;
