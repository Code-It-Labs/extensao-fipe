// Gera icons/icon16.png, icon48.png e icon128.png: uma etiqueta de preço azul com a letra "F" branca.
// Só Node (zlib e Buffer), sem biblioteca. Uso: node tools/gerar-icones.js (os PNGs ficam versionados).
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const AZUL = [26, 86, 196];
const BRANCO = [255, 255, 255];
const SUPER = 4; // amostras por lado em cada pixel (suaviza as bordas)

// Dentro de um retângulo [x0,x1] x [y0,y1] (coordenadas de 0 a 1).
const ret = (x, y, x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;

// Cor de um ponto do desenho (coordenadas de 0 a 1): null = fora da etiqueta (transparente).
function cor(x, y) {
  // Corpo da etiqueta: retângulo mais a ponta triangular à esquerda.
  const corpo = ret(x, y, 0.3, 0.1, 0.94, 0.9) || (x >= 0.06 && x < 0.3 && Math.abs(y - 0.5) <= (x - 0.06) * (0.4 / 0.24));
  if (!corpo) return null;
  // Furo da etiqueta (círculo branco).
  if ((x - 0.2) ** 2 + (y - 0.5) ** 2 <= 0.05 ** 2) return BRANCO;
  // Letra F: haste vertical, barra de cima e barra do meio.
  if (ret(x, y, 0.46, 0.26, 0.59, 0.74) || ret(x, y, 0.46, 0.26, 0.82, 0.39) || ret(x, y, 0.46, 0.46, 0.74, 0.58)) return BRANCO;
  return AZUL;
}

// Pixels RGBA de um ícone de lado `n`, com média das subamostras.
function desenhar(n) {
  const px = Buffer.alloc(n * n * 4);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      let a = 0, r = 0, g = 0, b = 0;
      for (let sj = 0; sj < SUPER; sj++) {
        for (let si = 0; si < SUPER; si++) {
          const c = cor((i + (si + 0.5) / SUPER) / n, (j + (sj + 0.5) / SUPER) / n);
          if (c) { a++; r += c[0]; g += c[1]; b += c[2]; }
        }
      }
      const o = (j * n + i) * 4;
      if (a) { px[o] = Math.round(r / a); px[o + 1] = Math.round(g / a); px[o + 2] = Math.round(b / a); }
      px[o + 3] = Math.round((a / (SUPER * SUPER)) * 255);
    }
  }
  return px;
}

// Um bloco PNG: tamanho, tipo, dados e CRC.
function bloco(tipo, dados) {
  const t = Buffer.from(tipo, 'ascii');
  const cab = Buffer.alloc(4); cab.writeUInt32BE(dados.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(Buffer.concat([t, dados])));
  return Buffer.concat([cab, t, dados, crc]);
}

// Codifica RGBA em PNG (8 bits, filtro 0 em todas as linhas).
function codificarPng(n, px) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(n, 0); ihdr.writeUInt32BE(n, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8 bits por canal, RGBA
  const linhas = Buffer.alloc(n * (n * 4 + 1));
  for (let j = 0; j < n; j++) px.copy(linhas, j * (n * 4 + 1) + 1, j * n * 4, (j + 1) * n * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloco('IHDR', ihdr), bloco('IDAT', zlib.deflateSync(linhas)), bloco('IEND', Buffer.alloc(0)),
  ]);
}

// Grava os três tamanhos.
if (require.main === module) {
  const pasta = path.join(__dirname, '..', 'icons');
  fs.mkdirSync(pasta, { recursive: true });
  for (const n of [16, 48, 128]) fs.writeFileSync(path.join(pasta, `icon${n}.png`), codificarPng(n, desenhar(n)));
  console.log('Ícones gerados em', pasta);
}
