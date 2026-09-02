-- Troca as cores das categorias por uma paleta validada para daltonismo, e
-- separa o tom claro do escuro.
--
-- As cores originais foram escolhidas no olho, para tema escuro. Rodadas no
-- validador de paleta categórica elas reprovaram em três checagens no tema
-- claro: faixa de luminosidade, piso de croma (cinza lê como "sem dado") e o
-- piso de visão normal — o par Pausa/Estudo ficava com ΔE 12,2, abaixo do
-- mínimo de 15, difícil de distinguir mesmo com visão de cores completa.
--
-- Um tom só não serve para os dois temas: o passo escuro é escolhido contra a
-- superfície escura, não é o claro clareado. Daí a coluna nova.
--
-- A ordem das categorias é o mecanismo de segurança para daltonismo — os pares
-- vizinhos é que precisam se separar. Mexer em `ordem` sem revalidar quebra
-- isso em silêncio.

ALTER TABLE activity_types ADD COLUMN cor_escura TEXT;

-- Só troca a linha que ainda está com a cor semeada original: se o usuário já
-- personalizou a categoria, a escolha dele fica.
UPDATE activity_types SET cor = '#2a78d6', cor_escura = '#3987e5', ordem = 0
  WHERE id = 'at-estudo'       AND cor = '#7aa2f7';
UPDATE activity_types SET cor = '#eb6834', cor_escura = '#d95926', ordem = 1
  WHERE id = 'at-academia'     AND cor = '#f7768e';
UPDATE activity_types SET cor = '#1baf7a', cor_escura = '#199e70', ordem = 2
  WHERE id = 'at-caminhada'    AND cor = '#9ece6a';
UPDATE activity_types SET cor = '#eda100', cor_escura = '#c98500', ordem = 3
  WHERE id = 'at-exercicio'    AND cor = '#e0af68';
UPDATE activity_types SET cor = '#e87ba4', cor_escura = '#d55181', ordem = 4
  WHERE id = 'at-descanso'     AND cor = '#bb9af7';
UPDATE activity_types SET cor = '#008300', cor_escura = '#008300', ordem = 5
  WHERE id = 'at-deslocamento' AND cor = '#7dcfff';
UPDATE activity_types SET cor = '#4a3aa7', cor_escura = '#9085e9', ordem = 6
  WHERE id = 'at-pausa'        AND cor = '#9a9aa4';
UPDATE activity_types SET cor = '#e34948', cor_escura = '#e66767', ordem = 7
  WHERE id = 'at-pessoal'      AND cor = '#c0caf5';
