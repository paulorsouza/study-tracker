/**
 * Gera o ícone do app sem depender de editor gráfico nem de biblioteca.
 *
 * A marca é o mesmo anel de progresso que o Pomodoro desenha dentro do app —
 * um ícone que repete uma forma que o usuário já vê é reconhecido mais rápido
 * do que um símbolo novo e bonito.
 *
 *   node gerar-icone.mjs           → escreve origem.png (1024×1024)
 *   npx tauri icon icons/origem.png → gera todos os tamanhos e o .ico
 *
 * A suavização é por superamostragem: cada pixel final é a média de 3×3
 * amostras. Sem isso, o anel fica serrilhado nos tamanhos pequenos, que são
 * justamente onde o ícone passa a maior parte da vida.
 */

import zlib from "node:zlib";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const TAM = 1024;
const AA = 3;

// --- geometria --------------------------------------------------------------

const raioCanto = TAM * 0.225;
const cx = TAM / 2;
const cy = TAM / 2;
const raioAnel = TAM * 0.29;
const espessura = TAM * 0.105;

/** Distância até a borda do retângulo arredondado; negativa do lado de dentro. */
function dentroDoLadrilho(x, y) {
  const dx = Math.abs(x - cx) - (TAM / 2 - raioCanto);
  const dy = Math.abs(y - cy) - (TAM / 2 - raioCanto);
  if (dx <= 0 || dy <= 0) return true;
  return Math.hypot(dx, dy) <= raioCanto;
}

function noAnel(x, y, deVerdade) {
  const d = Math.hypot(x - cx, y - cy);
  if (Math.abs(d - raioAnel) > espessura / 2) return false;
  if (!deVerdade) return true;
  // Arco aberto: começa no topo e para pouco antes de fechar, deixando a
  // abertura que dá a leitura de "em andamento".
  let a = Math.atan2(y - cy, x - cx);
  a = (a + Math.PI * 2.5) % (Math.PI * 2); // 0 no topo, crescendo horário
  return a <= Math.PI * 1.64;
}

/** Ponteiro curto para cima: sem ele o anel aberto pode ser lido como "C". */
function noPonteiro(x, y) {
  const meia = espessura * 0.41;
  return (
    Math.abs(x - cx) <= meia &&
    y <= cy &&
    y >= cy - raioAnel * 0.56 &&
    Math.hypot(x - cx, y - cy) <= raioAnel * 0.56 + meia
  );
}

// --- cores ------------------------------------------------------------------

const FUNDO_A = [0x5b, 0x7c, 0xf7];
const FUNDO_B = [0x3b, 0x5b, 0xdb];
const TRILHO = [0xff, 0xff, 0xff, 0x47];
const MARCA = [0xff, 0xff, 0xff, 0xff];

function amostra(x, y) {
  if (!dentroDoLadrilho(x, y)) return [0, 0, 0, 0];

  if (noAnel(x, y, true) || noPonteiro(x, y)) return MARCA;
  if (noAnel(x, y, false)) {
    // Trilho translúcido sobre o fundo, resolvido aqui para o PNG não precisar
    // de composição depois.
    const t = (x + y) / (TAM * 2);
    const f = FUNDO_A.map((c, i) => c + (FUNDO_B[i] - c) * t);
    const a = TRILHO[3] / 255;
    return [
      Math.round(f[0] * (1 - a) + 255 * a),
      Math.round(f[1] * (1 - a) + 255 * a),
      Math.round(f[2] * (1 - a) + 255 * a),
      255,
    ];
  }

  const t = (x + y) / (TAM * 2);
  return [
    Math.round(FUNDO_A[0] + (FUNDO_B[0] - FUNDO_A[0]) * t),
    Math.round(FUNDO_A[1] + (FUNDO_B[1] - FUNDO_A[1]) * t),
    Math.round(FUNDO_A[2] + (FUNDO_B[2] - FUNDO_A[2]) * t),
    255,
  ];
}

// --- rasterização -----------------------------------------------------------

const linhas = Buffer.alloc(TAM * (TAM * 4 + 1));
for (let y = 0; y < TAM; y++) {
  const base = y * (TAM * 4 + 1);
  linhas[base] = 0; // filtro "nenhum"
  for (let x = 0; x < TAM; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < AA; sy++) {
      for (let sx = 0; sx < AA; sx++) {
        const p = amostra(x + (sx + 0.5) / AA, y + (sy + 0.5) / AA);
        r += p[0] * p[3];
        g += p[1] * p[3];
        b += p[2] * p[3];
        a += p[3];
      }
    }
    const i = base + 1 + x * 4;
    if (a === 0) {
      linhas[i] = linhas[i + 1] = linhas[i + 2] = linhas[i + 3] = 0;
    } else {
      linhas[i] = Math.round(r / a);
      linhas[i + 1] = Math.round(g / a);
      linhas[i + 2] = Math.round(b / a);
      linhas[i + 3] = Math.round(a / (AA * AA));
    }
  }
}

// --- PNG --------------------------------------------------------------------

const tabelaCrc = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (const b of buf) c = tabelaCrc[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function bloco(tipo, dados) {
  const t = Buffer.from(tipo, "ascii");
  const tam = Buffer.alloc(4);
  tam.writeUInt32BE(dados.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, dados])));
  return Buffer.concat([tam, t, dados, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(TAM, 0);
ihdr.writeUInt32BE(TAM, 4);
ihdr[8] = 8; // bits por canal
ihdr[9] = 6; // RGBA
ihdr[10] = ihdr[11] = ihdr[12] = 0;

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  bloco("IHDR", ihdr),
  bloco("IDAT", zlib.deflateSync(linhas, { level: 9 })),
  bloco("IEND", Buffer.alloc(0)),
]);

const aqui = fileURLToPath(new URL(".", import.meta.url));
fs.writeFileSync(aqui + "origem.png", png);
console.log("origem.png:", (png.length / 1024).toFixed(1), "KB");
