-- Modo família (D-042): resumo agregado de minutos por categoria e dia,
-- visível para o resto da família mesmo com cada pessoa no seu próprio banco.
--
-- O interruptor é por categoria e nasce desligado: nenhuma categoria viaja
-- para o hub da família até o dono decidir que ela vai. Nome de curso, tarefa
-- ou nota nunca fazem parte do que sai — só o total de minutos.

ALTER TABLE activity_types ADD COLUMN compartilhar_familia INTEGER NOT NULL DEFAULT 0;

-- Gatilho refeito com a coluna nova: coluna que entra em silêncio no payload
-- nunca chega na outra máquina da mesma pessoa (mesmo problema do ícone, em
-- 011_atividades_pessoais.sql).
DROP TRIGGER sync_ins_activity_types;
DROP TRIGGER sync_upd_activity_types;

CREATE TRIGGER sync_ins_activity_types AFTER INSERT ON activity_types
WHEN (SELECT aplicando FROM sync_estado WHERE unico = 1) = 0
BEGIN
  INSERT INTO sync_operations
    (id, entidade, registro_id, version, device_id, payload, criada_em)
  VALUES (
    lower(hex(randomblob(16))), 'activity_types', NEW.id, NEW.version, NEW.device_id,
    json_object('id', NEW.id, 'nome', NEW.nome, 'cor', NEW.cor, 'cor_escura', NEW.cor_escura, 'icone', NEW.icone, 'campos_extra', NEW.campos_extra, 'conta_como_estudo', NEW.conta_como_estudo, 'compartilhar_familia', NEW.compartilhar_familia, 'ordem', NEW.ordem, 'device_id', NEW.device_id, 'version', NEW.version, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at),
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
    json_object('id', NEW.id, 'nome', NEW.nome, 'cor', NEW.cor, 'cor_escura', NEW.cor_escura, 'icone', NEW.icone, 'campos_extra', NEW.campos_extra, 'conta_como_estudo', NEW.conta_como_estudo, 'compartilhar_familia', NEW.compartilhar_familia, 'ordem', NEW.ordem, 'device_id', NEW.device_id, 'version', NEW.version, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at),
    CAST(strftime('%s','now') AS INTEGER) * 1000
  );
END;
