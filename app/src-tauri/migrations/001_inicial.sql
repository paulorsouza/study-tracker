-- Esquema inicial. Convenções que valem para o banco inteiro:
--
--  * ids são TEXT (UUID v4, ou slug estável nas linhas semeadas);
--  * instantes são INTEGER em milissegundos desde a época, sempre UTC —
--    fuso e horário de verão são problema da camada de apresentação;
--  * toda tabela sincronizável carrega device_id, version, created_at,
--    updated_at e deleted_at desde já (D-002), mesmo sem servidor;
--  * exclusão é sempre lógica: deleted_at preenchido. Nada some de verdade,
--    porque a área de recuperação do plano (§7) depende disso.

CREATE TABLE settings (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);

-- Categorias de atividade. O usuário pode criar as suas; estas vêm semeadas
-- porque um app de estudos vazio na primeira abertura não ajuda ninguém.
CREATE TABLE activity_types (
  id          TEXT PRIMARY KEY,
  nome        TEXT NOT NULL,
  cor         TEXT NOT NULL,
  icone       TEXT,
  -- Marca o que conta como "tempo efetivo de estudo" nos relatórios. Separado
  -- do nome de propósito: renomear a categoria não muda a contabilidade.
  conta_como_estudo INTEGER NOT NULL DEFAULT 0,
  ordem       INTEGER NOT NULL DEFAULT 0,
  device_id   TEXT NOT NULL,
  version     INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  deleted_at  INTEGER
);

CREATE TABLE platforms (
  id          TEXT PRIMARY KEY,
  nome        TEXT NOT NULL,
  url_base    TEXT,
  device_id   TEXT NOT NULL,
  version     INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  deleted_at  INTEGER
);

CREATE TABLE subjects (
  id          TEXT PRIMARY KEY,
  nome        TEXT NOT NULL,
  cor         TEXT,
  device_id   TEXT NOT NULL,
  version     INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  deleted_at  INTEGER
);

CREATE TABLE courses (
  id            TEXT PRIMARY KEY,
  titulo        TEXT NOT NULL,
  platform_id   TEXT REFERENCES platforms(id),
  professor     TEXT,
  categoria     TEXT,
  estado        TEXT NOT NULL DEFAULT 'nao_iniciado'
                CHECK (estado IN ('nao_iniciado','ativo','pausado','concluido','arquivado')),
  prioridade    INTEGER NOT NULL DEFAULT 0,
  progresso     INTEGER NOT NULL DEFAULT 0 CHECK (progresso BETWEEN 0 AND 100),
  meta_minutos  INTEGER,
  prazo         INTEGER,
  url_principal TEXT,
  -- Última página realmente acessada, para o botão "continuar estudando".
  ultima_url    TEXT,
  ultima_url_em INTEGER,
  -- D-004: o modo é por curso, não por plataforma, porque na Hotmart o DRM é
  -- opção do produtor. 'auto' tenta integrado e rebaixa sozinho se falhar.
  modo_de_abertura TEXT NOT NULL DEFAULT 'auto'
                CHECK (modo_de_abertura IN ('auto','integrado','navegador_dedicado')),
  favorito      INTEGER NOT NULL DEFAULT 0,
  device_id     TEXT NOT NULL,
  version       INTEGER NOT NULL DEFAULT 1,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  deleted_at    INTEGER
);

CREATE INDEX idx_courses_estado ON courses(estado) WHERE deleted_at IS NULL;

CREATE TABLE tasks (
  id             TEXT PRIMARY KEY,
  titulo         TEXT NOT NULL,
  course_id      TEXT REFERENCES courses(id),
  subject_id     TEXT REFERENCES subjects(id),
  duracao_estimada_min INTEGER,
  prioridade     INTEGER NOT NULL DEFAULT 0,
  prazo          INTEGER,
  -- Dia para o qual a tarefa está planejada, como AAAA-MM-DD na data local do
  -- usuário. Guardar como texto e não como instante é deliberado: "segunda-
  -- feira" não muda porque o usuário viajou de fuso.
  dia_planejado  TEXT,
  ordem          INTEGER NOT NULL DEFAULT 0,
  estado         TEXT NOT NULL DEFAULT 'aberta'
                 CHECK (estado IN ('aberta','concluida','cancelada')),
  concluida_em   INTEGER,
  device_id      TEXT NOT NULL,
  version        INTEGER NOT NULL DEFAULT 1,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,
  deleted_at     INTEGER
);

CREATE INDEX idx_tasks_dia ON tasks(dia_planejado) WHERE deleted_at IS NULL;

-- Lançamento de tempo. Uma linha por período real de relógio (D-005).
CREATE TABLE time_entries (
  id            TEXT PRIMARY KEY,
  started_at    INTEGER NOT NULL,
  ended_at      INTEGER,
  -- A verdade cronológica: é isto que entra na linha do tempo do dia e nunca
  -- pode duplicar.
  activity_type_id TEXT NOT NULL REFERENCES activity_types(id),
  -- Etiqueta de estrutura: filtra relatórios e nunca soma nada. É o que permite
  -- a uma caminhada durante a pausa aparecer nos dois relatórios contando uma
  -- vez só no total do dia.
  context       TEXT CHECK (context IN ('pomodoro_focus','pomodoro_break')),
  -- Agrupa os ciclos de uma mesma sessão Pomodoro. Não existe tabela de ciclos:
  -- um ciclo é um par de linhas com o mesmo parent_id.
  parent_id     TEXT REFERENCES time_entries(id),
  description   TEXT,
  course_id     TEXT REFERENCES courses(id),
  subject_id    TEXT REFERENCES subjects(id),
  task_id       TEXT REFERENCES tasks(id),
  source        TEXT NOT NULL DEFAULT 'timer'
                CHECK (source IN ('timer','manual','recuperado','dividido','unido')),
  device_id     TEXT NOT NULL,
  version       INTEGER NOT NULL DEFAULT 1,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  deleted_at    INTEGER,
  CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE INDEX idx_entries_inicio ON time_entries(started_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_entries_curso  ON time_entries(course_id)  WHERE deleted_at IS NULL;
CREATE INDEX idx_entries_pai    ON time_entries(parent_id)  WHERE parent_id IS NOT NULL;

-- Garante o "impedir dois cronômetros ativos no mesmo dispositivo" do §3.5 no
-- banco, e não só na interface: no máximo uma linha aberta por dispositivo.
-- Sessões simultâneas em dispositivos diferentes continuam possíveis de
-- propósito — o plano manda tratá-las como sobreposição visível, não como erro.
CREATE UNIQUE INDEX idx_entry_unico_ativo
  ON time_entries(device_id) WHERE ended_at IS NULL AND deleted_at IS NULL;

-- Histórico recuperável de correções (§3.5). Append-only: guarda o estado
-- anterior em JSON antes de cada alteração destrutiva.
CREATE TABLE session_revisions (
  id           TEXT PRIMARY KEY,
  entry_id     TEXT NOT NULL,
  operacao     TEXT NOT NULL
               CHECK (operacao IN ('editar','dividir','unir','excluir','restaurar')),
  estado_anterior TEXT NOT NULL,
  device_id    TEXT NOT NULL,
  created_at   INTEGER NOT NULL
);

CREATE INDEX idx_revisions_entry ON session_revisions(entry_id);

-- Tempo que o app não observou: lacuna de heartbeat, suspensão, queda. NÃO é
-- time_entry — vira pergunta ao usuário e só entra no total se ele mandar.
CREATE TABLE open_intervals (
  id          TEXT PRIMARY KEY,
  started_at  INTEGER NOT NULL,
  ended_at    INTEGER NOT NULL,
  -- Sessão do log do cronômetro que originou a lacuna, para rastreabilidade.
  origem      TEXT,
  motivo      TEXT NOT NULL
              CHECK (motivo IN ('app_encerrado','suspensao','relogio_alterado','inatividade')),
  resolvido_em INTEGER,
  resolucao   TEXT CHECK (resolucao IN ('manter','remover','dividir')),
  device_id   TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE INDEX idx_intervals_pendentes ON open_intervals(started_at) WHERE resolvido_em IS NULL;
