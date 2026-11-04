// Testes da decisão pura do ciclo (src/ciclo.js): troca de anúncio limpa o selo, chave estável consulta uma vez,
// conteúdo que muda depois reconsulta, sem dados limpa. O leitor de página (DOM) é testado em tests/content-facebook.test.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const C = require('../src/ciclo.js');

const dadosA = { titulo: '2015 Volkswagen Voyage', preco: 'R$ 18.000', sobre: '150 km', descricao: 'Voyage 1.6' };
// Simula N ciclos seguidos sobre uma sequência de leituras da página; devolve as ações e os estados.
function rodar(leituras) {
  let chaveVista = null, chaveConsultada = null, pedido = 0, selo = false;
  const acoes = [];
  for (const { id, dados } of leituras) {
    const d = C.decidir({ id, dados, chaveVista, chaveConsultada });
    ({ chaveVista, chaveConsultada } = d);
    if (d.acao === 'limpar') { pedido++; selo = false; }
    if (d.acao === 'consultar') selo = true;
    acoes.push(d.acao);
  }
  return { acoes, pedido, selo };
}

test('chave estável por 2 ciclos consulta uma vez só', () => {
  const l = { id: '1', dados: dadosA };
  assert.deepEqual(rodar([l, l, l, l]).acoes, ['limpar', 'consultar', 'aguardar', 'aguardar']);
});

test('troca de anúncio incrementa o pedido, limpa o selo e consulta o novo', () => {
  const a = { id: '1', dados: dadosA }, b = { id: '2', dados: { ...dadosA, titulo: '2008 Renault Logan' } };
  const r = rodar([a, a, b]);
  assert.deepEqual(r.acoes, ['limpar', 'consultar', 'limpar']);
  assert.equal(r.pedido, 2);
  assert.equal(r.selo, false);
  assert.deepEqual(rodar([a, a, b, b]).acoes.slice(-1), ['consultar']);
});

test('voltar ao anúncio anterior consulta de novo (o selo tinha sido limpo)', () => {
  const a = { id: '1', dados: dadosA }, b = { id: '2', dados: dadosA };
  assert.deepEqual(rodar([a, a, b, a, a]).acoes, ['limpar', 'consultar', 'limpar', 'limpar', 'consultar']);
});

test('ficha ou descrição que renderiza depois muda a chave e reconsulta', () => {
  const sem = { id: '1', dados: { ...dadosA, sobre: '', descricao: '' } };
  const com = { id: '1', dados: dadosA };
  assert.deepEqual(rodar([sem, sem, com, com, com]).acoes, ['limpar', 'consultar', 'limpar', 'consultar', 'aguardar']);
  assert.notEqual(C.chaveDe('1', sem.dados), C.chaveDe('1', com.dados));
});

test('sem id ou sem dados limpa e esquece as chaves', () => {
  const a = { id: '1', dados: dadosA };
  assert.deepEqual(rodar([a, a, { id: '1', dados: null }, { id: null, dados: dadosA }]).acoes, ['limpar', 'consultar', 'limpar', 'limpar']);
  const d = C.decidir({ id: '1', dados: null, chaveVista: 'x', chaveConsultada: 'x' });
  assert.deepEqual(d, { acao: 'limpar', chaveVista: null, chaveConsultada: null });
});

test('carrega como script clássico (sem module), criando o global FipeCiclo', () => {
  const ctx = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/ciclo.js'), 'utf8'), ctx);
  assert.equal(typeof ctx.FipeCiclo.decidir, 'function');
});
