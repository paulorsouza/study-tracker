-- Metas por tipo de atividade, com piso e teto.
--
-- Piso e teto em vez de um número só porque as duas perguntas são diferentes e
-- ambas importam numa rotina: "estudei o bastante?" e "descansei demais?". Uma
-- meta pode ter só piso (estudo), só teto (lazer) ou os dois (academia, onde
-- treinar de menos e treinar de mais são problemas distintos).
--
-- Os dois campos são anuláveis de propósito: exigir os dois forçaria o usuário
-- a inventar um limite que ele não tem.
CREATE TABLE activity_goals (
  id            TEXT PRIMARY KEY,
  activity_type_id TEXT NOT NULL REFERENCES activity_types(id),
  -- 'dia' ou 'semana'. Semana é o padrão sugerido: dia é rígido demais para
  -- rotina real, e o plano é explícito em não punir pausa.
  periodo       TEXT NOT NULL CHECK (periodo IN ('dia','semana')),
  min_minutos   INTEGER,
  max_minutos   INTEGER,
  device_id     TEXT NOT NULL,
  version       INTEGER NOT NULL DEFAULT 1,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  deleted_at    INTEGER,
  -- Ao menos um dos dois lados precisa existir, senão a meta não diz nada.
  CHECK (min_minutos IS NOT NULL OR max_minutos IS NOT NULL),
  CHECK (min_minutos IS NULL OR max_minutos IS NULL OR min_minutos <= max_minutos)
);

-- Uma meta por tipo e período. O índice é parcial para que uma meta excluída
-- não impeça a criação de outra no mesmo lugar.
CREATE UNIQUE INDEX idx_meta_unica
  ON activity_goals(activity_type_id, periodo) WHERE deleted_at IS NULL;
