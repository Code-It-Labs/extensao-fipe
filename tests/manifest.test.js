// Testes do manifest.json: é JSON válido, MV3, permissões mínimas e todos os arquivos referenciados existem.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');
const m = JSON.parse(fs.readFileSync(path.join(raiz, 'manifest.json'), 'utf8'));

test('manifest MV3 com permissões mínimas', () => {
  assert.equal(m.manifest_version, 3);
  assert.deepEqual(m.permissions, ['storage']);
  // Só a FIPE: o content script estático já é injetado pelo "matches", sem host_permissions do Facebook.
  assert.deepEqual(m.host_permissions, ['https://fipe.parallelum.com.br/*']);
  // Um bloco por site: Facebook Marketplace (www, web e m) e OLX; todos em document_idle.
  assert.deepEqual(m.content_scripts.map((c) => c.matches), [['https://*.facebook.com/marketplace/*'], ['https://*.olx.com.br/*']]);
  for (const c of m.content_scripts) assert.equal(c.run_at, 'document_idle');
  assert.match(m.name + m.description, /Marketplace/);
  assert.match(m.name + m.description, /OLX/);
});

test('parser, ciclo e selo comum vêm antes do leitor de cada site e todos os arquivos referenciados existem', () => {
  const [fb, olx] = m.content_scripts;
  assert.deepEqual(fb.js, ['src/parser.js', 'src/ciclo.js', 'src/selo-comum.js', 'src/content-facebook.js']);
  assert.deepEqual(olx.js, ['src/parser.js', 'src/ciclo.js', 'src/selo-comum.js', 'src/content-olx.js']);
  const icones = [...Object.values(m.icons), ...Object.values(m.action.default_icon)];
  for (const arq of [m.background.service_worker, ...m.background.scripts, ...m.content_scripts.flatMap((c) => [...c.js, ...c.css]), ...icones, m.action.default_popup]) {
    assert.ok(fs.existsSync(path.join(raiz, arq)), `faltando: ${arq}`);
  }
});

// Popup de ajuda ao clicar no ícone e ícones nos tamanhos que os navegadores pedem.
test('manifest registra ícones e popup', () => {
  assert.deepEqual(Object.keys(m.icons), ['16', '48', '128']);
  assert.deepEqual(m.action.default_icon, m.icons);
  assert.equal(m.action.default_popup, 'src/popup.html');
});

// Chrome lê service_worker e o Firefox lê scripts (cada um ignora a outra chave); parser e fipe antes do background.
test('background serve Chrome (service_worker) e Firefox (scripts) e o Firefox tem id e versão mínima', () => {
  assert.equal(m.background.service_worker, 'src/background.js');
  assert.deepEqual(m.background.scripts, ['src/parser.js', 'src/fipe.js', 'src/background.js']);
  assert.equal(m.browser_specific_settings.gecko.id, 'extensao-fipe@codeitlabs.com.br');
  // 127 = primeira versão do Firefox que concede host_permissions na instalação.
  assert.equal(m.browser_specific_settings.gecko.strict_min_version, '127.0');
});

// package.json e manifest.json andam juntos: mesma versão (o pacote e a Release saem da versão do manifest) e licença MIT declarada.
test('package.json tem a mesma versão do manifest e licença MIT', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(raiz, 'package.json'), 'utf8'));
  assert.equal(pkg.version, m.version);
  assert.equal(pkg.license, 'MIT');
});
