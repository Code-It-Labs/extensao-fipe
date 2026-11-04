// Testes do cliente FIPE e do casamento (src/fipe.js) com fetch simulado, offline: alias de marca, pontuação,
// escolha do código de ano, casamento dos dois anúncios reais, limites de consulta, cache e erros de rede/429.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const P = require('../src/parser.js');
const F = require('../src/fipe.js');
const { criarFake } = require('./fake-fipe.js');
const dados = require('./fixtures/fipe-voyage-logan.json');
const A = require('./fixtures/anuncio-a-voyage.json');
const B = require('./fixtures/anuncio-b-logan.json');

const ler = (f) => P.lerAnuncio({ titulo: f.titulo, preco: f.preco, sobre: f.sobre.join('\n'), descricao: f.descricao });
const nChamadas = (fake, re) => fake.chamadas.filter((c) => re.test(c)).length;
const novoCliente = (fake, extra = {}) => F.criarCliente({ fetch: fake.fetch, cache: fake.cache, ...extra });

test('alias de marca: nomes do Facebook para nomes FIPE', () => {
  const marca = (titulo) => (F.acharMarca(P.dividirTitulo(titulo).palavras, dados.marcas) || {}).marca?.name;
  assert.equal(marca('2015 Volkswagen Voyage'), 'VW - VolksWagen');
  assert.equal(marca('2015 VW Gol'), 'VW - VolksWagen');
  assert.equal(marca('2012 Chevrolet Onix'), 'GM - Chevrolet');
  assert.equal(marca('2012 Mercedes-Benz C180'), 'Mercedes-Benz');
  assert.equal(marca('2012 Mercedes C180'), 'Mercedes-Benz');
  assert.equal(marca('2012 Kia Sportage'), 'Kia Motors');
  assert.equal(marca('2012 Land Rover Defender'), 'Land Rover');
  assert.equal(marca('2012 Citroen C3'), 'Citroën');
  assert.equal(marca('2008 Renault LOGAN'), 'Renault');
  assert.equal(marca('2018 Yamaha Fazer'), undefined);
  // Resto do título depois da marca.
  assert.deepEqual(F.acharMarca(P.dividirTitulo('2012 Land Rover Defender').palavras, dados.marcas).resto, ['defender']);
});

test('pontuação: palavra igual vale mais que abreviação; cilindrada errada penaliza; câmbio', () => {
  const b = ler(B);
  const exata = F.pontuar('LOGAN Expression Hi-Flex 1.6 8V 4p', 'logan', b);
  const abrev = F.pontuar('LOGAN Expres. Avantage Flex 1.6 16V 4p', 'logan', b);
  const outraCil = F.pontuar('LOGAN Expres./Exp. UP Hi-Flex 1.0 16V 4p', 'logan', b);
  assert.ok(exata - abrev >= 1, `${exata} vs ${abrev}`);
  assert.ok(outraCil < abrev);
  // Anúncio manual penaliza versão "Aut."; anúncio automático favorece.
  const aut = 'LOGAN Zen Flex 1.6 16V 4p Aut.', mec = 'LOGAN Zen Flex 1.6 16V 4p Mec.';
  assert.ok(F.pontuar(mec, 'logan', { ...b, cambio: 'manual' }) > F.pontuar(aut, 'logan', { ...b, cambio: 'manual' }));
  assert.ok(F.pontuar(aut, 'logan', { ...b, cambio: 'automatico' }) > F.pontuar(mec, 'logan', { ...b, cambio: 'automatico' }));
});

test('código de ano: combustível do anúncio, senão flex, senão o primeiro; ano ausente = null', () => {
  const anos = [{ code: '2015-1', name: '2015 Gasolina' }, { code: '2015-5', name: '2015 Flex' }, { code: '2016-5', name: '2016 Flex' }];
  assert.equal(F.escolherAno(anos, 2015, 'gasolina').code, '2015-1');
  assert.equal(F.escolherAno(anos, 2015, null).code, '2015-5');
  assert.equal(F.escolherAno(anos, 2015, 'diesel').code, '2015-5');
  assert.equal(F.escolherAno([{ code: '2015-1', name: '2015 Gasolina' }], 2015, null).code, '2015-1');
  assert.equal(F.escolherAno(anos, 2020, null), null);
});

test('anúncio B (Logan 2008, gasolina informada): resolve para o modelo 4481, 2008-5, R$ 19.002', async () => {
  const fake = criarFake();
  const r = await F.casar(novoCliente(fake), ler(B));
  assert.equal(r.tipo, 'provavel');
  assert.equal(r.candidatos[0].modelo, '4481');
  assert.equal(r.candidatos[0].anoCodigo, '2008-5');
  assert.equal(r.candidatos[0].valor, 19002);
  assert.equal(r.mes, 'outubro de 2026');
  assert.equal(r.confiancaBaixa, false);
  // Só uma consulta de preço; nenhuma URL desconhecida do fixture.
  assert.equal(nChamadas(fake, /years\/\d/), 1);
  assert.deepEqual(fake.desconhecidas, []);
});

test('anúncio A (Voyage 1.6 2015, sem combustível): ambíguo, com faixa e opções para escolher', async () => {
  const fake = criarFake();
  const r = await F.casar(novoCliente(fake), ler(A));
  assert.equal(r.tipo, 'ambiguo');
  // Faixa vem dos valores reais consultados (até 5) e contém o Trendline 1.6 (41.572) e o City Mi (40.669).
  const consultados = r.candidatos.filter((c) => c.valor);
  assert.ok(consultados.length >= 2 && consultados.length <= 5);
  assert.equal(r.faixa.min, Math.min(...consultados.map((c) => c.valor)));
  assert.equal(r.faixa.max, Math.max(...consultados.map((c) => c.valor)));
  assert.ok(r.faixa.min <= 40669 && r.faixa.max >= 41572);
  const porModelo = (m) => r.candidatos.find((c) => c.modelo === m);
  assert.equal(porModelo('6809').anoCodigo, '2015-5');
  assert.equal(porModelo('6809').valor, 41572);
  assert.equal(porModelo('4753').valor, 40669);
  // Todas as opções são 1.6 e têm 2015 válido; versões 1.0 não aparecem.
  assert.ok(r.candidatos.every((c) => /1\.6/.test(c.nome)));
  // Limites: no máximo 5 preços e, no máximo, 2 rodadas de 20 consultas de anos.
  assert.ok(nChamadas(fake, /years\/\d/) <= 5);
  assert.ok(nChamadas(fake, /\/years$/) <= 40);
  assert.deepEqual(fake.desconhecidas, []);
});

test('segunda consulta do mesmo anúncio usa só o cache (sem novas chamadas)', async () => {
  const fake = criarFake();
  const cliente = novoCliente(fake);
  await F.casar(cliente, ler(B));
  const antes = fake.chamadas.length;
  await F.casar(cliente, ler(B));
  assert.equal(fake.chamadas.length, antes);
  // Preço guardado atrelado ao mês de referência (código 338).
  assert.ok(await fake.cache.get('preco:338:48:4481:2008-5'));
});

test('cache vence em 30 dias (listas) e refaz a consulta', async () => {
  const fake = criarFake();
  let agora = 0;
  const cliente = novoCliente(fake, { agora: () => agora });
  await cliente.marcas();
  agora = 29 * 864e5;
  await cliente.marcas();
  assert.equal(nChamadas(fake, /brands$/), 1);
  agora = 31 * 864e5;
  await cliente.marcas();
  assert.equal(nChamadas(fake, /brands$/), 2);
});

test('sem marca reconhecida, modelo inexistente e ano inexistente', async () => {
  const fake = criarFake();
  const cliente = novoCliente(fake);
  const moto = P.lerAnuncio({ titulo: '2018 Yamaha Fazer', preco: 'R$ 10.000' });
  assert.equal((await F.casar(cliente, moto)).tipo, 'sem-marca');
  const semAno = P.lerAnuncio({ titulo: 'Volkswagen Voyage', preco: 'R$ 10.000' });
  assert.equal((await F.casar(cliente, semAno)).tipo, 'sem-marca');
  const modelo = await F.casar(cliente, P.lerAnuncio({ titulo: '2015 Volkswagen Foobar', preco: 'R$ 10.000' }));
  assert.equal(modelo.tipo, 'nenhum');
  assert.deepEqual(modelo.lido, { marca: 'VW - VolksWagen', modelo: 'foobar', ano: 2015 });
  const ano = await F.casar(cliente, P.lerAnuncio({ titulo: '2045 Volkswagen Voyage', preco: 'R$ 10.000' }));
  assert.equal(ano.tipo, 'nenhum');
});

test('versão escolhida à mão: consulta só o preço dela', async () => {
  const fake = criarFake();
  const r = await F.consultarPreco(novoCliente(fake), '59', '4753', '2015-5');
  assert.deepEqual(r, { valor: 40669, mes: 'outubro de 2026' });
});

test('erros: 429 e rede fora do ar viram ErroFipe, sem retentativa', async () => {
  const cache = { get: async () => undefined, set: async () => {} };
  let n = 0;
  const f429 = async () => { n++; return { status: 429, ok: false, json: async () => ({}) }; };
  await assert.rejects(novoClienteCom(f429, cache).marcas(), (e) => e instanceof F.ErroFipe && e.tipo === 'limite');
  assert.equal(n, 1);
  n = 0;
  const fRede = async () => { n++; throw new TypeError('Failed to fetch'); };
  await assert.rejects(novoClienteCom(fRede, cache).marcas(), (e) => e.tipo === 'rede');
  assert.equal(n, 1);
  const f500 = async () => ({ status: 500, ok: false, json: async () => ({}) });
  await assert.rejects(novoClienteCom(f500, cache).marcas(), (e) => e.tipo === 'http');
});
// Cliente com fetch e cache próprios (para simular falhas de rede).
function novoClienteCom(fetch, cache) { return F.criarCliente({ fetch, cache }); }

test('emParalelo respeita o limite e mantém a ordem', async () => {
  let ativos = 0, pico = 0;
  const tarefas = [1, 2, 3, 4, 5, 6].map((i) => async () => { ativos++; pico = Math.max(pico, ativos); await new Promise((r) => setTimeout(r, 5)); ativos--; return i; });
  assert.deepEqual(await F.emParalelo(tarefas, 3), [1, 2, 3, 4, 5, 6]);
  assert.equal(pico, 3);
});

test('carrega como script clássico no service worker (parser.js e fipe.js em sequência)', () => {
  const ler1 = (arq) => fs.readFileSync(path.join(__dirname, '../src', arq), 'utf8');
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(ler1('parser.js'), ctx);
  vm.runInContext(ler1('fipe.js'), ctx);
  assert.equal(typeof ctx.FipeApi.casar, 'function');
});

test('T-Cross não casa com "T.Flex" dos Voyage: o nome FIPE tem de começar pelo modelo do título', async () => {
  const fake = criarFake();
  const r = await F.casar(novoCliente(fake), P.lerAnuncio({ titulo: '2015 Volkswagen T-Cross', preco: 'R$ 80.000' }));
  assert.equal(r.tipo, 'nenhum');
  assert.deepEqual(r.lido, { marca: 'VW - VolksWagen', modelo: 't cross', ano: 2015 });
  // Palavra de uma letra sozinha nunca vira candidato (título "2015 Volkswagen T").
  const so = await F.casar(novoCliente(criarFake()), P.lerAnuncio({ titulo: '2015 Volkswagen T', preco: 'R$ 80.000' }));
  assert.equal(so.tipo, 'nenhum');
  // Duas palavras que não casam caem para a primeira, se ela tiver 2 letras ou mais ("Voyage Trendline").
  const v = await F.casar(novoCliente(criarFake()), P.lerAnuncio({ titulo: '2015 Volkswagen Voyage Trendline 1.6', preco: 'R$ 18.000' }));
  assert.notEqual(v.tipo, 'nenhum');
});

test('duas casar simultâneas com cache frio fazem as mesmas chamadas de uma só; /references uma vez', async () => {
  const sozinha = criarFake();
  await F.casar(novoCliente(sozinha), ler(A));
  const fake = criarFake();
  const cliente = novoCliente(fake);
  await Promise.all([F.casar(cliente, ler(A)), F.casar(cliente, ler(A))]);
  assert.equal(fake.chamadas.length, sozinha.chamadas.length);
  assert.equal(nChamadas(fake, /^\/references$/), 1);
});

test('consulta em andamento que falha é esquecida: a próxima tenta de novo', async () => {
  const cache = { get: async () => undefined, set: async () => {} };
  let n = 0;
  const fetch = async () => { n++; if (n === 1) throw new TypeError('x'); return { status: 200, ok: true, json: async () => [] }; };
  const c = novoClienteCom(fetch, cache);
  await assert.rejects(c.marcas(), (e) => e.tipo === 'rede');
  assert.deepEqual(await c.marcas(), []);
  assert.equal(n, 2);
});

test('emParalelo para todos os trabalhadores na primeira falha e propaga o erro', async () => {
  let disparadas = 0;
  const tarefas = Array.from({ length: 20 }, (_, i) => async () => {
    disparadas++;
    await new Promise((r) => setTimeout(r, 5));
    if (i === 0) throw new Error('falhou');
    return i;
  });
  await assert.rejects(F.emParalelo(tarefas, 4), /falhou/);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(disparadas, 4);
});

// Lista FIPE mínima para os testes de escolherCandidatos (só nomes, como a API devolve).
const lista = (...nomes) => nomes.map((name, i) => ({ code: String(i + 1), name }));
const escolher = (modelos, titulo, descricao) => {
  const a = P.lerAnuncio({ titulo: `2015 Marca ${titulo}`, descricao });
  return F.escolherCandidatos(modelos, a.palavras.slice(1), a).map((c) => c.nome);
};

test('cabeca: junta e separa palavras; palavra fraca exige a seguinte', () => {
  const k = (titulo, nome) => (F.cabeca(titulo.split(' '), P.normalizar(nome).split(' ')) || {}).k;
  assert.equal(k('eco sport se', 'EcoSport SE 1.6'), 3);
  assert.equal(k('ecosport', 'Eco Sport SE 1.6'), 1);
  assert.equal(k('hb 20 premium', 'HB20 Premium 1.6'), 3);
  assert.equal(k('cr v exl', 'CR-V EXL 2.0'), 3);
  assert.equal(k('t cross 200', 'T-Cross 200 TSI'), 3);
  assert.equal(k('t cross', 'T.Flex 1.6'), undefined);
  assert.equal(k('grand siena', 'Grand Santa Fe'), undefined);
  assert.equal(k('grand siena', 'Grand Siena EL 1.4'), 2);
  assert.equal(k('hb20', 'HB20S Comfort'), undefined);
});

test('candidatos por nome: "novo/nova/new", família da 2ª palavra, palavra solta e marca irmã', () => {
  // "Nova Saveiro" e "Novo Uno": a FIPE às vezes escreve só "Saveiro"; se escreve "New Beetle", o título completo vale.
  assert.ok(escolher(lista('Saveiro 1.6', 'Grand Saveiro 1.6'), 'Nova Saveiro CS')[0].startsWith('Saveiro'));
  assert.deepEqual(escolher(lista('Uno Mille', 'Palio 1.0'), 'Novo Uno'), ['Uno Mille']);
  assert.deepEqual(escolher(lista('New Beetle 2.0', 'Beetle 1.6'), 'New Beetle'), ['New Beetle 2.0']);
  // "Corolla Cross" não pode ficar no topo junto de Corolla sedã.
  const c = escolher(lista('Corolla XEi 2.0', 'Corolla Cross XRE 2.0'), 'Corolla Cross XRE');
  assert.equal(c[0], 'Corolla Cross XRE 2.0');
  // "C3 Aircross": a 2ª palavra é família da marca e nenhum "C3 ..." a contém.
  assert.deepEqual(escolher(lista('C3 Exclusive 1.6', 'AIRCROSS Live 1.6'), 'C3 Aircross'), ['AIRCROSS Live 1.6']);
  // "Prisma Joy": um nome "Prisma ... Joy" contém a 2ª palavra, então a família "Joy" não toma o lugar.
  assert.equal(escolher(lista('PRISMA Sed. Joy 1.0', 'JOY Hatch 1.0'), 'Prisma Joy')[0], 'PRISMA Sed. Joy 1.0');
  // Palavra solta: "SW4" só aparece em "Hilux SW4"; "Cross" aparece em várias famílias e é recusada.
  assert.deepEqual(escolher(lista('Hilux SW4 3.0', 'Hilux CD 2.8', 'Corolla Cross XRE', 'Etios Cross 1.5'), 'SW4 SRX'), ['Hilux SW4 3.0']);
  assert.deepEqual(escolher(lista('Corolla Cross XRE', 'Etios Cross 1.5'), 'Cross'), []);
  // Sem nada parecido ou só uma letra solta: nenhum candidato.
  assert.deepEqual(escolher(lista('Voyage 1.6', 'T.Flex 1.0'), 'T'), []);
  // Marcas irmãs (Chery): fica a marca cujo melhor candidato pontua mais.
  const a = P.lerAnuncio({ titulo: '2018 Chery Tiggo 2 1.5' });
  const r = F.escolherEntreMarcas([{ marca: { code: '245' }, modelos: lista('Tiggo 5X 1.5', 'Tiggo 7 1.5') }, { marca: { code: '161' }, modelos: lista('Tiggo 2 ACT 1.5') }], a.palavras.slice(1), a);
  assert.equal(r.marca.code, '161');
});

test('acharMarca devolve marcas FIPE irmãs (Chery) e casar ainda usa a marca do título', async () => {
  const marcas = [{ code: '245', name: 'Caoa Chery' }, { code: '161', name: 'Caoa Chery/Chery' }];
  const achada = F.acharMarca(P.dividirTitulo('2018 Chery Tiggo 2').palavras, marcas);
  assert.equal(achada.marca.code, '245');
  assert.deepEqual(achada.outras.map((m) => m.code), ['161']);
  assert.deepEqual(achada.resto, ['tiggo', '2']);
  // "Novo Voyage" casa pela lista do fixture (a FIPE não escreve "Novo").
  const r = await F.casar(novoCliente(criarFake()), P.lerAnuncio({ titulo: '2015 Volkswagen Novo Voyage Trendline 1.6', preco: 'R$ 18.000' }));
  assert.notEqual(r.tipo, 'nenhum');
});

// Endurecimento: segmentos de caminho codificados e respostas fora do formato não entram no cache.
test('códigos com "/", "?" ou "#" não mudam a rota da URL (encodeURIComponent)', async () => {
  const chamadas = [];
  const fetch = async (url) => { chamadas.push(url); return { status: 200, ok: true, json: async () => [] }; };
  const cliente = novoClienteCom(fetch, { get: async () => undefined, set: async () => {} });
  await cliente.modelos('a/b?c#d');
  await cliente.anos('59', '../x');
  assert.deepEqual(chamadas, [
    'https://fipe.parallelum.com.br/api/v2/cars/brands/a%2Fb%3Fc%23d/models',
    'https://fipe.parallelum.com.br/api/v2/cars/brands/59/models/..%2Fx/years',
  ]);
});

test('resposta da FIPE fora do formato vira erro "formato" e não é gravada no cache', async () => {
  const respostas = {
    '/references': [], // lista vazia de referências
    '/cars/brands': { erro: 'x' }, // objeto no lugar de lista
    '/cars/brands/59/models': [{ code: '1' }], // sem name
    '/cars/brands/59/models/1/years': [{ code: 2015, name: '2015 Flex' }], // code não é texto
    '/cars/brands/59/models/1/years/2015-5': { price: 'sem número', referenceMonth: 'outubro de 2026' },
  };
  const gravados = [];
  const cache = { get: async () => undefined, set: async (k) => { gravados.push(k); } };
  const fetch = async (url) => ({ status: 200, ok: true, json: async () => respostas[url.replace('https://fipe.parallelum.com.br/api/v2', '')] });
  const c = novoClienteCom(fetch, cache);
  const formato = (e) => e instanceof F.ErroFipe && e.tipo === 'formato';
  await assert.rejects(c.referencias(), formato);
  await assert.rejects(c.marcas(), formato);
  await assert.rejects(c.modelos('59'), formato);
  await assert.rejects(c.anos('59', '1'), formato);
  respostas['/references'] = [{ code: '338', month: 'outubro/2026' }];
  await assert.rejects(c.preco('59', '1', '2015-5'), formato);
  // Só a lista de referências válida foi gravada; nada do que veio fora do formato.
  assert.deepEqual(gravados, ['referencias']);
});

test('JSON inválido na resposta vira erro "formato"', async () => {
  const fetch = async () => ({ status: 200, ok: true, json: async () => { throw new SyntaxError('Unexpected token <'); } });
  await assert.rejects(novoClienteCom(fetch, { get: async () => undefined, set: async () => {} }).marcas(), (e) => e instanceof F.ErroFipe && e.tipo === 'formato');
});
