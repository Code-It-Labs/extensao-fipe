// Ajudante de teste dos leitores de página (src/content-facebook.js e src/content-olx.js): monta um DOM do jsdom com a mesma
// estrutura de texto de anúncios reais do Marketplace e da OLX, carrega parser.js, ciclo.js, selo-comum.js e o leitor do site
// na ordem do manifest e deixa o teste avançar os "ciclos de 1 s" à mão e responder as mensagens ao service worker.
// Só o teste usa; a extensão não depende dele. abrirPagina = Facebook; abrirPaginaOlx = OLX; o resto (polifills, storage falso,
// mensagens, ciclos) é comum e fica em abrirJanela.
//
// Limites do jsdom que este ajudante contorna (polifills instaladas em abrirPagina):
//  - innerText não existe: polifill em HTMLElement.prototype feita com textContent, com quebra de linha em volta dos
//    blocos (div, h1, p...) e pulando elementos escondidos. Basta para o leitor; não imita o innerText real
//    (espaços em branco, CSS, <br> dentro de inline).
//  - checkVisibility não existe: polifill que devolve falso se o próprio elemento ou um ancestral tem o atributo
//    `hidden` ou style.display = 'none'. Não enxerga CSS de folha de estilo, visibility nem opacity.
//  - não há layout: getClientRects devolve sempre vazio, então o ramo "sem checkVisibility" do leitor não é testável aqui.
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

// Fixtures: texto e estrutura iguais aos de páginas reais verificadas (o HTML real é ofuscado; aqui é sintético).
const LOGAN = {
  id: '111',
  h1: '2008 Renault Logan',
  ogTitle: '2008 Renault LOGAN',
  tituloAba: '2008 Renault LOGAN — Commercial Vehicles — Antônio Carlos (Santa Catarina) | Facebook Marketplace | Facebook',
  preco: 'R$12.900',
  h2Ficha: 'Sobre esse veículo',
  ficha: '193.000 km rodados\nCâmbio manual\nCor externa: White · Cor interna: Black\nTipo de combustível: Gasolina\nVer mais',
  h2Desc: 'Descrição do vendedor',
  desc: 'RENAULT LOGAN EXPRESSION 1.6 \nEspaço, conforto e potência para quem busca um carro versátil com excelente custo-benefício! \n'
    + 'Tabela FIPE: R$ 19.000,00\nValor de venda: R$ 12.900,00\n✅ Motor 1.6\n✅ Amplo espaço interno\n✅ Porta-malas espaçoso\n'
    + '✅ Excelente oportunidade de negócio!\n🔥 VALOR ABAIXO DA FIPE!\n📲 Entre em contato e aproveite essa oportunidade!\n Ver mais\n'
    + 'Antônio Carlos, SC · A localização é aproximada',
  h2Extras: ['Informações do vendedor'],
};
// Anúncio vendido: o h1 só tem o título do vendedor, com prefixo; o modelo só aparece no og:title e no título da aba.
const VOYAGE_VENDIDO = {
  id: '222',
  h1: 'Vendido  · 2015 Volkswagen',
  ogTitle: '2015 Volkswagen Voyage',
  tituloAba: '2015 Volkswagen Voyage — Cars & Trucks — Palhoça | Facebook Marketplace | Facebook',
  preco: 'R$18.000',
  h2Ficha: 'Sobre esse veículo',
  ficha: '150.000 km rodados\nCâmbio manual\nVer mais',
  h2Desc: 'Descrição do vendedor',
  desc: 'Voyage 1,6 2015\nCarro filé ✅ documentação ok, pneus novos. Fip = 41,000',
  h2Extras: ['Recursos comuns', 'Informações do vendedor'],
};
// Mesmo anúncio da Logan, com a interface em inglês.
const LOGAN_EN = {
  ...LOGAN,
  preco: 'R$12,900',
  tituloAba: '2008 Renault LOGAN - Commercial Vehicles - Antônio Carlos | Facebook Marketplace',
  h2Ficha: 'About this vehicle',
  ficha: 'Driven 193,000 km\nManual transmission\nExterior color: White · Interior color: Black\nFuel type: Gasoline',
  h2Desc: "Seller's description",
  desc: 'RENAULT LOGAN EXPRESSION 1.6\nSpace and comfort for a great price.',
};

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
// Cada linha do texto vira um <div> (o texto da ficha e da descrição vem em blocos, como na página real).
const linhas = (texto) => texto.split('\n').map((l) => `<div>${esc(l)}</div>`).join('');
const aninhar = (conteudo, n) => '<div>'.repeat(n) + conteudo + '</div>'.repeat(n);
// Seção como na página real: o h2 fica 8 wrappers abaixo do bloco (9 níveis de ancestral) e o texto é irmão da cadeia.
const secao = (h2, texto) => `<div>${aninhar(`<h2>${esc(h2)}</h2>`, 8)}<div>${linhas(texto)}</div></div>`;

// Corpo do anúncio. Opções: as da fixture, mais h1Escondido (um h1 igual e escondido, com um preço velho ao lado, como o
// DOM do anúncio anterior que o Facebook mantém montado) e preco/h2Ficha = null para tirar o preço/a seção da ficha e semSimilares para tirar a seção "Seleções de hoje".
function corpoHtml(a) {
  const escondido = a.h1Escondido ? `<div hidden><h1>${esc(a.h1)}</h1><div><span>R$ 7.777</span></div></div>` : '';
  const preco = a.preco ? `<div><span>${esc(a.preco)}</span></div>` : '';
  return escondido
    + '<div><h2>Marketplace</h2></div>'
    + `<main><div><div><h1>${esc(a.h1)}</h1></div>${preco}</div>`
    + (a.h2Ficha ? secao(a.h2Ficha, a.ficha) : '')
    + secao(a.h2Desc, a.desc)
    + (a.h2Extras || []).map((h) => secao(h, 'Texto qualquer do bloco')).join('')
    // Anúncio parecido mais abaixo, com outro preço: o leitor não pode pegar este.
    + (a.semSimilares ? '' : secao('Seleções de hoje', 'R$ 99.999\nOutro carro 2020'))
    + '</main>';
}

const url = (id) => `https://www.facebook.com/marketplace/item/${id}/`;

// storage.local falso, assíncrono e em memória (get/set/remove, como a API real com promessas). `dados` é o objeto que
// guarda tudo (o teste pode passar o mesmo para uma segunda página, simulando reabrir o anúncio) e `estado.falhar = true`
// faz toda chamada rejeitar, e `estado.segurar = promessa` segura as chamadas até ela resolver. Os valores passam por JSON, como no storage real.
function storageFalso(dados, estado) {
  const copia = (v) => JSON.parse(JSON.stringify(v));
  const rodar = async (fn) => { await null; if (estado.segurar) await estado.segurar; if (estado.falhar) throw new Error('storage indisponível'); return fn(); };
  return {
    get: (chaves) => rodar(() => {
      const lista = chaves === null ? Object.keys(dados) : [].concat(chaves);
      return copia(Object.fromEntries(lista.filter((k) => k in dados).map((k) => [k, dados[k]])));
    }),
    set: (obj) => rodar(() => { Object.assign(dados, copia(obj)); }),
    remove: (chaves) => rodar(() => { for (const k of [].concat(chaves)) delete dados[k]; }),
  };
}

// Abre uma janela do jsdom com o `html` e a `url` dados e carrega os scripts de `leitor` (nome do arquivo em src/) depois de
// parser, ciclo e selo-comum (ordem do manifest). `responder(msg)` responde ao sendMessage (valor ou Promise; pode lançar erro).
// Com `browser: true` define window.browser (o leitor prefere esse) além de window.chrome.
// `armazenado` é o objeto-base do storage.local falso (padrão: vazio); `semStorage: true` tira a API de storage.
// `novaPagina(novo)` devolve { corpo, url, tituloAba? } para pg.trocar (tituloAba troca também o título da aba) (navegação SPA do site).
// Devolve { window, document, mensagens, chamadasChrome, chamadasBrowser, responder, armazenado, storage, ciclos, esperar, trocar };
// `pg.storage.falhar = true` faz o storage rejeitar; `pg.storage.segurar = promessa` o deixa lento.
async function abrirJanela(t, { html, url: urlInicial, leitor, novaPagina, responder, browser = false, armazenado = {}, semStorage = false }) {
  const dom = new JSDOM(html, { url: urlInicial, runScripts: 'outside-only' });
  const { window } = dom;
  t.after(() => window.close());

  // Polifill do checkVisibility: falso se o elemento ou um ancestral está escondido (atributo hidden ou display none).
  const oculto = (e) => e.hasAttribute('hidden') || e.style.display === 'none';
  window.Element.prototype.checkVisibility = function () {
    for (let e = this; e; e = e.parentElement) if (oculto(e)) return false;
    return true;
  };
  // Polifill do innerText: textContent com quebra de linha em volta dos blocos, sem os filhos escondidos.
  const BLOCOS = /^(DIV|P|H[1-6]|LI|UL|OL|SECTION|MAIN|ARTICLE|HEADER|FOOTER|NAV|ASIDE)$/;
  const texto = (no) => {
    if (no.nodeType === 3) return no.data;
    if (no.nodeType !== 1 || oculto(no)) return '';
    const dentro = [...no.childNodes].map(texto).join('');
    return BLOCOS.test(no.tagName) ? `\n${dentro}\n` : dentro;
  };
  Object.defineProperty(window.HTMLElement.prototype, 'innerText', {
    configurable: true,
    get() { return [...this.childNodes].map(texto).join('').replace(/\n+/g, '\n').trim(); },
  });

  // sendMessage simulado: registra cada mensagem e devolve o que `pg.responder` mandar. Um objeto por API (chrome/browser).
  const pg = { window, document: window.document, mensagens: [], chamadasChrome: 0, chamadasBrowser: 0, responder, armazenado, storage: { falhar: false, segurar: null } };
  // A mensagem passa por JSON como na troca real entre content script e service worker (e sai dos objetos da janela do jsdom).
  const api = (contador) => ({
    runtime: { sendMessage: (msg) => { pg[contador]++; const copia = JSON.parse(JSON.stringify(msg)); pg.mensagens.push(copia); return pg.responder(copia); } },
    ...(semStorage ? {} : { storage: { local: storageFalso(armazenado, pg.storage) } }),
  });
  window.chrome = api('chamadasChrome');
  if (browser) window.browser = api('chamadasBrowser');

  // setInterval capturado: o teste dispara o callback do leitor à mão, sem esperar 1 s de verdade.
  let tick = null;
  window.setInterval = (fn) => { tick = fn; return 1; };

  // Carrega na ordem do manifest (parser, ciclo, selo comum, leitor do site), como script clássico dentro da janela.
  for (const arq of ['parser.js', 'ciclo.js', 'selo-comum.js', leitor]) {
    window.eval(fs.readFileSync(path.join(__dirname, '..', 'src', arq), 'utf8'));
  }

  // Deixa as Promises pendentes (perguntar/consultar) terminarem.
  pg.esperar = () => new Promise((r) => setImmediate(r));
  // Roda n ciclos de 1 s, esperando as Promises depois de cada um.
  pg.ciclos = async (n = 1) => { for (let i = 0; i < n; i++) { tick(); await pg.esperar(); } };
  // Simula a navegação do SPA: troca o conteúdo e a URL sem recarregar a página.
  pg.trocar = (novo) => {
    const { corpo, url: novaUrl, tituloAba } = novaPagina(novo);
    window.document.getElementById('raiz').innerHTML = corpo;
    if (tituloAba !== undefined) window.document.title = tituloAba;
    window.history.pushState({}, '', novaUrl);
  };
  return pg;
}

// Página de anúncio do Facebook Marketplace (fixtures LOGAN, VOYAGE_VENDIDO...).
function abrirPagina(t, { anuncio, ...resto }) {
  const a = { ...anuncio };
  return abrirJanela(t, {
    html: `<!doctype html><html><head><title>${esc(a.tituloAba)}</title><meta property="og:title" content="${esc(a.ogTitle)}"></head>`
      + `<body><div id="raiz">${corpoHtml(a)}</div></body></html>`,
    url: url(a.id),
    leitor: 'content-facebook.js',
    novaPagina: (novo) => ({ corpo: corpoHtml(novo), url: url(novo.id) }),
    ...resto,
  });
}

// ---------- OLX ----------

// Fixtures da OLX: textos e estrutura (h1, JSON-LD, bloco "Detalhes") iguais aos de duas páginas reais em pt-BR; o HTML é sintético
// e o anunciante é inventado (o leitor não pode enviar esse nome). `ld` = JSON-LD do anúncio (null tira o script); `preco` = texto
// "R$ ..." ao lado do h1 (null tira); `semH1: true` tira o h1 (a OLX às vezes renderiza assim); `detalhes` = linhas do bloco (rótulo e valor em linhas separadas); `opcionais` vem depois do corte.
const COROLLA = {
  id: '1548521332',
  caminho: '/florianopolis-e-regiao/autos-e-pecas/carros-vans-e-utilitarios/toyota-corolla-xei-2-0-flex-16v-aut-2022-1548521332',
  h1: 'Toyota Corolla XEI 2.0 Flex 16V Aut. 2022',
  tituloAba: 'Corolla XEI 2.0 Flex 16V Aut. 2022 - 1548521332 | OLX',
  preco: 'R$ 112.900',
  ld: { price: '112900', name: 'Toyota Corolla XEI 2.0 Flex 16V Aut. 2022', description: 'Corolla XEI 2.0 único dono<br>Revisões na concessionária<br>Aceito troca' },
  detalhes: 'Categoria\nCarros, Vans E Utilitários\nModelo\nCorolla Xei 2.0 Flex 16v Aut.\nMarca\nToyota\nTipo de veículo\nSedã\nAno\n2022\n'
    + 'Quilometragem\n67950\nPotência do motor\n2.0 - 2.9\nCombustível\nFlex',
  opcionais: 'Ar condicionado\nCâmbio\nManual',
};
// Kwid: o Detalhes traz também "Câmbio\nManual" (o título só diz "Mec.").
const KWID = {
  id: '1550249749',
  caminho: '/florianopolis-e-regiao/autos-e-pecas/carros-vans-e-utilitarios/renault-kwid-zen-1-0-flex-12v-5p-mec-2026-1550249749',
  h1: 'Renault Kwid Zen 1.0 Flex 12V 5P Mec. 2026',
  tituloAba: 'Kwid Zen 1.0 Flex 12V 5P Mec. 2026 - 1550249749 | OLX',
  preco: 'R$ 69.900',
  ld: { price: '69900', name: 'Renault Kwid Zen 1.0 Flex 12V 5P Mec. 2026', description: 'Kwid zero detalhe<br>Ar e direção' },
  detalhes: 'Categoria\nCarros, Vans E Utilitários\nModelo\nKwid Zen 1.0 Flex 12v 5p Mec.\nMarca\nRenault\nTipo de veículo\nHatch\nAno\n2026\n'
    + 'Quilometragem\n12000\nPotência do motor\n1.0 - 1.4\nCâmbio\nManual\nCombustível\nFlex',
  opcionais: 'Vidros elétricos\nTravas elétricas',
};

// JSON-LD como o da página real: um objeto Person com o anunciante e o carro em makesOffer.itemOffered.
const jsonLd = (ld) => JSON.stringify({
  '@type': 'Person', name: 'Concessionária Fictícia Ltda',
  makesOffer: { priceSpecification: { price: ld.price }, itemOffered: { '@type': 'Car', name: ld.name, description: ld.description } },
});
const urlOlx = (a) => `https://sc.olx.com.br${a.caminho}`;

// Corpo do anúncio da OLX: h1, preço ao lado, bloco "Detalhes" (com "Exibir todos" e opcionais depois) e anúncios parecidos
// mais abaixo, com outro preço (o leitor não pode pegar esse). `semDetalhes` tira o bloco.
function corpoOlx(a) {
  const preco = a.preco ? `<div><span>${esc(a.preco)}</span></div>` : '';
  const detalhes = a.semDetalhes ? '' : `<section><div>Detalhes</div>${linhas(a.detalhes)}${linhas('Exibir todos (15)\nOpcionais deste veículo\n' + a.opcionais)}</section>`;
  const h1 = a.semH1 ? '' : `<h1>${esc(a.h1)}</h1>`;
  return `<main><div><div>${h1}</div>${preco}</div>${detalhes}`
    + `<section><div>Anúncios parecidos</div><div>Toyota Corolla XEI 2019</div><div>R$ 124.900</div></section></main>`;
}

// Abre uma página de anúncio da OLX (os campos `caminho` e `ld` das fixtures podem ser trocados no teste).
function abrirPaginaOlx(t, { anuncio, ...resto }) {
  const a = { ...anuncio };
  const ld = a.ld ? `<script type="application/ld+json">${jsonLd(a.ld)}</script>` : '';
  return abrirJanela(t, {
    html: `<!doctype html><html><head><title>${esc(a.tituloAba)}</title>${ld}</head><body><div id="raiz">${corpoOlx(a)}</div></body></html>`,
    url: urlOlx(a),
    leitor: 'content-olx.js',
    novaPagina: (novo) => ({ corpo: corpoOlx(novo), url: urlOlx(novo), tituloAba: novo.tituloAba }),
    ...resto,
  });
}

module.exports = { abrirPagina, LOGAN, VOYAGE_VENDIDO, LOGAN_EN, abrirPaginaOlx, COROLLA, KWID };
