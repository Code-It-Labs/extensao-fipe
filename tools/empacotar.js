// Empacota a extensão para distribuição: gera dist/extensao-fipe-chrome-<versao>.zip e dist/extensao-fipe-firefox-<versao>.zip
// só com os arquivos que o manifest usa mais a LICENSE (a MIT pede o aviso de copyright junto de cópias). O manifest.json da raiz é a fonte; cada pacote recebe uma cópia ajustada ao navegador.
// Zip feito em JS puro (zlib), sem depender do comando "zip" do sistema. Uso: node tools/empacotar.js
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const raiz = path.join(__dirname, '..');

// Função pura: copia o manifest tirando o que o navegador alvo não reconhece (o Chrome avisa de chave desconhecida).
function gerarManifesto(manifest, alvo) {
  const m = JSON.parse(JSON.stringify(manifest));
  if (alvo === 'chrome') {
    delete m.browser_specific_settings;
    delete m.background.scripts;
  } else if (alvo === 'firefox') {
    delete m.background.service_worker;
  } else {
    throw new Error(`Alvo desconhecido: ${alvo}`);
  }
  return m;
}

// Arquivos locais citados no HTML do popup (href e src), relativos à pasta do HTML.
function arquivosDoHtml(arquivoHtml) {
  const html = fs.readFileSync(path.join(raiz, arquivoHtml), 'utf8');
  const refs = [...html.matchAll(/(?:href|src)="([^"#:]+)"/g)].map((r) => r[1]);
  return refs.map((r) => path.posix.join(path.posix.dirname(arquivoHtml), r));
}

// Lista (sem repetição) dos arquivos que o pacote leva: tudo que o manifest cita, o que o popup carrega e a LICENSE.
// Recebe o manifest da raiz (com background.scripts): no Chrome o service worker carrega esses mesmos arquivos por importScripts.
function listarArquivos(manifest) {
  const lista = [
    manifest.background.service_worker,
    ...(manifest.background.scripts || []),
    ...manifest.content_scripts.flatMap((c) => [...(c.js || []), ...(c.css || [])]),
    ...Object.values(manifest.icons || {}),
    ...Object.values(manifest.action.default_icon || {}),
    manifest.action.default_popup,
    ...arquivosDoHtml(manifest.action.default_popup),
    'LICENSE',
  ];
  return [...new Set(lista.filter(Boolean))].sort();
}

// Data e hora no formato MS-DOS usado pelo zip.
function dataDos(d) {
  return {
    hora: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    dia: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

// Monta um zip a partir de [{ nome, dados }]: entradas deflate, nomes com "/" e diretório central no fim.
function criarZip(entradas) {
  const { hora, dia } = dataDos(new Date());
  const partes = [];
  const central = [];
  let pos = 0;
  for (const { nome, dados } of entradas) {
    const nomeBuf = Buffer.from(nome, 'utf8');
    const comp = zlib.deflateRawSync(dados);
    const crc = zlib.crc32(dados);
    // Cabeçalho local do arquivo (flag 0x800 = nome em UTF-8).
    const loc = Buffer.alloc(30);
    loc.writeUInt32LE(0x04034b50, 0); loc.writeUInt16LE(20, 4); loc.writeUInt16LE(0x800, 6); loc.writeUInt16LE(8, 8);
    loc.writeUInt16LE(hora, 10); loc.writeUInt16LE(dia, 12); loc.writeUInt32LE(crc, 14);
    loc.writeUInt32LE(comp.length, 18); loc.writeUInt32LE(dados.length, 22); loc.writeUInt16LE(nomeBuf.length, 26);
    // Entrada do diretório central, apontando para o cabeçalho local.
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x800, 8);
    cen.writeUInt16LE(8, 10); cen.writeUInt16LE(hora, 12); cen.writeUInt16LE(dia, 14); cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(comp.length, 20); cen.writeUInt32LE(dados.length, 24); cen.writeUInt16LE(nomeBuf.length, 28);
    cen.writeUInt32LE(pos, 42);
    central.push(cen, nomeBuf);
    partes.push(loc, nomeBuf, comp);
    pos += 30 + nomeBuf.length + comp.length;
  }
  const dirCentral = Buffer.concat(central);
  // Fim do diretório central.
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0); fim.writeUInt16LE(entradas.length, 8); fim.writeUInt16LE(entradas.length, 10);
  fim.writeUInt32LE(dirCentral.length, 12); fim.writeUInt32LE(pos, 16);
  return Buffer.concat([...partes, dirCentral, fim]);
}

// Entradas do pacote de um alvo: manifest gerado + arquivos do projeto.
function montarEntradas(manifest, alvo) {
  const gerado = gerarManifesto(manifest, alvo);
  const arquivos = listarArquivos(manifest).map((nome) => ({ nome, dados: fs.readFileSync(path.join(raiz, nome)) }));
  return [{ nome: 'manifest.json', dados: Buffer.from(JSON.stringify(gerado, null, 2) + '\n') }, ...arquivos];
}

// Gera os dois zips em dist/ e imprime o que cada um contém.
function main() {
  const manifest = JSON.parse(fs.readFileSync(path.join(raiz, 'manifest.json'), 'utf8'));
  const dist = path.join(raiz, 'dist');
  fs.mkdirSync(dist, { recursive: true });
  for (const alvo of ['chrome', 'firefox']) {
    const entradas = montarEntradas(manifest, alvo);
    const destino = path.join(dist, `extensao-fipe-${alvo}-${manifest.version}.zip`);
    fs.writeFileSync(destino, criarZip(entradas));
    console.log(`${destino} (${fs.statSync(destino).size} bytes)`);
    for (const e of entradas) console.log(`  ${e.nome}`);
  }
}

if (require.main === module) main();
module.exports = { gerarManifesto, listarArquivos, criarZip, montarEntradas };
