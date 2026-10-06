-- Transferência dos arquivos de imagem pelo Supabase Storage (D-047, F2).
--
-- Tabela só local, sem gatilho de sincronização: marcar "já subiu" numa coluna
-- de `note_images` dispararia o gatilho de UPDATE e mandaria uma operação nova
-- para todas as máquinas a cada envio.
--
-- Uma linha por imagem cujo arquivo esta máquina já tem **e** sabe que está na
-- nuvem — porque mandou, ou porque baixou de lá. Imagem sem linha aqui e com
-- arquivo no disco é envio pendente; sem arquivo no disco, é download.

CREATE TABLE anexos_na_nuvem (
  image_id    TEXT PRIMARY KEY,
  confirmado_em INTEGER NOT NULL
);
