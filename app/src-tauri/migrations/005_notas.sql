-- Notas (§3.10).
--
-- Três amarras diferentes, todas opcionais e todas úteis por motivos distintos:
--
--   course_id     — "o que aprendi neste curso"
--   task_id       — "o que saiu desta tarefa"
--   time_entry_id — o instante: a nota escrita durante *aquela* sessão. É o que
--                   permite abrir um lançamento de tempo e ver o que foi
--                   produzido nele, que §3.10 pede como "nota associada ao
--                   instante da sessão".
--
-- `disponivel_para_ia` nasce em 0 de propósito. A integração por MCP (§4.2) só
-- pode ler nota marcada, e o padrão precisa ser o silêncio: uma nota pessoal
-- não vira contexto de IA por esquecimento.
CREATE TABLE notes (
  id            TEXT PRIMARY KEY,
  titulo        TEXT,
  conteudo      TEXT NOT NULL DEFAULT '',
  -- Só orienta o esqueleto inicial do texto; não muda o comportamento.
  modelo        TEXT NOT NULL DEFAULT 'livre',
  course_id     TEXT REFERENCES courses(id),
  task_id       TEXT REFERENCES tasks(id),
  time_entry_id TEXT REFERENCES time_entries(id),
  -- Data local AAAA-MM-DD, como em tasks: "revisar sábado" não deixa de ser
  -- sábado porque o usuário mudou de fuso.
  revisar_em    TEXT,
  revisada_em   INTEGER,
  disponivel_para_ia INTEGER NOT NULL DEFAULT 0,
  fixada        INTEGER NOT NULL DEFAULT 0,
  device_id     TEXT NOT NULL,
  version       INTEGER NOT NULL DEFAULT 1,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  deleted_at    INTEGER
);

CREATE INDEX idx_notes_curso    ON notes(course_id)  WHERE deleted_at IS NULL;
CREATE INDEX idx_notes_sessao   ON notes(time_entry_id) WHERE time_entry_id IS NOT NULL;
CREATE INDEX idx_notes_revisar  ON notes(revisar_em) WHERE revisar_em IS NOT NULL AND deleted_at IS NULL;

-- Tabela própria em vez de campo de texto com vírgulas: é o que torna
-- "listar todas as tags" e "notas com esta tag" consultas normais, em vez de
-- LIKE sobre string, que casa "rust" dentro de "rustico".
CREATE TABLE note_tags (
  note_id TEXT NOT NULL REFERENCES notes(id),
  tag     TEXT NOT NULL,
  PRIMARY KEY (note_id, tag)
);

CREATE INDEX idx_note_tags_tag ON note_tags(tag);
