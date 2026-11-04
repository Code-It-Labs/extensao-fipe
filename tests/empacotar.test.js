// Testes da distribuição (offline): manifest gerado por navegador, arquivos do pacote, ícones PNG e conteúdo do zip.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { gerarManifesto, listarArquivos, criarZip, montarEntradas } = require('../tools/empacotar.js');

const raiz = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(raiz, 'manifest.json'), 'utf8'));

// Lê o diretório central do zip: devolve { nome: conteúdo } conferindo o CRC de cada arquivo.
function lerZip(buf) {
  const fim = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const total = buf.readUInt16LE(fim + 10);
  let pos = buf.readUInt32LE(fim + 16);
  const saida = {};
  for (let i = 0; i < total; i++) {
    const tam = buf.readUInt32LE(pos + 20), nomeLen = buf.readUInt16LE(pos + 28);
    const nome = buf.toString('utf8', pos + 46, pos + 46 + nomeLen);
    const loc = buf.readUInt32LE(pos + 42);
    const ini = loc + 30 + buf.readUInt16LE(loc + 26) + buf.readUInt16LE(loc + 28);
    const dados = zlib.inflateRawSync(buf.subarray(ini, ini + tam));
    assert.equal(zlib.crc32(dados), buf.readUInt32LE(pos + 16), `CRC de ${nome}`);
    saida[nome] = dados;
    pos += 46 + nomeLen;
  }
  return saida;
}

// Arquivos que um manifest gerado referencia.
function referenciados(m) {
  return [
    m.background.service_worker, ...(m.background.scripts || []),
    ...m.content_scripts.flatMap((c) => [...c.js, ...c.css]),
    ...Object.values(m.icons), ...Object.values(m.action.default_icon), m.action.default_popup,
  ].filter(Boolean);
}

test('manifest do Chrome não tem as chaves que o Chrome estranha', () => {
  const m = gerarManifesto(manifest, 'chrome');
  assert.equal(m.browser_specific_settings, undefined);
  assert.equal(m.background.scripts, undefined);
  assert.equal(m.background.service_worker, manifest.background.service_worker);
});

test('manifest do Firefox não tem service_worker e mantém id e scripts', () => {
  const m = gerarManifesto(manifest, 'firefox');
  assert.equal(m.background.service_worker, undefined);
  assert.deepEqual(m.background.scripts, manifest.background.scripts);
  assert.deepEqual(m.browser_specific_settings, manifest.browser_specific_settings);
});

test('o gerador não altera o manifest de origem e copia versão, permissões e sites como estão', () => {
  const antes = JSON.stringify(manifest);
  for (const alvo of ['chrome', 'firefox']) {
    const m = gerarManifesto(manifest, alvo);
    assert.equal(m.version, manifest.version);
    assert.deepEqual(m.host_permissions, manifest.host_permissions);
    assert.deepEqual(m.content_scripts, manifest.content_scripts);
  }
  assert.equal(JSON.stringify(manifest), antes);
  assert.throws(() => gerarManifesto(manifest, 'safari'));
});

for (const alvo of ['chrome', 'firefox']) {
  test(`pacote ${alvo}: só leva arquivos que existem, cobre o que o manifest cita e não leva testes nem docs`, () => {
    const zip = lerZip(criarZip(montarEntradas(manifest, alvo)));
    const nomes = Object.keys(zip);
    for (const arq of referenciados(gerarManifesto(manifest, alvo))) assert.ok(nomes.includes(arq), `fora do zip: ${arq}`);
    for (const nome of nomes.filter((n) => n !== 'manifest.json')) assert.ok(fs.existsSync(path.join(raiz, nome)), `não existe: ${nome}`);
    assert.ok(nomes.includes('src/popup.css'), 'popup.css (citado no HTML) fora do zip');
    // A licença MIT vai nos dois pacotes (o aviso de copyright acompanha as cópias); README e demais .md ficam de fora.
    assert.ok(nomes.includes('LICENSE'), 'LICENSE fora do zip');
    assert.match(zip.LICENSE.toString('utf8'), /^MIT License/);
    assert.ok(nomes.every((n) => !/^(tests|docs|node_modules|dist|tools)\//.test(n) && !/^package/.test(n) && !n.endsWith('.md')), nomes.join(', '));
    assert.deepEqual(JSON.parse(zip['manifest.json']), gerarManifesto(manifest, alvo));
  });
}

// No Chrome o service worker carrega seus scripts por importScripts (não aparecem no manifest dele): os nomes são lidos
// da linha importScripts(...) de src/background.js, para que mudá-la sem mexer no manifest quebre este teste.
test('pacote do Chrome leva os arquivos que o background importa', () => {
  const fonte = fs.readFileSync(path.join(raiz, manifest.background.service_worker), 'utf8');
  const chamada = fonte.match(/importScripts\(([^)]*)\)/);
  assert.ok(chamada, 'importScripts(...) não encontrado em background.js');
  const importados = [...chamada[1].matchAll(/'([^']+)'|"([^"]+)"/g)].map((m) => path.posix.join(path.posix.dirname(manifest.background.service_worker), m[1] || m[2]));
  assert.ok(importados.length > 0, 'importScripts sem arquivos');
  const nomes = Object.keys(lerZip(criarZip(montarEntradas(manifest, 'chrome'))));
  for (const arq of importados) assert.ok(nomes.includes(arq), `importado por background.js e fora do zip: ${arq}`);
  // O Firefox carrega os mesmos arquivos por background.scripts, na mesma ordem e com o próprio background no fim.
  assert.deepEqual(manifest.background.scripts, [...importados, manifest.background.service_worker]);
});

test('ícones PNG existem com 16, 48 e 128 pixels', () => {
  for (const [tam, arq] of Object.entries(manifest.icons)) {
    const buf = fs.readFileSync(path.join(raiz, arq));
    assert.equal(buf.toString('latin1', 1, 4), 'PNG', arq);
    assert.equal(buf.readUInt32BE(16), Number(tam), `largura de ${arq}`);
    assert.equal(buf.readUInt32BE(20), Number(tam), `altura de ${arq}`);
  }
  assert.deepEqual(Object.keys(manifest.icons), ['16', '48', '128']);
});

test('popup: HTML sem CSS nem JS embutido', () => {
  const html = fs.readFileSync(path.join(raiz, manifest.action.default_popup), 'utf8');
  assert.ok(!/<style|\sstyle=|\son[a-z]+=/i.test(html));
  assert.ok(!/<script(?![^>]*\ssrc=)/i.test(html));
});
