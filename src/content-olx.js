// Leitor de página da OLX (content script). Papel: ler o anúncio de carro (URL, h1 ou título da aba, JSON-LD e bloco "Detalhes") e entregar
// o texto ao selo comum (FipeSelo, src/selo-comum.js), que consulta a FIPE e desenha o selo. Só aqui há conhecimento da OLX.
// Feito sobre duas páginas reais em pt-BR (Corolla e Kwid, inspecionadas à mão); testado à mão só com a extensão carregada num Firefox (não no Chrome).
// Privacidade: o JSON-LD da página traz o nome do anunciante; este leitor só pega nele o nome do carro, o preço e a descrição.
(function () {
  const P = FipeParser;

  // Anúncio de carro: ".../autos-e-pecas/carros-vans-e-utilitarios/<slug>-<id numérico>"; o id é o número no fim do caminho.
  // Listagens, outras categorias e motos não casam. Id com 7+ dígitos para não confundir "...-2022" de um filtro com um anúncio.
  const idDaUrl = () => (location.pathname.match(/\/autos-e-pecas\/carros-vans-e-utilitarios\/[^/]+-(\d{7,})\/?$/) || [])[1] || null;

  // Dados do carro no JSON-LD: { nome, preco, descricao } ou null. Só lê makesOffer.itemOffered e o preço (nunca o anunciante).
  // shortcut: só o formato visto (makesOffer como objeto, direto ou dentro de @graph/lista); se a OLX mudar, o preço cai no texto da página.
  function lerJsonLd() {
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      let json;
      try { json = JSON.parse(s.textContent); } catch (e) { continue; }
      for (const o of [].concat(json, json && json['@graph'] || [])) {
        const oferta = o && o.makesOffer, carro = oferta && oferta.itemOffered;
        if (!carro) continue;
        const preco = oferta.priceSpecification && String(oferta.priceSpecification.price || '');
        return {
          nome: String(carro.name || ''),
          preco: /^\d+(\.\d{1,2})?$/.test(preco) ? `R$ ${preco}` : '',
          // <br> vira quebra de linha e qualquer outra tag é descartada por regex (nunca innerHTML).
          descricao: String(carro.description || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, ''),
        };
      }
    }
    return null;
  }

  // Título da aba sem o sufixo " - <id> | OLX" (separadores "-", "–", "—", "|"). Vazio se a aba não traz o id do anúncio
  // atual (ela pode ainda ser a do anúncio anterior).
  function tituloDaAba(id) {
    const t = document.title;
    return id && t.includes(id) ? t.slice(0, t.indexOf(id)).replace(/\s*[-–—|]\s*$/, '').trim() : '';
  }

  // Bloco "Detalhes" (rótulo e valor em linhas separadas): { texto, ancora }. `texto` é o do menor ancestral do título "Detalhes"
  // que já traz "Marca" e "Ano", cortado antes de "Exibir todos"/"Opcionais deste veículo" (vazio se não achar); `ancora` é o
  // elemento pai do primeiro texto "Detalhes" (ponto de partida do preço quando a página não tem h1) ou null.
  function blocoDetalhes() {
    const andador = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let ancora = null;
    for (let no = andador.nextNode(); no; no = andador.nextNode()) {
      if (no.textContent.trim() !== 'Detalhes') continue;
      ancora = ancora || no.parentElement;
      let el = no.parentElement;
      for (let i = 0; i < 6 && el; i++, el = el.parentElement) {
        const m = el.innerText.match(/(?:^|\n)(Detalhes\n[\s\S]*?)(?=\nExibir todos|\nOpcionais deste|$)/);
        if (m && /\nMarca\n/.test(m[1]) && /\nAno\n/.test(m[1])) return { texto: m[1], ancora };
      }
    }
    return { texto: '', ancora };
  }

  // Lê a página: null se não for anúncio de carro ou se ainda não carregou; senão o texto cru no formato do parser.
  // O h1 é opcional (a OLX às vezes renderiza sem ele): o título-base sai do h1, senão do JSON-LD, senão do título da aba.
  function lerPagina() {
    const h1 = document.querySelector('h1');
    const tituloH1 = h1 ? h1.textContent.trim() : '';
    const aba = tituloDaAba(idDaUrl());
    // O JSON-LD só vale se for do anúncio atual (pode ficar velho depois de navegar sem recarregar). Com h1: nome igual ao do h1.
    // Sem h1: o nome contém o título da aba (que tem o id da URL).
    const ld = lerJsonLd();
    const nomeLd = ld ? P.normalizar(ld.nome) : '';
    const doAnuncio = ld && (tituloH1 ? nomeLd === P.normalizar(tituloH1) : aba && nomeLd.includes(P.normalizar(aba))) ? ld : null;
    const base = tituloH1 || (doAnuncio && doAnuncio.nome) || aba;
    if (!base) return null;
    const { texto: detalhes, ancora } = blocoDetalhes();
    const linhas = detalhes.split('\n').map((l) => l.trim());
    // Valor da linha seguinte ao rótulo ("Marca" -> "Toyota").
    const campo = (rotulo) => { const i = linhas.indexOf(rotulo); return i < 0 ? '' : linhas[i + 1] || ''; };
    const [marca, modelo, ano] = [campo('Marca'), campo('Modelo'), campo('Ano')];
    // Título no formato do Facebook ("2022 Toyota Corolla Xei 2.0 Flex 16v Aut."); sem Detalhes completo, vale o título-base.
    const titulo = marca && modelo && /^(19|20)\d{2}$/.test(ano) ? `${ano} ${marca} ${modelo}` : base;
    // Âncora do preço: o h1; sem ele, o "Detalhes" (sobe até o menor ancestral com um "R$ ..." sozinho e pega o primeiro dele).
    const ponto = tituloH1 ? h1 : ancora;
    return {
      titulo,
      preco: (doAnuncio && doAnuncio.preco) || (ponto ? FipeSelo.textoDoPreco(ponto) : ''),
      sobre: detalhes,
      descricao: doAnuncio ? doAnuncio.descricao : '',
    };
  }

  // Entrega o leitor ao selo comum (ciclo de 1 s, consulta e desenho); "olx" prefixa as escolhas salvas.
  FipeSelo.iniciar({ site: 'olx', idDaUrl, lerPagina });
})();
