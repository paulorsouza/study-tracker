-- Campos que faltavam ao curso (§3.6) e as etiquetas dele.
--
-- Sobre a capa, duas colunas em vez de uma, e isso não é redundância:
--
--   capa_url  — de onde a imagem veio. Viaja na sincronização.
--   capa      — a imagem em si, embutida como data URL. **Não** viaja.
--
-- Se a imagem viajasse, cada edição de curso arrastaria centenas de kilobytes
-- pela fila de operações — e capa é enfeite, não dado. Cada máquina baixa a
-- sua a partir da URL. O data URL evita mexer na CSP: `img-src` já aceita
-- `data:`, enquanto liberar `https:` deixaria a janela do app buscar imagem em
-- qualquer host.

ALTER TABLE courses ADD COLUMN capa_url TEXT;
ALTER TABLE courses ADD COLUMN capa TEXT;
ALTER TABLE courses ADD COLUMN estimado_min INTEGER;

-- Tabela própria, como em `note_tags`: é o que torna "todas as etiquetas" e
-- "cursos com esta etiqueta" consultas normais em vez de LIKE sobre string.
CREATE TABLE course_tags (
  course_id TEXT NOT NULL REFERENCES courses(id),
  tag       TEXT NOT NULL,
  PRIMARY KEY (course_id, tag)
);

CREATE INDEX idx_course_tags_tag ON course_tags(tag);

-- Os gatilhos de sincronização listam as colunas uma a uma, então acrescentar
-- coluna exige recriá-los. A migração 008 avisa que isso é proposital: coluna
-- que entra em silêncio não viaja para a outra máquina, e o sintoma só
-- apareceria dias depois, do outro lado.
DROP TRIGGER sync_ins_courses;
DROP TRIGGER sync_upd_courses;

CREATE TRIGGER sync_ins_courses AFTER INSERT ON courses
WHEN (SELECT aplicando FROM sync_estado WHERE unico = 1) = 0
BEGIN
  INSERT INTO sync_operations
    (id, entidade, registro_id, version, device_id, payload, criada_em)
  VALUES (
    lower(hex(randomblob(16))), 'courses', NEW.id, NEW.version, NEW.device_id,
    json_object(
      'id', NEW.id, 'titulo', NEW.titulo, 'platform_id', NEW.platform_id,
      'professor', NEW.professor, 'categoria', NEW.categoria, 'estado', NEW.estado,
      'prioridade', NEW.prioridade, 'progresso', NEW.progresso,
      'meta_minutos', NEW.meta_minutos, 'estimado_min', NEW.estimado_min,
      'prazo', NEW.prazo, 'url_principal', NEW.url_principal,
      'ultima_url', NEW.ultima_url, 'ultima_url_em', NEW.ultima_url_em,
      'modo_de_abertura', NEW.modo_de_abertura, 'favorito', NEW.favorito,
      'capa_url', NEW.capa_url,
      'device_id', NEW.device_id, 'version', NEW.version,
      'created_at', NEW.created_at, 'updated_at', NEW.updated_at,
      'deleted_at', NEW.deleted_at,
      'tags', (SELECT json_group_array(tag) FROM course_tags WHERE course_id = NEW.id)
    ),
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
    json_object(
      'id', NEW.id, 'titulo', NEW.titulo, 'platform_id', NEW.platform_id,
      'professor', NEW.professor, 'categoria', NEW.categoria, 'estado', NEW.estado,
      'prioridade', NEW.prioridade, 'progresso', NEW.progresso,
      'meta_minutos', NEW.meta_minutos, 'estimado_min', NEW.estimado_min,
      'prazo', NEW.prazo, 'url_principal', NEW.url_principal,
      'ultima_url', NEW.ultima_url, 'ultima_url_em', NEW.ultima_url_em,
      'modo_de_abertura', NEW.modo_de_abertura, 'favorito', NEW.favorito,
      'capa_url', NEW.capa_url,
      'device_id', NEW.device_id, 'version', NEW.version,
      'created_at', NEW.created_at, 'updated_at', NEW.updated_at,
      'deleted_at', NEW.deleted_at,
      'tags', (SELECT json_group_array(tag) FROM course_tags WHERE course_id = NEW.id)
    ),
    CAST(strftime('%s','now') AS INTEGER) * 1000
  );
END;
