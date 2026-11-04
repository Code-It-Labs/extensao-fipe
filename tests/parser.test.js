// Testes do parser genérico (src/parser.js): fixtures dos dois anúncios reais, formatos de preço en/pt-BR,
// ano e cilindrada com vírgula e ponto, combustível, câmbio e formatação da diferença. Rodam offline.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const P = require('../src/parser.js');
const A = require('./fixtures/anuncio-a-voyage.json');
const B = require('./fixtures/anuncio-b-logan.json');

// Monta a entrada do parser como o content script faz (ficha em linhas unidas por \n).
const ler = (f) => P.lerAnuncio({ titulo: f.titulo, preco: f.preco, sobre: f.sobre.join('\n'), descricao: f.descricao });

test('anúncio A (Voyage): ano, palavras, preço, câmbio, cilindrada e sem combustível', () => {
  const a = ler(A);
  assert.equal(a.ano, 2015);
  assert.deepEqual(a.palavras, ['volkswagen', 'voyage']);
  assert.equal(a.preco, 18000);
  assert.equal(a.cambio, 'manual');
  assert.equal(a.combustivel, null);
  assert.equal(a.cilindrada, '1.6');
});

test('anúncio B (Logan): combustível da ficha, cilindrada da descrição, preço da descrição ignorado', () => {
  const b = ler(B);
  assert.equal(b.ano, 2008);
  assert.deepEqual(b.palavras, ['renault', 'logan']);
  assert.equal(b.preco, 12900);
  assert.equal(b.combustivel, 'gasolina');
  assert.equal(b.cilindrada, '1.6');
  assert.ok(b.tokens.includes('expression'));
});

test('og:title com caixa diferente dá as mesmas palavras do h1', () => {
  assert.deepEqual(P.dividirTitulo(B.ogTitle), P.dividirTitulo(B.titulo));
});

test('preço nos formatos en e pt-BR', () => {
  assert.equal(P.lerPreco('R$18,000'), 18000);
  assert.equal(P.lerPreco('R$ 18.000'), 18000);
  assert.equal(P.lerPreco('R$ 12.900,00'), 12900);
  assert.equal(P.lerPreco('R$ 19.002,00'), 19002);
  assert.equal(P.lerPreco('R$ 1.234,56'), 1234.56);
  assert.equal(P.lerPreco('R$1,234.50'), 1234.5);
  assert.equal(P.lerPreco('sem preço'), null);
});

test('cilindrada com vírgula ou ponto; ignora milhares e preços', () => {
  assert.equal(P.lerCilindrada('Voyage 1,6 2015'), '1.6');
  assert.equal(P.lerCilindrada('motor 1.0 flex'), '1.0');
  assert.equal(P.lerCilindrada('Fip = 41,000'), null);
  assert.equal(P.lerCilindrada('Tabela FIPE: R$ 19.000,00 / Valor de venda: R$ 12.900,00'), null);
  assert.equal(P.lerCilindrada('Driven 150,000 km'), null);
});

test('ano no título: início, meio e ausente', () => {
  assert.equal(P.dividirTitulo('2008 Renault LOGAN').ano, 2008);
  assert.equal(P.dividirTitulo('Fiat Uno 1.0 2012').ano, 2012);
  assert.equal(P.dividirTitulo('Fiat Uno').ano, null);
  // "1.6" e "1,6" viram o mesmo token, sem confundir com ano.
  assert.deepEqual(P.dividirTitulo('2010 Gol 1,6').palavras, ['gol', '1.6']);
});

test('combustível e câmbio da ficha (en e palpites pt-BR)', () => {
  assert.equal(P.lerCombustivel('Fuel type: Gasoline'), 'gasolina');
  assert.equal(P.lerCombustivel('Fuel type: Diesel'), 'diesel');
  assert.equal(P.lerCombustivel('Combustível: Álcool'), 'alcool');
  assert.equal(P.lerCombustivel('Combustível: Flex'), 'flex');
  assert.equal(P.lerCombustivel('Driven 1 km'), null);
  assert.equal(P.lerCambio('Manual transmission'), 'manual');
  assert.equal(P.lerCambio('Automatic transmission'), 'automatico');
  assert.equal(P.lerCambio('Câmbio automático'), 'automatico');
  assert.equal(P.lerCambio('nada'), null);
});

test('formatação da diferença para a FIPE', () => {
  assert.equal(P.formatarDiferenca(18000, 41572), 'R$ 23.572 abaixo da FIPE (57%)');
  assert.equal(P.formatarDiferenca(45000, 40000), 'R$ 5.000 acima da FIPE (13%)');
  assert.equal(P.formatarDiferenca(40000, 40000), 'igual à FIPE');
  assert.equal(P.formatarDiferenca(null, 40000), null);
  assert.equal(P.formatarReal(41572), 'R$ 41.572');
});

test('carrega como script clássico (sem module), criando o global FipeParser', () => {
  const codigo = fs.readFileSync(path.join(__dirname, '../src/parser.js'), 'utf8');
  const ctx = {};
  vm.runInNewContext(codigo, ctx);
  assert.equal(typeof ctx.FipeParser.lerPreco, 'function');
  assert.equal(ctx.FipeParser.lerPreco('R$ 18.000'), 18000);
});

test('câmbio automático inferido do texto livre: só palavra inteira, e "manual" impede a inferência', () => {
  const cambio = (descricao, titulo = '2015 Volkswagen Gol') => P.lerAnuncio({ titulo, preco: 'R$ 1', descricao }).cambio;
  assert.equal(cambio('Câmbio automático, revisado'), 'automatico');
  assert.equal(cambio('Zen 1.6 Aut. completo'), 'automatico');
  assert.equal(cambio('', '2015 Volkswagen Gol Automática'), 'automatico');
  // Falsos positivos: letra acentuada colada em "aut".
  assert.equal(cambio('carro autêntico'), null);
  assert.equal(cambio('vendo autônomo'), null);
  assert.equal(cambio('autor do anúncio, autopeças'), null);
  // Descrição que diz manual não vira automático, mesmo negando o outro.
  assert.equal(cambio('câmbio manual, não é automático'), null);
  assert.equal(cambio('Manual 5 marchas'), null);
  // A ficha continua mandando.
  assert.equal(P.lerAnuncio({ titulo: '2015 Gol', sobre: 'Manual transmission', descricao: 'automático' }).cambio, 'manual');
});

test('normalizar: "Ka+" vira "ka plus" e o sinal de mais isolado some', () => {
  assert.equal(P.normalizar('Ford Ka+ Sedan'), 'ford ka plus sedan');
  assert.equal(P.normalizar('1.0 + 2'), '1.0 2');
});

test('lerAnuncio: token com mais de 200 caracteres é descartado e os outros ficam', () => {
  const anuncio = P.lerAnuncio({ titulo: '2015 Volkswagen Voyage', descricao: 'carro ' + 'a'.repeat(201) + ' revisado' });
  assert.ok(anuncio.tokens.includes('revisado') && anuncio.tokens.includes('carro'));
  assert.ok(!anuncio.tokens.some((t) => t.length > 200));
});

// Limites que o service worker exige (anuncioValido em src/background.js): o parser os respeita para nenhum anúncio real ser recusado só por tamanho.
test('lerAnuncio: palavra do título com mais de 200 caracteres é descartada e as outras ficam', () => {
  const anuncio = P.lerAnuncio({ titulo: '2015 Volkswagen ' + 'b'.repeat(300) + ' Voyage' });
  assert.deepEqual(anuncio.palavras, ['volkswagen', 'voyage']);
});

test('lerAnuncio: título com 150 palavras vira no máximo 100, na ordem', () => {
  const titulo = '2015 ' + Array.from({ length: 150 }, (_, i) => 'p' + i).join(' ');
  const anuncio = P.lerAnuncio({ titulo });
  assert.equal(anuncio.palavras.length, 100);
  assert.equal(anuncio.palavras[0], 'p0');
  assert.equal(anuncio.palavras[99], 'p99');
});

test('lerAnuncio: descrição com 6000 palavras distintas vira no máximo 5000 tokens, na ordem', () => {
  const descricao = Array.from({ length: 6000 }, (_, i) => 'w' + i).join(' ');
  const anuncio = P.lerAnuncio({ titulo: '2015 Gol', descricao });
  assert.equal(anuncio.tokens.length, 5000);
  // Título entra antes da descrição ("2015", "gol"); depois vêm as palavras da descrição na ordem.
  assert.deepEqual(anuncio.tokens.slice(0, 4), ['2015', 'gol', 'w0', 'w1']);
});
