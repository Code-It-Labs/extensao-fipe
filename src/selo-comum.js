// Selo FIPE comum aos sites (content script, global FipeSelo). Papel: tudo o que não depende do site, ou seja, o ciclo de 1 s,
// o pedido ao service worker, o desenho do selo, a escolha de versão salva por anúncio e o descarte de respostas atrasadas.
// Cada leitor de site (content-facebook.js, content-olx.js) só diz como achar o id do anúncio e como ler o texto da página
// e chama FipeSelo.iniciar({ site, idDaUrl, lerPagina }). Carregado depois de parser.js e ciclo.js e antes do leitor (ordem do manifest).
// Privacidade: a versão escolhida no <select> fica só em storage.local (chave "escolha:<site>:<id do anúncio>", com códigos,
// nome da versão e data); nada disso sai da máquina nem vai ao service worker ou à FIPE além dos códigos que já iam.
(function (raiz) {
  const P = FipeParser;
  const ID_SELO = 'fipe-selo-ext';

  // Escolhas salvas por anúncio: no máximo MAX_ESCOLHAS (somando todos os sites); ao passar disso, as mais antigas (pela data) são apagadas.
  const PREFIXO = 'escolha:', MAX_ESCOLHAS = 200;

  // Leitor do site atual, preenchido por iniciar(): { site, idDaUrl, lerPagina }.
  let leitor = null;

  // Estado do ciclo: chave vista no tick anterior, chave já consultada e contador para descartar respostas velhas.
  let chaveVista = null, chaveConsultada = null, pedido = 0;

  // Preço pedido: primeiro texto "R$ ..." sozinho perto do título (sobe do h1 até achar), para não pegar anúncios similares.
  // Serve a todos os leitores de site (é leitura de DOM, mas igual em todos).
  const SO_PRECO = /^R\$\s?[\d.,]+$/;
  function textoDoPreco(h1) {
    let el = h1;
    for (let i = 0; i < 8 && el.parentElement; i++) {
      el = el.parentElement;
      const andador = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let no = andador.nextNode(); no; no = andador.nextNode()) {
        if (SO_PRECO.test(no.textContent.trim())) return no.textContent.trim();
      }
    }
    return '';
  }

  // Chave do storage: prefixo por site para ids iguais de sites diferentes não colidirem.
  const chaveEscolha = (id) => `${PREFIXO}${leitor.site}:${id}`;

  // Cria um elemento com classe e texto (sempre textContent: nada da página entra como HTML).
  function el(tag, classe, texto) {
    const e = document.createElement(tag);
    e.className = 'fipe-selo__' + classe;
    if (texto !== undefined) e.textContent = texto;
    return e;
  }

  // Troca o conteúdo do selo (cria o selo se não existir).
  function mostrar(filhos) {
    let selo = document.getElementById(ID_SELO);
    if (!selo) {
      selo = document.createElement('div');
      selo.id = ID_SELO;
      selo.setAttribute('role', 'status');
      document.body.appendChild(selo);
    }
    selo.replaceChildren(...filhos);
  }

  // Remove o selo (usado fora de anúncios de veículo).
  function remover() {
    const selo = document.getElementById(ID_SELO);
    if (selo) selo.remove();
  }

  // Linha de diferença entre preço pedido e valor FIPE (verde se abaixo, vermelho se acima).
  function linhaDiferenca(preco, valor) {
    const texto = P.formatarDiferenca(preco, valor);
    if (!texto) return el('div', 'apoio', 'Preço pedido não encontrado na página.');
    return el('div', preco <= valor ? 'bom' : 'ruim', `Pedido ${P.formatarReal(preco)}: ${texto}`);
  }

  // Nome da versão FIPE com o combustível dela: se o anúncio diz gasolina e a FIPE só tem flex, o usuário vê.
  const nomeComCombustivel = (c) => `${c.nome} (${c.combustivelFipe})`;

  // Selo de valor único (versão provável ou escolhida à mão).
  function mostrarValor(r, nome, valor, mes, preco, rotulo) {
    const filhos = [el('div', 'titulo', `FIPE ${mes}: ${P.formatarReal(valor)}`), el('div', 'apoio', `${rotulo}: ${nome}`), linhaDiferenca(preco, valor)];
    if (rotulo === 'Provável' && r.confiancaBaixa) filhos.push(el('div', 'aviso', 'Confiança baixa: poucas pistas no anúncio. Confira a versão.'));
    return filhos;
  }

  // Mostra erro do service worker ou da extensão.
  function mostrarErro(mensagem) {
    mostrar([el('div', 'titulo', 'FIPE'), el('div', 'erro', mensagem)]);
  }

  // Pede ao service worker; trata extensão recarregada (contexto invalidado) com mensagem clara.
  async function perguntar(msg) {
    try {
      const resp = await (globalThis.browser || chrome).runtime.sendMessage(msg);
      if (!resp) return { ok: false, erro: { mensagem: 'A extensão não respondeu. Recarregue a página.' } };
      return resp;
    } catch (e) {
      return { ok: false, erro: { mensagem: 'A extensão foi atualizada. Recarregue a página.' } };
    }
  }

  // Lê a escolha salva do anúncio; qualquer falha do storage (ou storage ausente) vale como "sem escolha".
  async function lerEscolha(id) {
    try {
      const o = await (globalThis.browser || chrome).storage.local.get(chaveEscolha(id));
      return o[chaveEscolha(id)] || null;
    } catch (e) { return null; }
  }

  // Salva a escolha do anúncio e apaga as mais antigas acima do limite; falha do storage não afeta o selo.
  // shortcut: get(null) lê todo o storage.local (inclui o cache FIPE) para achar as escolhas; se o cache crescer muito, guardar um índice próprio.
  async function salvarEscolha(id, marca, c) {
    try {
      const local = (globalThis.browser || chrome).storage.local;
      const chave = chaveEscolha(id);
      await local.set({ [chave]: { marca, modelo: c.modelo, anoCodigo: c.anoCodigo, nome: c.nome, combustivelFipe: c.combustivelFipe, data: Date.now() } });
      const tudo = await local.get(null);
      // A recém-salva nunca entra na lista de remoção (mesmo com datas iguais).
      const velhas = Object.keys(tudo).filter((k) => k.startsWith(PREFIXO) && k !== chave).sort((a, b) => tudo[a].data - tudo[b].data);
      const sobra = velhas.length + 1 - MAX_ESCOLHAS;
      if (sobra > 0) await local.remove(velhas.slice(0, sobra));
    } catch (e) { /* sem salvar: o selo segue funcionando */ }
  }

  // Resultado ambíguo: faixa de preço e <select> para o usuário escolher a versão (vale só para este anúncio).
  function mostrarAmbiguo(r, preco, meuPedido, id) {
    const select = el('select', 'select');
    select.setAttribute('aria-label', 'Escolher a versão do carro');
    select.appendChild(new Option('Escolha a versão…', ''));
    r.candidatos.forEach((c, i) => select.appendChild(new Option(`${c.nome} (${c.combustivelFipe})`, String(i))));
    // Consulta o preço da versão `escolhido` (índice) e redesenha mantendo o select (para trocar a escolha ou tentar de novo).
    async function aplicar(escolhido, rotulo) {
      const c = r.candidatos[Number(escolhido)];
      if (!c) return;
      mostrar([el('div', 'titulo', 'FIPE: consultando…'), select]);
      const resp = await perguntar({ tipo: 'preco', marca: r.marca, modelo: c.modelo, anoCodigo: c.anoCodigo });
      // Descarta resposta de outro anúncio ou de uma escolha que já foi trocada.
      if (meuPedido !== pedido || select.value !== escolhido) return;
      if (!resp.ok) return mostrar([el('div', 'erro', resp.erro.mensagem), select]);
      mostrar([...mostrarValor(r, nomeComCombustivel(c), resp.resultado.valor, resp.resultado.mes, preco, rotulo), select]);
    }
    // Escolha do usuário: guarda para este anúncio (sem esperar) e consulta.
    select.addEventListener('change', () => {
      const c = r.candidatos[Number(select.value)];
      if (c && id) salvarEscolha(id, r.marca, c);
      aplicar(select.value, 'Versão escolhida');
    });
    mostrar([
      el('div', 'titulo', `FIPE ${r.mes}: ${P.formatarReal(r.faixa.min)} a ${P.formatarReal(r.faixa.max)}`),
      el('div', 'apoio', `Faixa das melhores versões encontradas para ${r.lido.marca} ${r.lido.modelo} ${r.lido.ano}.`),
      el('div', 'apoio', preco ? `Pedido: ${P.formatarReal(preco)}` : 'Preço pedido não encontrado na página.'),
      el('div', 'aviso', 'Não deu para identificar a versão pelo texto do anúncio. Escolha:'),
      select,
    ]);
    // Escolha salva: só vale se o candidato (marca, modelo e ano) ainda está na lista, e se o usuário ainda não escolheu nada.
    if (id) lerEscolha(id).then((s) => {
      const i = s ? r.candidatos.findIndex((c) => c.modelo === s.modelo && c.anoCodigo === s.anoCodigo) : -1;
      if (i < 0 || s.marca !== r.marca || meuPedido !== pedido || select.value !== '') return;
      select.value = String(i);
      aplicar(String(i), 'Versão escolhida (salva)');
    });
  }

  // Consulta a FIPE para o anúncio lido e desenha o resultado.
  async function consultar(dados) {
    const meuPedido = ++pedido;
    const id = leitor.idDaUrl();
    const anuncio = P.lerAnuncio(dados);
    mostrar([el('div', 'titulo', 'FIPE: consultando…')]);
    // Só marca/modelo/ano/pistas de versão vão ao service worker; a FIPE recebe apenas códigos de marca/modelo/ano.
    const resp = await perguntar({ tipo: 'casar', anuncio });
    if (meuPedido !== pedido) return;
    if (!resp.ok) return mostrarErro(resp.erro.mensagem);
    const r = resp.resultado;
    if (r.tipo === 'sem-marca') return remover();
    if (r.tipo === 'nenhum') {
      return mostrar([el('div', 'titulo', 'Não encontrei na FIPE'), el('div', 'apoio', `Li: marca "${r.lido.marca}", modelo "${r.lido.modelo}", ano ${r.lido.ano}.`)]);
    }
    if (r.tipo === 'ambiguo') return mostrarAmbiguo(r, anuncio.preco, meuPedido, id);
    const c = r.candidatos[0];
    mostrar(mostrarValor(r, nomeComCombustivel(c), c.valor, c.mes, anuncio.preco, 'Provável'));
  }

  // Ciclo de 1 s (SPA): a decisão (limpar, aguardar ou consultar) vem de FipeCiclo.decidir, pura e testada em Node.
  function ciclo() {
    const id = leitor.idDaUrl();
    const dados = id && leitor.lerPagina();
    const d = FipeCiclo.decidir({ id, dados, chaveVista, chaveConsultada });
    chaveVista = d.chaveVista;
    chaveConsultada = d.chaveConsultada;
    // Limpar = descartar respostas em voo (contador) e tirar o selo do anúncio/conteúdo anterior.
    if (d.acao === 'limpar') { pedido++; remover(); }
    else if (d.acao === 'consultar') consultar(dados);
  }

  // Liga o selo para o site: guarda o leitor e começa o ciclo de 1 s.
  function iniciar(config) {
    leitor = config;
    setInterval(ciclo, 1000);
  }

  raiz.FipeSelo = { iniciar, textoDoPreco };
})(globalThis);
