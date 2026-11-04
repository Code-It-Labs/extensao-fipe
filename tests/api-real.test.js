// Verificação opcional contra a API FIPE real (rede). Pulada por padrão; ligue com FIPE_REAL=1:
//   FIPE_REAL=1 node --test tests/api-real.test.js
// Gasta cota diária da API pública (cerca de 25 consultas na primeira vez). Os valores esperados são de
// outubro/2026; em outro mês de referência o teste confere só o formato e avisa no console.
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../src/parser.js');
const F = require('../src/fipe.js');

const ligado = !!process.env.FIPE_REAL;
const mapa = new Map();
const cache = { get: async (k) => mapa.get(k), set: async (k, v) => { mapa.set(k, v); } };
const cliente = F.criarCliente({ fetch: (u) => fetch(u), cache });

test('valores de verificação (Logan 4481, Voyage 6809 e 4753)', { skip: !ligado }, async () => {
  const casos = [['48', '4481', '2008-5', 19002], ['59', '6809', '2015-5', 41572], ['59', '4753', '2015-5', 40669]];
  for (const [marca, modelo, ano, esperado] of casos) {
    const r = await F.consultarPreco(cliente, marca, modelo, ano);
    if (r.mes === 'outubro de 2026') assert.equal(r.valor, esperado, `${marca}/${modelo}/${ano}`);
    else { console.warn(`Referência ${r.mes}: valor ${r.valor} (esperado de out/2026: ${esperado})`); assert.ok(r.valor > 1000); }
  }
});

test('casamento ponta a ponta do anúncio B contra a API real', { skip: !ligado }, async () => {
  const B = require('./fixtures/anuncio-b-logan.json');
  const anuncio = P.lerAnuncio({ titulo: B.titulo, preco: B.preco, sobre: B.sobre.join('\n'), descricao: B.descricao });
  const r = await F.casar(cliente, anuncio);
  assert.equal(r.tipo, 'provavel');
  assert.equal(r.candidatos[0].modelo, '4481');
});
