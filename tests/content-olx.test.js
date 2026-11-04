// Testes do leitor da OLX (src/content-olx.js) num DOM do jsdom (ver tests/helper-dom.js, fixtures COROLLA e KWID com a estrutura
// de duas páginas reais e sem dados de anunciante). Como no Facebook, testa-se o comportamento observável: a mensagem enviada
// ao service worker ({tipo:'casar', anuncio}), o texto do selo e o que fica no storage. O desenho do selo e a escolha salva em si
// são do selo comum e têm os testes mais detalhados em tests/content-facebook.test.js; aqui vale o que é próprio da OLX.
const test = require('node:test');
const assert = require('node:assert/strict');
const { abrirPaginaOlx, COROLLA, KWID } = require('./helper-dom.js');

const MES = 'novembro de 2026';
const nenhum = { ok: true, resultado: { tipo: 'nenhum', lido: { marca: 'Toyota', modelo: 'corolla', ano: 2022 } } };
const ambiguo = {
  ok: true,
  resultado: {
    tipo: 'ambiguo', lido: { marca: 'Toyota', modelo: 'corolla', ano: 2022 }, marca: '56', mes: MES, confiancaBaixa: true,
    faixa: { min: 100000, max: 120000 },
    candidatos: [
      { modelo: '1', nome: 'Corolla XEi 2.0 Flex 16V Aut.', anoCodigo: '2022-5', combustivelFipe: 'Flex', valor: 100000, mes: MES },
      { modelo: '2', nome: 'Corolla Altis 2.0 Flex 16V Aut.', anoCodigo: '2022-5', combustivelFipe: 'Flex', valor: 120000, mes: MES },
    ],
  },
};
const adiada = () => { let resolver; const promessa = new Promise((r) => { resolver = r; }); return { promessa, resolver }; };
// Texto do selo linha a linha (o <select> vira "[select]"); null se não há selo.
const selo = (pg) => {
  const s = pg.document.getElementById('fipe-selo-ext');
  return s && [...s.children].map((c) => (c.tagName === 'SELECT' ? '[select]' : c.textContent));
};
// Abre a página, responde sempre `resp`, roda os 2 ciclos da estabilidade e devolve o anúncio da primeira mensagem (null se não houve).
async function ler(t, anuncio, resp = nenhum, opcoes = {}) {
  const pg = await abrirPaginaOlx(t, { anuncio, responder: () => resp, ...opcoes });
  await pg.ciclos(2);
  return { pg, anuncio: pg.mensagens[0] && pg.mensagens[0].anuncio };
}

// ---------- leitura da página ----------

test('Corolla: lê ano, preço do JSON-LD, combustível, cilindrada, palavras e câmbio inferido de "Aut."', async (t) => {
  const { pg, anuncio } = await ler(t, COROLLA);
  assert.equal(pg.mensagens.length, 1);
  assert.equal(pg.mensagens[0].tipo, 'casar');
  assert.equal(anuncio.ano, 2022);
  assert.deepEqual(anuncio.palavras, ['toyota', 'corolla', 'xei', '2.0', 'flex', '16v', 'aut']);
  assert.equal(anuncio.preco, 112900);
  assert.equal(anuncio.combustivel, 'flex');
  assert.equal(anuncio.cilindrada, '2.0');
  // O Detalhes do Corolla não tem "Câmbio" (campo recolhido): o "Aut." do título dá automático. O "Câmbio\nManual" dos opcionais não conta.
  assert.equal(anuncio.cambio, 'automatico');
  // Privacidade: só estes campos saem da página.
  assert.deepEqual(Object.keys(anuncio).sort(), ['ano', 'cambio', 'cilindrada', 'combustivel', 'palavras', 'preco', 'tokens']);
});

test('Kwid: lê "Câmbio\\nManual" do Detalhes (o título só diz "Mec.") e o combustível', async (t) => {
  const { anuncio } = await ler(t, KWID);
  assert.equal(anuncio.ano, 2026);
  assert.deepEqual(anuncio.palavras, ['renault', 'kwid', 'zen', '1.0', 'flex', '12v', '5p', 'mec']);
  assert.equal(anuncio.preco, 69900);
  assert.equal(anuncio.combustivel, 'flex');
  assert.equal(anuncio.cambio, 'manual');
  assert.equal(anuncio.cilindrada, '1.0');
});

test('título vem do Detalhes (Marca, Modelo, Ano), não do h1', async (t) => {
  // Ano diferente de propósito (2021 no Detalhes, 2022 no h1) para provar de qual fonte veio.
  const { anuncio } = await ler(t, { ...COROLLA, detalhes: COROLLA.detalhes.replace('Ano\n2022', 'Ano\n2021') });
  assert.equal(anuncio.ano, 2021);
});

test('sem o bloco Detalhes: usa o h1 como título e segue sem combustível', async (t) => {
  const { anuncio } = await ler(t, { ...COROLLA, semDetalhes: true });
  assert.equal(anuncio.ano, 2022);
  assert.deepEqual(anuncio.palavras, ['toyota', 'corolla', 'xei', '2.0', 'flex', '16v', 'aut']);
  assert.equal(anuncio.combustivel, null);
});

test('o Detalhes termina em "Exibir todos": combustível e câmbio dos opcionais não entram', async (t) => {
  const semCombustivel = COROLLA.detalhes.replace('\nCombustível\nFlex', '');
  const { anuncio } = await ler(t, { ...COROLLA, detalhes: semCombustivel, opcionais: 'Combustível\nDiesel\nCâmbio\nManual' });
  assert.equal(anuncio.combustivel, null);
  assert.equal(anuncio.cambio, 'automatico');
});

// ---------- página sem h1 (renderização vista no Firefox: o JSON-LD e o "Detalhes" existem, o h1 não) ----------

test('sem h1: Corolla e Kwid são lidos como com h1 (título do JSON-LD, preço do JSON-LD, Detalhes)', async (t) => {
  for (const base of [COROLLA, KWID]) {
    const com = await ler(t, base);
    const sem = await ler(t, { ...base, semH1: true });
    assert.equal(sem.pg.document.querySelectorAll('h1').length, 0);
    assert.ok(sem.anuncio, base.id);
    assert.deepEqual(sem.anuncio, com.anuncio, base.id);
  }
});

test('sem h1 e sem Detalhes: o título vem do nome do JSON-LD (que tem a marca), não da aba (que não tem)', async (t) => {
  const { anuncio } = await ler(t, { ...COROLLA, semH1: true, semDetalhes: true });
  assert.equal(anuncio.ano, 2022);
  assert.deepEqual(anuncio.palavras, ['toyota', 'corolla', 'xei', '2.0', 'flex', '16v', 'aut']);
  assert.equal(anuncio.preco, 112900);
});

test('sem h1, sem JSON-LD e sem Detalhes: o título vem da aba (sem o sufixo "- id | OLX")', async (t) => {
  const { anuncio } = await ler(t, { ...KWID, semH1: true, ld: null, semDetalhes: true });
  assert.equal(anuncio.ano, 2026);
  assert.deepEqual(anuncio.palavras, ['kwid', 'zen', '1.0', 'flex', '12v', '5p', 'mec']);
  // Sem h1, sem "Detalhes" e sem JSON-LD não há âncora para o preço: o selo diz que não achou (não chuta um "R$" da página).
  assert.equal(anuncio.preco, null);
});

test('sem h1 e sem JSON-LD: o preço vem do texto perto do "Detalhes", não do anúncio parecido', async (t) => {
  const { anuncio } = await ler(t, { ...COROLLA, semH1: true, ld: null });
  assert.equal(anuncio.preco, 112900);
});

test('sem h1: JSON-LD de outro anúncio é ignorado (preço do texto, descrição vazia)', async (t) => {
  const velho = { price: '55000', name: 'Fiat Uno Way 2015', description: 'Uno econômico<br>Pneus novos' };
  const { anuncio } = await ler(t, { ...COROLLA, semH1: true, ld: velho });
  assert.equal(anuncio.preco, 112900);
  assert.ok(!anuncio.tokens.includes('uno'));
});

test('sem h1, navegando de um anúncio para outro: o JSON-LD do anterior (que a página não troca) não vale para o novo', async (t) => {
  const pg = await abrirPaginaOlx(t, { anuncio: { ...KWID, semH1: true }, responder: () => nenhum });
  await pg.ciclos(2);
  assert.equal(pg.mensagens[0].anuncio.preco, 69900);
  pg.trocar({ ...COROLLA, semH1: true });
  await pg.ciclos(3);
  const novo = pg.mensagens[1].anuncio;
  assert.equal(novo.ano, 2022);
  assert.equal(novo.preco, 112900);
  assert.ok(!novo.tokens.includes('zero') && !novo.tokens.includes('kwid'));
});

test('sem h1 e com a aba ainda sem o id do anúncio: não lê nada (a aba pode ser a do anúncio anterior)', async (t) => {
  const pg = await abrirPaginaOlx(t, { anuncio: { ...COROLLA, semH1: true, ld: { ...COROLLA.ld, name: 'Fiat Uno Way 2015' }, tituloAba: 'Uno Way 2015 | OLX' }, responder: () => nenhum });
  await pg.ciclos(4);
  assert.equal(pg.mensagens.length, 0);
  assert.equal(selo(pg), null);
});

// ---------- preço ----------

test('preço vem do JSON-LD, mesmo que o texto ao lado do h1 seja outro', async (t) => {
  const { anuncio } = await ler(t, { ...COROLLA, preco: 'R$ 111.111' });
  assert.equal(anuncio.preco, 112900);
});

test('sem JSON-LD: o preço vem do texto "R$" ao lado do h1, não do anúncio parecido mais abaixo', async (t) => {
  const { anuncio } = await ler(t, { ...COROLLA, ld: null });
  assert.equal(anuncio.preco, 112900);
});

test('com JSON-LD e sem preço ao lado do h1: usa o do JSON-LD, não o "R$ 124.900" do anúncio parecido', async (t) => {
  const { anuncio } = await ler(t, { ...COROLLA, preco: null });
  assert.equal(anuncio.preco, 112900);
});

test('JSON-LD de outro anúncio (velho após navegar) é ignorado: preço do texto e descrição vazia', async (t) => {
  const velho = { price: '55000', name: 'Fiat Uno Way 2015', description: 'Uno econômico<br>Pneus novos' };
  const { anuncio } = await ler(t, { ...COROLLA, ld: velho });
  assert.equal(anuncio.preco, 112900);
  assert.ok(!anuncio.tokens.includes('uno'));
});

// ---------- descrição e privacidade ----------

test('descrição do JSON-LD: <br> vira quebra de linha e tags não viram palavras', async (t) => {
  const ld = { ...COROLLA.ld, description: 'Corolla XEI<br>Único dono<br/><b>Revisões</b> em dia' };
  const { anuncio } = await ler(t, { ...COROLLA, ld });
  for (const p of ['xei', 'unico', 'dono', 'revisoes']) assert.ok(anuncio.tokens.includes(p), p);
  assert.ok(!anuncio.tokens.includes('br') && !anuncio.tokens.includes('b'));
});

test('o nome do anunciante do JSON-LD nunca sai da página', async (t) => {
  const { pg } = await ler(t, COROLLA);
  assert.ok(!JSON.stringify(pg.mensagens).includes('Fictícia'));
  assert.ok(!(selo(pg) || []).join(' ').includes('Fictícia'));
});

// ---------- só anúncio de carro ----------

test('listagem, outra categoria e moto: nenhuma mensagem e nenhum selo', async (t) => {
  const base = '/florianopolis-e-regiao/autos-e-pecas';
  const caminhos = [
    `${base}/carros-vans-e-utilitarios`,
    `${base}/carros-vans-e-utilitarios/estado-sc`,
    `${base}/motos/honda-cg-160-titan-2020-1234567890`,
    '/imoveis/venda/casas/casa-3-quartos-1234567890',
  ];
  for (const caminho of caminhos) {
    // Com e sem h1 (a página sem h1 ainda tem a aba, o JSON-LD e o "Detalhes" na tela e não pode virar anúncio por isso).
    for (const semH1 of [false, true]) {
      const pg = await abrirPaginaOlx(t, { anuncio: { ...COROLLA, caminho, semH1 }, responder: () => nenhum });
      await pg.ciclos(4);
      assert.equal(pg.mensagens.length, 0, caminho);
      assert.equal(selo(pg), null, caminho);
    }
  }
});

test('só consulta depois de estável por 2 ciclos, e uma vez só', async (t) => {
  const pg = await abrirPaginaOlx(t, { anuncio: COROLLA, responder: () => nenhum });
  await pg.ciclos(1);
  assert.equal(pg.mensagens.length, 0);
  await pg.ciclos(1);
  assert.equal(pg.mensagens.length, 1);
  await pg.ciclos(3);
  assert.equal(pg.mensagens.length, 1);
});

// ---------- navegação e respostas atrasadas ----------

test('resposta atrasada de um anúncio já trocado é descartada e o novo anúncio mostra o seu resultado', async (t) => {
  const a = adiada();
  const pg = await abrirPaginaOlx(t, { anuncio: COROLLA, responder: (m) => (m.anuncio.ano === 2022 ? a.promessa : { ok: true, resultado: { tipo: 'nenhum', lido: { marca: 'Renault', modelo: 'kwid', ano: 2026 } } }) });
  await pg.ciclos(2);
  assert.deepEqual(selo(pg), ['FIPE: consultando…']);
  pg.trocar(KWID);
  await pg.ciclos(1);
  assert.equal(selo(pg), null);
  a.resolver({ ok: true, resultado: { tipo: 'sem-marca' } });
  await pg.esperar();
  assert.equal(selo(pg), null);
  await pg.ciclos(1);
  assert.equal(selo(pg)[0], 'Não encontrei na FIPE');
  assert.equal(pg.mensagens[1].anuncio.preco, 69900);
});

// ---------- escolha salva (prefixo por site) ----------

// Escolhe a versão `v` no <select> do selo e espera as Promises.
async function escolher(pg, v) {
  const select = pg.document.querySelector('#fipe-selo-ext select');
  select.value = v;
  select.dispatchEvent(new pg.window.Event('change'));
  await pg.esperar();
}
const respostaComPreco = (valor = 110000) => (m) => (m.tipo === 'preco' ? { ok: true, resultado: { valor, mes: MES } } : ambiguo);

test('escolher a versão salva sob "escolha:olx:<id>" e reabrir o anúncio reaplica a escolha', async (t) => {
  const primeira = await abrirPaginaOlx(t, { anuncio: COROLLA, responder: respostaComPreco() });
  await primeira.ciclos(2);
  assert.deepEqual(selo(primeira).slice(-2), ['Não deu para identificar a versão pelo texto do anúncio. Escolha:', '[select]']);
  await escolher(primeira, '1');
  assert.deepEqual(Object.keys(primeira.armazenado), ['escolha:olx:1548521332']);
  // Página nova com o mesmo storage (F5): a escolha volta sozinha.
  const pg = await abrirPaginaOlx(t, { anuncio: COROLLA, responder: respostaComPreco(120000), armazenado: primeira.armazenado });
  await pg.ciclos(2);
  assert.deepEqual(pg.mensagens[1], { tipo: 'preco', marca: '56', modelo: '2', anoCodigo: '2022-5' });
  assert.equal(selo(pg)[1], 'Versão escolhida (salva): Corolla Altis 2.0 Flex 16V Aut. (Flex)');
});

test('escolha salva no Facebook com o mesmo id não vale na OLX (prefixos diferentes)', async (t) => {
  const salva = { marca: '56', modelo: '2', anoCodigo: '2022-5', nome: 'Corolla Altis 2.0 Flex 16V Aut.', combustivelFipe: 'Flex', data: 5 };
  const { pg } = await ler(t, COROLLA, ambiguo, { armazenado: { 'escolha:fb:1548521332': salva } });
  assert.equal(pg.mensagens.length, 1);
  assert.equal(pg.document.querySelector('#fipe-selo-ext select').value, '');
});
