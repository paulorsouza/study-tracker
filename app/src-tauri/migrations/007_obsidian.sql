-- Rastro do que o app escreveu no vault.
--
-- Existe para uma coisa só: **nunca sobrescrever edição do usuário em
-- silêncio**, que a secao 17 do plano classifica como risco Alto.
--
-- A regra: antes de reescrever um arquivo, o app compara o conteudo atual em
-- disco com o hash do que ele mesmo gravou da ultima vez. Se bate, o arquivo
-- esta como o app deixou e pode ser atualizado. Se nao bate, alguem editou por
-- fora -- e ai o app nao toca, avisa.
--
-- Guardar hash e nao o conteudo e deliberado: o conteudo ja esta no vault, e
-- duplica-lo no banco criaria uma segunda copia para divergir.
CREATE TABLE obsidian_arquivos (
  caminho     TEXT PRIMARY KEY,
  hash        TEXT NOT NULL,
  escrito_em  INTEGER NOT NULL,
  -- Marcado quando a comparacao falhou. Fica registrado para a tela poder
  -- listar o que deixou de ser atualizado, em vez de o usuario descobrir por
  -- acaso que o app parou de exportar aquele arquivo.
  conflito_em INTEGER
);
