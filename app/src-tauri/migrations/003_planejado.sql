-- Quanto a fase deveria ter durado.
--
-- §3.4 do plano pede o registro da diferença entre tempo planejado e tempo
-- efetivo. O efetivo já sai de `ended_at - started_at`; o planejado não existia
-- em lugar nenhum. Fica nulo para lançamento comum — só fase de Pomodoro tem
-- duração prevista.
ALTER TABLE time_entries ADD COLUMN planejado_ms INTEGER;
