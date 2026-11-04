// Testes do leitor de página (src/content-facebook.js) e do desenho do selo, num DOM do jsdom (ver tests/helper-dom.js).
// O leitor não exporta nada: testa-se o comportamento observável, ou seja, a mensagem enviada ao service worker
// ({tipo:'casar', anuncio}) e o texto do selo depois de uma resposta simulada. Os ciclos de 1 s são disparados à mão.
const test = require('node:test');
const assert = require('node:assert/strict');
const { abrirPagina, LOGAN, VOYAGE_VENDIDO, LOGAN_EN } = require('./helper-dom.js');

// Respostas escritas à mão no formato do service worker ({ok, resultado}) para cada tipo de casamento de src/fipe.js.
const MES = 'novembro de 2026';
const lido = { marca: 'Renault', modelo: 'logan', ano: 2008 };
const versao = { modelo: '1', nome: 'LOGAN Expression Hi-Flex 1.6 8V 4p', anoCodigo: '2008-5', combustivelFipe: 'Flex', valor: 18336, mes: MES };
const provavel = (extra = {}) => ({ ok: true, resultado: { tipo: 'provavel', lido, marca: '26', candidatos: [versao], faixa: null, mes: MES, confiancaBaixa: false, ...extra } });
const ambiguo = {
  ok: true,
  resultado: {
    tipo: 'ambiguo', lido: { marca: 'Volkswagen', modelo: 'voyage', ano: 2015 }, marca: '59', mes: MES, confiancaBaixa: true,
    faixa: { min: 40465, max: 46634 },
    candidatos: [
      { modelo: '7', nome: 'Voyage Trendline 1.6', anoCodigo: '2015-1', combustivelFipe: 'Gasolina', valor: 40465, mes: MES },
      { modelo: '8', nome: 'Voyage Comfortline 1.6', anoCodigo: '2015-5', combustivelFipe: 'Flex', valor: 46634, mes: MES },
    ],
  },
};
const adiada = () => { let resolver; const promessa = new Promise((r) => { resolver = r; }); return { promessa, resolver }; };

// Texto do selo linha a linha (o <select> vira "[select]"); null se não há selo na página.
const selo = (pg) => {
  const s = pg.document.getElementById('fipe-selo-ext');
  return s && [...s.children].map((c) => (c.tagName === 'SELECT' ? '[select]' : c.textContent));
};
// Abre a página, responde sempre `resp` e roda os 2 ciclos que a estabilidade exige.
async function abrirEConsultar(t, anuncio, resp, opcoes = {}) {
  const pg = await abrirPagina(t, { anuncio, responder: () => resp, ...opcoes });
  await pg.ciclos(2);
  return pg;
}

// ---------- leitura da página ----------

test('pt-BR (Logan): lê ano, preço, combustível, câmbio, cilindrada e palavras', async (t) => {
  const pg = await abrirEConsultar(t, LOGAN, provavel());
  assert.equal(pg.mensagens.length, 1);
  const { tipo, anuncio } = pg.mensagens[0];
  assert.equal(tipo, 'casar');
  assert.equal(anuncio.ano, 2008);
  assert.deepEqual(anuncio.palavras, ['renault', 'logan']);
  // O preço vem do h1 (R$12.900), não do "R$ 99.999" do anúncio parecido nem dos "R$ ..." da descrição.
  assert.equal(anuncio.preco, 12900);
  assert.equal(anuncio.combustivel, 'gasolina');
  assert.equal(anuncio.cambio, 'manual');
  assert.equal(anuncio.cilindrada, '1.6');
  // A descrição foi lida do bloco certo (9 níveis acima do h2).
  assert.ok(anuncio.tokens.includes('expression'));
  // Privacidade: só estes campos saem da página.
  assert.deepEqual(Object.keys(anuncio).sort(), ['ano', 'cambio', 'cilindrada', 'combustivel', 'palavras', 'preco', 'tokens']);
});

test('inglês: lê a ficha e o preço no formato en', async (t) => {
  const { anuncio } = (await abrirEConsultar(t, LOGAN_EN, provavel())).mensagens[0];
  assert.equal(anuncio.ano, 2008);
  assert.equal(anuncio.preco, 12900);
  assert.equal(anuncio.combustivel, 'gasolina');
  assert.equal(anuncio.cambio, 'manual');
  assert.equal(anuncio.cilindrada, '1.6');
  assert.ok(anuncio.tokens.includes('expression'));
});

test('anúncio vendido: tira o prefixo "Vendido  ·" e usa o título completo da aba/og:title', async (t) => {
  const { anuncio } = (await abrirEConsultar(t, VOYAGE_VENDIDO, ambiguo)).mensagens[0];
  assert.equal(anuncio.ano, 2015);
  assert.deepEqual(anuncio.palavras, ['volkswagen', 'voyage']);
  assert.equal(anuncio.preco, 18000);
  assert.equal(anuncio.cilindrada, '1.6');
  assert.equal(anuncio.combustivel, null);
  assert.equal(anuncio.cambio, 'manual');
});

// Sem og:title, o modelo só vem do título da aba: cada separador (" - ", " — ", " – ", " | ") tem que cortar o sufixo.
for (const sep of [' - ', ' — ', ' – ', ' | ']) {
  test(`título da aba com separador "${sep}": corta o sufixo e fica só o título`, async (t) => {
    const anuncio = { ...VOYAGE_VENDIDO, ogTitle: '', tituloAba: `2015 Volkswagen Voyage${sep}Cars & Trucks${sep}Facebook` };
    const { anuncio: lido2 } = (await abrirEConsultar(t, anuncio, ambiguo)).mensagens[0];
    assert.deepEqual(lido2.palavras, ['volkswagen', 'voyage']);
  });
}

test('h1 duplicado e escondido é ignorado: usa o visível (preço e título do anúncio certo)', async (t) => {
  const { anuncio } = (await abrirEConsultar(t, { ...LOGAN, h1Escondido: true }, provavel())).mensagens[0];
  // Se o leitor pegasse o h1 escondido, o preço seria o "R$ 7.777" que está ao lado dele.
  assert.equal(anuncio.preco, 12900);
  assert.equal(anuncio.ano, 2008);
});

test('anúncio que não é veículo (sem a seção "Sobre esse veículo"): nenhuma mensagem e nenhum selo', async (t) => {
  const pg = await abrirEConsultar(t, { ...LOGAN, h2Ficha: null }, provavel());
  await pg.ciclos(3);
  assert.equal(pg.mensagens.length, 0);
  assert.equal(selo(pg), null);
});

test('anúncio sem preço visível: mensagem com preco null e selo avisa', async (t) => {
  // Sem o anúncio parecido na página: sem preço perto do h1, o leitor sobe até 8 níveis e pegaria o preço do parecido (limite conhecido, sem teste).
  const pg = await abrirEConsultar(t, { ...LOGAN, preco: null, semSimilares: true }, provavel());
  assert.equal(pg.mensagens[0].anuncio.preco, null);
  assert.equal(selo(pg).at(-1), 'Preço pedido não encontrado na página.');
});

// ---------- ciclo ----------

test('só consulta depois que o anúncio fica estável por 2 ciclos, e uma vez só', async (t) => {
  const pg = await abrirPagina(t, { anuncio: LOGAN, responder: () => provavel() });
  await pg.ciclos(1);
  assert.equal(pg.mensagens.length, 0);
  assert.equal(selo(pg), null);
  await pg.ciclos(1);
  assert.equal(pg.mensagens.length, 1);
  await pg.ciclos(3);
  assert.equal(pg.mensagens.length, 1);
});

test('conteúdo que muda entre dois ciclos adia a consulta (a estabilidade recomeça)', async (t) => {
  const pg = await abrirPagina(t, { anuncio: LOGAN, responder: () => provavel() });
  await pg.ciclos(1);
  // A descrição termina de renderizar entre os ciclos 1 e 2: a chave muda e ainda não consulta.
  pg.trocar({ ...LOGAN, desc: LOGAN.desc + '\nMais um parágrafo que carregou depois' });
  await pg.ciclos(1);
  assert.equal(pg.mensagens.length, 0);
  await pg.ciclos(1);
  assert.equal(pg.mensagens.length, 1);
});

test('resposta atrasada de um anúncio já trocado é descartada (antes de consultar o novo)', async (t) => {
  const a = adiada();
  const pg = await abrirPagina(t, { anuncio: LOGAN, responder: (m) => (m.anuncio.ano === 2008 ? a.promessa : { ok: true, resultado: { tipo: 'nenhum', lido: { marca: 'Volkswagen', modelo: 'voyage', ano: 2015 } } }) });
  await pg.ciclos(2);
  assert.deepEqual(selo(pg), ['FIPE: consultando…']);
  // O usuário navega para o anúncio B; o ciclo limpa o selo e a resposta de A chega depois.
  pg.trocar(VOYAGE_VENDIDO);
  await pg.ciclos(1);
  assert.equal(selo(pg), null);
  a.resolver(provavel());
  await pg.esperar();
  assert.equal(selo(pg), null);
  // B é consultado normalmente e mostra o seu resultado.
  await pg.ciclos(1);
  assert.equal(selo(pg)[0], 'Não encontrei na FIPE');
});

test('resposta atrasada de A não sobrescreve o selo de B já exibido', async (t) => {
  const a = adiada();
  const pg = await abrirPagina(t, { anuncio: LOGAN, responder: (m) => (m.anuncio.ano === 2008 ? a.promessa : { ok: true, resultado: { tipo: 'nenhum', lido: { marca: 'Volkswagen', modelo: 'voyage', ano: 2015 } } }) });
  await pg.ciclos(2);
  pg.trocar(VOYAGE_VENDIDO);
  await pg.ciclos(2);
  assert.equal(selo(pg)[0], 'Não encontrei na FIPE');
  a.resolver(provavel());
  await pg.esperar();
  assert.equal(selo(pg)[0], 'Não encontrei na FIPE');
});

test('prefere window.browser a chrome quando os dois existem', async (t) => {
  const pg = await abrirEConsultar(t, LOGAN, provavel(), { browser: true });
  assert.equal(pg.chamadasBrowser, 1);
  assert.equal(pg.chamadasChrome, 0);
});

test('sem window.browser usa chrome', async (t) => {
  const pg = await abrirEConsultar(t, LOGAN, provavel());
  assert.equal(pg.chamadasChrome, 1);
});

// ---------- desenho do selo ----------

test('selo provável: valor FIPE, versão com combustível e diferença abaixo (verde)', async (t) => {
  const pg = await abrirEConsultar(t, LOGAN, provavel());
  assert.deepEqual(selo(pg), [
    `FIPE ${MES}: R$ 18.336`,
    'Provável: LOGAN Expression Hi-Flex 1.6 8V 4p (Flex)',
    'Pedido R$ 12.900: R$ 5.436 abaixo da FIPE (30%)',
  ]);
  assert.ok(pg.document.querySelector('#fipe-selo-ext .fipe-selo__bom'));
  assert.equal(pg.document.getElementById('fipe-selo-ext').getAttribute('role'), 'status');
});

test('selo provável com preço acima da FIPE usa a classe "ruim"; confiança baixa acrescenta o aviso', async (t) => {
  const resp = provavel({ confiancaBaixa: true, candidatos: [{ ...versao, valor: 10000 }] });
  const pg = await abrirEConsultar(t, LOGAN, resp);
  assert.deepEqual(selo(pg), [
    `FIPE ${MES}: R$ 10.000`,
    'Provável: LOGAN Expression Hi-Flex 1.6 8V 4p (Flex)',
    'Pedido R$ 12.900: R$ 2.900 acima da FIPE (29%)',
    'Confiança baixa: poucas pistas no anúncio. Confira a versão.',
  ]);
  assert.ok(pg.document.querySelector('#fipe-selo-ext .fipe-selo__ruim'));
});

test('selo ambíguo: faixa, preço pedido e <select> com as versões', async (t) => {
  const pg = await abrirEConsultar(t, VOYAGE_VENDIDO, ambiguo);
  assert.deepEqual(selo(pg), [
    `FIPE ${MES}: R$ 40.465 a R$ 46.634`,
    'Faixa das melhores versões encontradas para Volkswagen voyage 2015.',
    'Pedido: R$ 18.000',
    'Não deu para identificar a versão pelo texto do anúncio. Escolha:',
    '[select]',
  ]);
  const opcoes = [...pg.document.querySelectorAll('#fipe-selo-ext select option')].map((o) => o.textContent);
  assert.deepEqual(opcoes, ['Escolha a versão…', 'Voyage Trendline 1.6 (Gasolina)', 'Voyage Comfortline 1.6 (Flex)']);
});

test('escolher uma versão no <select> consulta o preço dela e mantém o <select>', async (t) => {
  const pg = await abrirPagina(t, { anuncio: VOYAGE_VENDIDO, responder: () => ambiguo });
  await pg.ciclos(2);
  const d = adiada();
  pg.responder = () => d.promessa;
  const select = pg.document.querySelector('#fipe-selo-ext select');
  select.value = '1';
  select.dispatchEvent(new pg.window.Event('change'));
  await pg.esperar();
  assert.deepEqual(pg.mensagens[1], { tipo: 'preco', marca: '59', modelo: '8', anoCodigo: '2015-5' });
  assert.deepEqual(selo(pg), ['FIPE: consultando…', '[select]']);
  d.resolver({ ok: true, resultado: { valor: 43000, mes: MES } });
  await pg.esperar();
  assert.deepEqual(selo(pg), [
    `FIPE ${MES}: R$ 43.000`,
    'Versão escolhida: Voyage Comfortline 1.6 (Flex)',
    'Pedido R$ 18.000: R$ 25.000 abaixo da FIPE (58%)',
    '[select]',
  ]);
});

test('resposta de uma escolha já trocada no <select> é descartada', async (t) => {
  const pg = await abrirPagina(t, { anuncio: VOYAGE_VENDIDO, responder: () => ambiguo });
  await pg.ciclos(2);
  const primeira = adiada();
  pg.responder = () => primeira.promessa;
  const select = pg.document.querySelector('#fipe-selo-ext select');
  const escolher = (v) => { select.value = v; select.dispatchEvent(new pg.window.Event('change')); };
  escolher('1');
  await pg.esperar();
  // Troca a escolha antes da primeira resposta chegar; a segunda responde na hora.
  pg.responder = () => ({ ok: true, resultado: { valor: 41000, mes: MES } });
  escolher('0');
  await pg.esperar();
  primeira.resolver({ ok: true, resultado: { valor: 43000, mes: MES } });
  await pg.esperar();
  assert.equal(selo(pg)[0], `FIPE ${MES}: R$ 41.000`);
  assert.equal(selo(pg)[1], 'Versão escolhida: Voyage Trendline 1.6 (Gasolina)');
});

test('resposta da escolha no <select> que chega depois de trocar de anúncio é descartada', async (t) => {
  const pg = await abrirPagina(t, { anuncio: VOYAGE_VENDIDO, responder: () => ambiguo });
  await pg.ciclos(2);
  const d = adiada();
  pg.responder = () => d.promessa;
  const select = pg.document.querySelector('#fipe-selo-ext select');
  select.value = '1';
  select.dispatchEvent(new pg.window.Event('change'));
  await pg.esperar();
  // Navega para outro anúncio (o ciclo limpa o selo) e só então a resposta chega.
  pg.trocar(LOGAN);
  await pg.ciclos(1);
  d.resolver({ ok: true, resultado: { valor: 43000, mes: MES } });
  await pg.esperar();
  assert.equal(selo(pg), null);
});

test('erro no <select>: mostra a mensagem e mantém o <select> para tentar de novo', async (t) => {
  const pg = await abrirPagina(t, { anuncio: VOYAGE_VENDIDO, responder: () => ambiguo });
  await pg.ciclos(2);
  pg.responder = () => ({ ok: false, erro: { mensagem: 'FIPE fora do ar' } });
  const select = pg.document.querySelector('#fipe-selo-ext select');
  select.value = '1';
  select.dispatchEvent(new pg.window.Event('change'));
  await pg.esperar();
  assert.deepEqual(selo(pg), ['FIPE fora do ar', '[select]']);
});

// ---------- escolha salva por anúncio (storage.local) ----------

// Escolhe a versão `v` no <select> do selo e espera as Promises (a resposta do preço e a gravação).
async function escolher(pg, v) {
  const select = pg.document.querySelector('#fipe-selo-ext select');
  select.value = v;
  select.dispatchEvent(new pg.window.Event('change'));
  await pg.esperar();
}
// Responde ao casamento com o ambíguo e a qualquer preço com o valor dado.
const respostaComPreco = (valor = 43000) => (m) => (m.tipo === 'preco' ? { ok: true, resultado: { valor, mes: MES } } : ambiguo);
// Escolha salva como o leitor grava (candidato [1] do ambíguo), com a data e o modelo ajustáveis.
const salva = (extra = {}) => ({ marca: '59', modelo: '8', anoCodigo: '2015-5', nome: 'Voyage Comfortline 1.6', combustivelFipe: 'Flex', data: 5, ...extra });

test('escolher no <select> salva só códigos, nome e data sob "escolha:fb:<id>"', async (t) => {
  const pg = await abrirPagina(t, { anuncio: VOYAGE_VENDIDO, responder: respostaComPreco() });
  await pg.ciclos(2);
  await escolher(pg, '1');
  assert.deepEqual(Object.keys(pg.armazenado), ['escolha:fb:222']);
  const { data, ...resto } = pg.armazenado['escolha:fb:222'];
  assert.deepEqual(resto, { marca: '59', modelo: '8', anoCodigo: '2015-5', nome: 'Voyage Comfortline 1.6', combustivelFipe: 'Flex' });
  assert.ok(Number.isFinite(data) && data > 0);
});

test('reabrir o mesmo anúncio ambíguo reaplica a escolha salva e mantém o <select>', async (t) => {
  const primeira = await abrirPagina(t, { anuncio: VOYAGE_VENDIDO, responder: respostaComPreco() });
  await primeira.ciclos(2);
  await escolher(primeira, '1');
  // Página nova (como F5 ou voltar ao anúncio) com o mesmo storage.
  const pg = await abrirPagina(t, { anuncio: VOYAGE_VENDIDO, responder: respostaComPreco(43000), armazenado: primeira.armazenado });
  await pg.ciclos(2);
  assert.deepEqual(pg.mensagens[1], { tipo: 'preco', marca: '59', modelo: '8', anoCodigo: '2015-5' });
  assert.deepEqual(selo(pg), [
    `FIPE ${MES}: R$ 43.000`,
    'Versão escolhida (salva): Voyage Comfortline 1.6 (Flex)',
    'Pedido R$ 18.000: R$ 25.000 abaixo da FIPE (58%)',
    '[select]',
  ]);
  assert.equal(pg.document.querySelector('#fipe-selo-ext select').value, '1');
});

test('storage: usa browser.storage quando window.browser existe', async (t) => {
  const pg = await abrirPagina(t, { anuncio: VOYAGE_VENDIDO, responder: respostaComPreco(), browser: true });
  // Só o browser tem storage: se o leitor usasse chrome.storage, nada seria gravado.
  delete pg.window.chrome.storage;
  await pg.ciclos(2);
  await escolher(pg, '0');
  assert.deepEqual(Object.keys(pg.armazenado), ['escolha:fb:222']);
});

test('escolha salva cujo candidato sumiu da lista (ou de outra marca) é ignorada', async (t) => {
  for (const velha of [salva({ anoCodigo: '2015-9' }), salva({ modelo: '99' }), salva({ marca: '1' })]) {
    const pg = await abrirEConsultar(t, VOYAGE_VENDIDO, ambiguo, { armazenado: { 'escolha:fb:222': velha } });
    assert.equal(pg.mensagens.length, 1);
    assert.equal(selo(pg)[0], `FIPE ${MES}: R$ 40.465 a R$ 46.634`);
    assert.equal(pg.document.querySelector('#fipe-selo-ext select').value, '');
  }
});

test('a escolha de um anúncio não vaza para outro id', async (t) => {
  const pg = await abrirPagina(t, { anuncio: VOYAGE_VENDIDO, responder: respostaComPreco() });
  await pg.ciclos(2);
  await escolher(pg, '1');
  pg.trocar({ ...VOYAGE_VENDIDO, id: '333' });
  await pg.ciclos(2);
  assert.equal(selo(pg)[0], `FIPE ${MES}: R$ 40.465 a R$ 46.634`);
  assert.deepEqual(pg.mensagens.map((m) => m.tipo), ['casar', 'preco', 'casar']);
  // A escolha de 222 continua guardada, e a de 333 não existe.
  assert.deepEqual(Object.keys(pg.armazenado), ['escolha:fb:222']);
});

test('limite de 200 escolhas: apaga as mais antigas, guarda a nova e não mexe em outras chaves', async (t) => {
  const armazenado = { 'fipe:cache': { x: 1 } };
  // 200 escolhas antigas com datas 1..200, gravadas fora de ordem (a ordem de inserção não pode decidir).
  for (const i of [...Array(200).keys()].reverse()) armazenado[`escolha:v${i}`] = salva({ data: i + 1 });
  const pg = await abrirPagina(t, { anuncio: VOYAGE_VENDIDO, responder: respostaComPreco(), armazenado });
  await pg.ciclos(2);
  await escolher(pg, '1');
  const chaves = Object.keys(pg.armazenado).filter((k) => k.startsWith('escolha:'));
  assert.equal(chaves.length, 200);
  assert.ok(chaves.includes('escolha:fb:222'));
  assert.ok(!chaves.includes('escolha:v0'));
  assert.ok(chaves.includes('escolha:v1'));
  assert.deepEqual(pg.armazenado['fipe:cache'], { x: 1 });
  // Mais uma escolha em outro anúncio tira a segunda mais antiga.
  pg.trocar({ ...VOYAGE_VENDIDO, id: '333' });
  await pg.ciclos(2);
  await escolher(pg, '0');
  assert.equal(Object.keys(pg.armazenado).filter((k) => k.startsWith('escolha:')).length, 200);
  assert.ok(!('escolha:v1' in pg.armazenado) && 'escolha:fb:333' in pg.armazenado);
});

test('abaixo do limite nada é apagado', async (t) => {
  const armazenado = { 'escolha:a': salva({ data: 1 }), 'escolha:b': salva({ data: 2 }) };
  const pg = await abrirPagina(t, { anuncio: VOYAGE_VENDIDO, responder: respostaComPreco(), armazenado });
  await pg.ciclos(2);
  await escolher(pg, '1');
  assert.deepEqual(Object.keys(pg.armazenado).sort(), ['escolha:a', 'escolha:b', 'escolha:fb:222']);
});

test('storage que falha (ou ausente) não quebra o selo: escolha funciona sem salvar e nada é reaplicado', async (t) => {
  // Falha ao gravar.
  const pg = await abrirPagina(t, { anuncio: VOYAGE_VENDIDO, responder: respostaComPreco() });
  await pg.ciclos(2);
  pg.storage.falhar = true;
  await escolher(pg, '1');
  assert.equal(selo(pg)[1], 'Versão escolhida: Voyage Comfortline 1.6 (Flex)');
  assert.deepEqual(pg.armazenado, {});
  // Falha ao ler: mostra a faixa como se não houvesse escolha salva.
  const pg2 = await abrirPagina(t, { anuncio: VOYAGE_VENDIDO, responder: () => ambiguo, armazenado: { 'escolha:fb:222': salva() } });
  pg2.storage.falhar = true;
  await pg2.ciclos(2);
  assert.equal(selo(pg2)[0], `FIPE ${MES}: R$ 40.465 a R$ 46.634`);
  // Sem API de storage.
  const pg3 = await abrirPagina(t, { anuncio: VOYAGE_VENDIDO, responder: respostaComPreco(), semStorage: true });
  await pg3.ciclos(2);
  await escolher(pg3, '0');
  assert.equal(selo(pg3)[1], 'Versão escolhida: Voyage Trendline 1.6 (Gasolina)');
});

test('escolha do usuário feita enquanto o storage ainda lê vence a salva', async (t) => {
  const pg = await abrirPagina(t, { anuncio: VOYAGE_VENDIDO, responder: respostaComPreco(41000), armazenado: { 'escolha:fb:222': salva() } });
  const seg = adiada();
  pg.storage.segurar = seg.promessa;
  await pg.ciclos(2);
  await escolher(pg, '0');
  seg.resolver();
  await pg.esperar();
  await pg.esperar();
  assert.equal(selo(pg)[1], 'Versão escolhida: Voyage Trendline 1.6 (Gasolina)');
  assert.equal(pg.document.querySelector('#fipe-selo-ext select').value, '0');
});

test('resposta atrasada do preço da escolha salva é descartada ao trocar de anúncio', async (t) => {
  const d = adiada();
  const pg = await abrirPagina(t, { anuncio: VOYAGE_VENDIDO, responder: (m) => (m.tipo === 'preco' ? d.promessa : ambiguo), armazenado: { 'escolha:fb:222': salva() } });
  await pg.ciclos(2);
  assert.deepEqual(selo(pg), ['FIPE: consultando…', '[select]']);
  pg.trocar(LOGAN);
  await pg.ciclos(1);
  d.resolver({ ok: true, resultado: { valor: 43000, mes: MES } });
  await pg.esperar();
  assert.equal(selo(pg), null);
});

test('storage lento: a leitura que termina depois de trocar de anúncio não aplica a escolha no outro', async (t) => {
  const pg = await abrirPagina(t, { anuncio: VOYAGE_VENDIDO, responder: respostaComPreco(), armazenado: { 'escolha:fb:222': salva() } });
  const seg = adiada();
  pg.storage.segurar = seg.promessa;
  await pg.ciclos(2);
  pg.trocar(LOGAN);
  await pg.ciclos(1);
  seg.resolver();
  await pg.esperar();
  await pg.esperar();
  assert.equal(selo(pg), null);
  assert.deepEqual(pg.mensagens.map((m) => m.tipo), ['casar']);
});

test('selo "nenhum": diz o que foi lido', async (t) => {
  const pg = await abrirEConsultar(t, LOGAN, { ok: true, resultado: { tipo: 'nenhum', lido } });
  assert.deepEqual(selo(pg), ['Não encontrei na FIPE', 'Li: marca "Renault", modelo "logan", ano 2008.']);
});

test('resposta "sem-marca": consulta, mas não deixa selo', async (t) => {
  const pg = await abrirEConsultar(t, LOGAN, { ok: true, resultado: { tipo: 'sem-marca' } });
  assert.equal(pg.mensagens.length, 1);
  assert.equal(selo(pg), null);
});

test('erros: do service worker, sem resposta e extensão recarregada', async (t) => {
  const casos = [
    [() => ({ ok: false, erro: { mensagem: 'Limite diário da FIPE atingido.' } }), 'Limite diário da FIPE atingido.'],
    [() => undefined, 'A extensão não respondeu. Recarregue a página.'],
    [() => { throw new Error('Extension context invalidated.'); }, 'A extensão foi atualizada. Recarregue a página.'],
  ];
  for (const [responder, mensagem] of casos) {
    const pg = await abrirPagina(t, { anuncio: LOGAN, responder });
    await pg.ciclos(2);
    assert.deepEqual(selo(pg), ['FIPE', mensagem]);
    assert.ok(pg.document.querySelector('#fipe-selo-ext .fipe-selo__erro'));
  }
});
