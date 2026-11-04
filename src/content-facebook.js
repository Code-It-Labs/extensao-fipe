// Leitor de página do Facebook Marketplace (content script). Papel: ler o DOM do anúncio e entregar o texto ao selo comum
// (FipeSelo, src/selo-comum.js), que consulta a FIPE e desenha o selo. Só aqui há conhecimento do Facebook; o parser genérico
// (FipeParser), o ciclo (FipeCiclo), o selo comum e o cliente FIPE (no service worker) não sabem nada do site.
// O HTML do Facebook é ofuscado: nada depende de classes CSS, só de h1/h2 e texto. Idioma: en verificado;
// o que está marcado "palpite pt-BR" NÃO foi verificado numa página em português.
(function () {
  const P = FipeParser;
  // Títulos de seção: "About this vehicle" / "Seller's description" (en) e "Sobre esse veículo" / "Descrição do vendedor"
  // (pt-BR, verificado numa página real no Firefox; "sobre este" fica por garantia).
  const H2_FICHA = /^(about this vehicle|sobre (este|esse) ve[ií]culo)$/i;
  const H2_DESCRICAO = /^(seller.s description|descri[cç][aã]o do vendedor)$/i;

  // Id do anúncio na URL (o Facebook é SPA: a URL muda sem recarregar a página).
  const idDaUrl = () => (location.pathname.match(/\/marketplace\/item\/(\d+)/) || [])[1] || null;

  // Texto do bloco de um h2: sobe até 10 níveis até o ancestral cujo texto (sem o título) satisfaz "serve".
  // Medido numa página real (en): ficha e descrição ficam 9 níveis acima do h2; com 4 o bloco vinha vazio.
  function blocoDoH2(h2, serve) {
    let el = h2;
    for (let i = 0; i < 10 && el.parentElement; i++) {
      el = el.parentElement;
      const texto = el.innerText.replace(h2.innerText, '').trim();
      if (serve(texto)) return texto;
    }
    return '';
  }

  // Elemento visível (checkVisibility quando o navegador tem; senão, ocupa área na tela).
  const visivel = (e) => (e.checkVisibility ? e.checkVisibility() : e.getClientRects().length > 0);

  // h2 visível com o texto esperado que tem o ancestral comum MAIS BAIXO com o h1 (o mais próximo dele no DOM).
  // shortcut: sem limite de níveis (a profundidade real não foi medida); se aparecer mistura de anúncios, limitar o ancestral comum.
  function h2Perto(h1, regex) {
    let melhor = null, nivelMelhor = Infinity;
    for (const h2 of document.querySelectorAll('h2')) {
      if (!regex.test(h2.textContent.trim()) || !visivel(h2)) continue;
      let anc = h1, nivel = 0;
      while (anc && !anc.contains(h2)) { anc = anc.parentElement; nivel++; }
      if (anc && nivel < nivelMelhor) { melhor = h2; nivelMelhor = nivel; }
    }
    return melhor;
  }

  // Lê a página: devolve null se não for anúncio de veículo ou se ainda não carregou; senão o texto cru.
  function lerPagina() {
    // Só elementos visíveis: o Facebook pode manter o DOM do anúncio anterior montado e escondido. A página real tem
    // dois h1 iguais; o filtro só descarta os escondidos e fica com o primeiro visível.
    // Anúncio vendido vem com prefixo no h1 ("Vendido  · 2015 Volkswagen", visto em página real pt-BR): tira o prefixo até o "·".
    const semPrefixo = (t) => t.replace(/^[^\d]*·\s*/, '').trim();
    const h1 = [...document.querySelectorAll('h1')].filter(visivel).find((h) => /^(19|20)\d{2}\s/.test(semPrefixo(h.textContent)));
    if (!h1) return null;
    // h2 da ficha e da descrição: visíveis e o mais próximo do h1.
    const h2Ficha = h2Perto(h1, H2_FICHA);
    // Sem a seção "About this vehicle" não é veículo: não mostra selo (evita ruído em outros anúncios).
    if (!h2Ficha) return null;
    const h2Desc = h2Perto(h1, H2_DESCRICAO);
    // og:description só vale se o og:title for do mesmo anúncio do h1 (as metatags podem ficar velhas após navegar no SPA).
    const ogTitulo = document.querySelector('meta[property="og:title"]');
    const ogDesc = document.querySelector('meta[property="og:description"]');
    const og = ogTitulo && ogDesc && P.normalizar(ogTitulo.content) === P.normalizar(semPrefixo(h1.textContent)) ? ogDesc : null;
    // O h1 mostra só o título digitado pelo vendedor (visto: "2015 Volkswagen"), enquanto og:title e document.title
    // trazem o modelo ("2015 Volkswagen Voyage"). Usa o mais longo que começa com o texto do h1; senão, o próprio h1.
    const nh1 = P.normalizar(semPrefixo(h1.textContent));
    const candidatos = [ogTitulo && ogTitulo.content, document.title.split(/\s[-–—|]\s/)[0]]
      .filter((t) => t && P.normalizar(t).startsWith(nh1))
      .sort((a, b) => b.length - a.length);
    return {
      titulo: (candidatos[0] || semPrefixo(h1.textContent)).trim(),
      preco: FipeSelo.textoDoPreco(h1),
      sobre: blocoDoH2(h2Ficha, (t) => /\bkm\b/i.test(t)),
      descricao: (h2Desc && blocoDoH2(h2Desc, (t) => t.length > 10)) || (og && og.content) || '',
    };
  }

  // Entrega o leitor ao selo comum (ciclo de 1 s, consulta e desenho); "fb" prefixa as escolhas salvas.
  FipeSelo.iniciar({ site: 'fb', idDaUrl, lerPagina });
})();
