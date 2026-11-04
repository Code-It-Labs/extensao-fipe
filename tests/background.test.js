// Testes do background (src/background.js) rodando num contexto vm com fetch simulado, em dois modos:
// Chrome (service worker: objeto chrome + importScripts) e Firefox (event page: objeto browser, sem importScripts,
// scripts carregados na ordem de "background.scripts" do manifest). Confere o contrato de mensagens que o content script usa ({ ok, resultado } ou { ok: false, erro: { tipo, mensagem } }).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const P = require('../src/parser.js');
const { criarFake } = require('./fake-fipe.js');
const B = require('./fixtures/anuncio-b-logan.json');

const manifest = require('../manifest.json');
const src = (arq) => fs.readFileSync(path.join(__dirname, '../src', arq), 'utf8');

// Sobe o background no vm (modo 'chrome' ou 'firefox') e devolve uma função que envia mensagens ao listener registrado.
function subir(fetchSimulado, modo = 'chrome') {
  const armazem = new Map();
  let listener;
  // API de extensão simulada; no Firefox ela vem em "browser" e "chrome" nem existe (prova que o código prefere "browser").
  const apiSimulada = {
    runtime: { id: 'minha-extensao', onMessage: { addListener: (fn) => { listener = fn; } } },
    storage: { local: { get: async (k) => (armazem.has(k) ? { [k]: armazem.get(k) } : {}), set: async (o) => { for (const k in o) armazem.set(k, o[k]); } } },
  };
  const ctx = { fetch: fetchSimulado, [modo === 'firefox' ? 'browser' : 'chrome']: apiSimulada };
  vm.createContext(ctx);
  if (modo === 'firefox') {
    // Event page: sem importScripts; roda a lista "background.scripts" do manifest na ordem.
    for (const a of manifest.background.scripts) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', a), 'utf8'), ctx);
  } else {
    // importScripts síncrono, resolvendo relativo a src/ como no service worker real.
    ctx.importScripts = (...arqs) => arqs.forEach((a) => vm.runInContext(src(a), ctx));
    vm.runInContext(src('background.js'), ctx);
  }
  const enviar = (msg, remetente = { id: 'minha-extensao' }) => new Promise((resolve) => {
    const assincrono = listener(msg, remetente, resolve);
    if (assincrono !== true) resolve({ retorno: assincrono });
  });
  return { enviar };
}

test('casar devolve ok com o resultado do casamento', async () => {
  const sw = subir(criarFake().fetch);
  const anuncio = P.lerAnuncio({ titulo: B.titulo, preco: B.preco, sobre: B.sobre.join('\n'), descricao: B.descricao });
  const resp = await sw.enviar({ tipo: 'casar', anuncio });
  assert.equal(resp.ok, true);
  assert.equal(resp.resultado.tipo, 'provavel');
  assert.equal(resp.resultado.candidatos[0].valor, 19002);
});

test('preco devolve valor e mês da versão escolhida', async () => {
  const sw = subir(criarFake().fetch);
  const resp = await sw.enviar({ tipo: 'preco', marca: '59', modelo: '4753', anoCodigo: '2015-5' });
  // Objetos do vm têm outro protótipo: compara por JSON.
  assert.equal(JSON.stringify(resp), JSON.stringify({ ok: true, resultado: { valor: 40669, mes: 'outubro de 2026' } }));
});

test('429 vira erro de tipo limite com mensagem para o selo', async () => {
  const sw = subir(async () => ({ status: 429, ok: false, json: async () => ({}) }));
  const resp = await sw.enviar({ tipo: 'preco', marca: '59', modelo: '4753', anoCodigo: '2015-5' });
  assert.equal(resp.ok, false);
  assert.equal(resp.erro.tipo, 'limite');
  assert.match(resp.erro.mensagem, /Limite/);
});

test('rede fora do ar vira erro de tipo rede', async () => {
  const sw = subir(async () => { throw new TypeError('Failed to fetch'); });
  const resp = await sw.enviar({ tipo: 'preco', marca: '59', modelo: '4753', anoCodigo: '2015-5' });
  assert.equal(resp.erro.tipo, 'rede');
});

test('pedido desconhecido responde erro e remetente de fora é ignorado', async () => {
  const sw = subir(criarFake().fetch);
  const resp = await sw.enviar({ tipo: 'outra-coisa' });
  assert.equal(resp.ok, false);
  const fora = await sw.enviar({ tipo: 'casar' }, { id: 'outra-extensao' });
  assert.deepEqual(fora, { retorno: false });
});

// Mesmo contrato no Firefox (event page): sem importScripts, com "browser", e remetente de fora recusado.
test('Firefox: casar e preco funcionam sem importScripts e remetente de fora é recusado', async () => {
  const sw = subir(criarFake().fetch, 'firefox');
  const anuncio = P.lerAnuncio({ titulo: B.titulo, preco: B.preco, sobre: B.sobre.join('\n'), descricao: B.descricao });
  const resp = await sw.enviar({ tipo: 'casar', anuncio });
  assert.equal(resp.ok, true);
  assert.equal(resp.resultado.tipo, 'provavel');
  const preco = await sw.enviar({ tipo: 'preco', marca: '59', modelo: '4753', anoCodigo: '2015-5' });
  assert.equal(preco.resultado.valor, 40669);
  assert.deepEqual(await sw.enviar({ tipo: 'casar' }, { id: 'outra-extensao' }), { retorno: false });
});

// Endurecimento do pedido: códigos e anúncio fora do formato são recusados com erro claro, sem nenhuma chamada à API.
test('preco recusa código de marca, modelo ou ano fora do formato, sem consultar a FIPE', async () => {
  const fake = criarFake();
  const sw = subir(fake.fetch);
  const ruins = [
    { marca: '59/../x', modelo: '4753', anoCodigo: '2015-5' },
    { marca: '59', modelo: '4753?x=1', anoCodigo: '2015-5' },
    { marca: '59', modelo: '4753', anoCodigo: '2015 5' },
    { marca: '59', modelo: '', anoCodigo: '2015-5' },
    { marca: 59, modelo: '4753', anoCodigo: '2015-5' },
    { marca: '59', modelo: '4753' },
  ];
  for (const ruim of ruins) {
    const resp = await sw.enviar({ tipo: 'preco', ...ruim });
    assert.equal(resp.ok, false, JSON.stringify(ruim));
    assert.equal(resp.erro.tipo, 'pedido');
    assert.match(resp.erro.mensagem, /Pedido inválido/);
  }
  assert.deepEqual(fake.chamadas, []);
});

test('casar recusa anúncio fora do formato ou grande demais, sem consultar a FIPE', async () => {
  const fake = criarFake();
  const sw = subir(fake.fetch);
  const bom = P.lerAnuncio({ titulo: B.titulo, preco: B.preco, sobre: B.sobre.join('\n'), descricao: B.descricao });
  const ruins = [
    undefined,
    'texto',
    { ...bom, palavras: 'logan' },
    { ...bom, palavras: ['logan', 7] },
    { ...bom, palavras: Array(101).fill('a') },
    { ...bom, tokens: Array(5001).fill('a') },
    { ...bom, tokens: ['x'.repeat(201)] },
    { ...bom, ano: '2008' },
    { ...bom, cambio: { tipo: 'manual' } },
  ];
  for (const anuncio of ruins) {
    const resp = await sw.enviar({ tipo: 'casar', anuncio });
    assert.equal(resp.ok, false);
    assert.equal(resp.erro.tipo, 'pedido');
  }
  assert.deepEqual(fake.chamadas, []);
  // Anúncio sem ano (ano null) continua válido e segue para o casamento.
  const semAno = await sw.enviar({ tipo: 'casar', anuncio: { ...bom, ano: null } });
  assert.equal(semAno.ok, true);
});
