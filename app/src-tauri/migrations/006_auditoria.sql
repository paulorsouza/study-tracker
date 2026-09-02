-- Auditoria das alterações vindas de fora do app (§4.2).
--
-- O plano exige que "todas as alterações via MCP fiquem em um histórico de
-- auditoria". A tabela é append-only e guarda o que mudou, não só que mudou:
-- sem o corpo do pedido, "a IA criou uma tarefa" é informação inútil na hora
-- em que aparece uma tarefa que ninguém reconhece.
CREATE TABLE audit_events (
  id         TEXT PRIMARY KEY,
  -- 'mcp' ou 'extensao'. Extensão também é registrada: se um dia o token dela
  -- vazar, o histórico é o que mostra o que foi feito com ele.
  origem     TEXT NOT NULL,
  acao       TEXT NOT NULL,
  -- JSON do pedido, já sem campos livres longos. É rastro, não backup.
  detalhe    TEXT,
  resultado  TEXT NOT NULL CHECK (resultado IN ('ok','recusado','erro')),
  device_id  TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_audit_quando ON audit_events(created_at DESC);
