// Cliente da API FIPE (parallelum, não oficial) e casamento anúncio -> versão FIPE. Independe de site e do DOM.
// Roda no código de fundo (service worker no Chrome, event page no Firefox) e nos testes em Node (module.exports).
// O fetch e o cache entram por parâmetro, então os testes usam um fetch simulado e a extensão usa fetch + storage.local.
(function (raiz) {
  const P = typeof module !== 'undefined' && module.exports ? require('./parser.js') : raiz.FipeParser;

  const BASE = 'https://fipe.parallelum.com.br/api/v2';
  const DIA = 24 * 60 * 60 * 1000;
  // Validades do cache: listas e preços 30 dias (preço também é chaveado pelo mês de referência); referências 1 dia.
  const TTL = { referencias: DIA, marcas: 30 * DIA, modelos: 30 * DIA, anos: 30 * DIA, preco: 30 * DIA };
  // Limites de consulta (a API pública tem cota diária): anos buscados por rodada, rodadas e preços por anúncio.
  const MAX_ANOS_POR_RODADA = 20, MAX_RODADAS = 2, MAX_PRECOS = 5, PARALELO = 4;
  // Folga de pontos para considerar um candidato "claramente melhor" que o seguinte.
  const MARGEM = 3;
  // Dígito do código de ano da FIPE ("2015-5") -> combustível; conferido com chamadas reais (1, 2, 3 e 5).
  const COD_COMBUSTIVEL = { gasolina: '1', alcool: '2', diesel: '3', flex: '5' };

  // Nomes de marca que diferem da FIPE depois de normalizar (alias normalizado -> nome FIPE normalizado).
  const ALIAS_MARCA = {
    volkswagen: 'vw volkswagen', vw: 'vw volkswagen',
    chevrolet: 'gm chevrolet', gm: 'gm chevrolet',
    kia: 'kia motors',
    mercedes: 'mercedes benz',
    // A FIPE tem "Caoa Chery" (245) e "Caoa Chery/Chery" (161), com modelos diferentes: acharMarca devolve as duas e o casamento escolhe.
    chery: 'caoa chery',
  };

  // Palavras que sozinhas não definem o modelo ("grand" de Grand Siena, "new" de New Beetle) e letras soltas ("T" de T-Cross):
  // exigem a palavra seguinte. Prefixos que o anúncio usa e a FIPE nem sempre escreve ("Nova Saveiro" ~ "Saveiro").
  const FRACAS = new Set(['grand', 'new', 'novo', 'nova']);
  const NOVOS = new Set(['novo', 'nova', 'new']);
  // Pontos por palavra do título, além da primeira, que abre o nome FIPE ("Corolla CROSS", "Tiggo 2"). Bem acima de MARGEM: tira do topo quem só tem a primeira palavra.
  const BONUS_CABECA = 6;
  // Palavra que o título põe logo após o modelo e a FIPE embute no nome do modelo ("HB20 Sedan" -> "HB20S", "Fox Cross" -> "CrossFox").
  // Cada uma devolve a cabeça reescrita; só vale se achar nomes FIPE cuja 1ª palavra é ela inteira (senão fica o casamento comum:
  // "Ka 1.5 Sedan SE" não acha nada, e "Corolla S" não pode virar o "Corolla Sedan").
  const REESCRITA_CABECA = { sedan: (cab) => cab + 's', cross: (cab) => 'cross' + cab };

  // Palavras do nome da versão FIPE que não ajudam a diferenciar (motor/carroceria/siglas genéricas).
  const GENERICAS = new Set(['flex', 'total', 'hi', 't', 'mi', 'mec', 'aut', 'automatico', 'de', 'com', 'e', '2p', '3p', '4p', '5p']);

  // Formas mínimas das respostas da API, conferidas antes de gravar no cache: resposta fora do formato vira erro claro e não entra no cache.
  const ehTexto = (x) => typeof x === 'string';
  const listaCom = (campos, minimo) => (v) => Array.isArray(v) && v.length >= minimo && v.every((x) => x && typeof x === 'object' && campos.every((c) => ehTexto(x[c])));
  const FORMA = {
    referencias: listaCom(['code'], 1),
    lista: listaCom(['code', 'name'], 0),
    preco: (v) => !!v && ehTexto(v.price) && /\d/.test(v.price) && ehTexto(v.referenceMonth),
  };

  // Erro da API com tipo ('rede', 'limite', 'http', 'formato') para o selo mostrar mensagem clara.
  class ErroFipe extends Error {
    constructor(tipo, mensagem) { super(mensagem); this.tipo = tipo; }
  }

  // Executa tarefas (funções async) com no máximo "limite" em paralelo, preservando a ordem do resultado.
  // Na primeira falha nenhum trabalhador dispara tarefa nova (poupa a cota) e o erro é propagado.
  async function emParalelo(tarefas, limite) {
    const saida = new Array(tarefas.length);
    let prox = 0, falhou = false;
    const trabalhador = async () => {
      while (!falhou && prox < tarefas.length) {
        const i = prox++;
        try { saida[i] = await tarefas[i](); } catch (e) { falhou = true; throw e; }
      }
    };
    await Promise.all(Array.from({ length: Math.min(limite, tarefas.length) }, trabalhador));
    return saida;
  }

  // Segmento de caminho da URL: códigos nunca mudam a rota (barra, "?" e "#" viram %2F, %3F e %23).
  const seg = encodeURIComponent;

  // Cria o cliente. cache = { get(chave) -> Promise<{t, v}|undefined>, set(chave, {t, v}) -> Promise }.
  function criarCliente({ fetch, cache, agora = Date.now }) {
    // Chamada HTTP sem retentativa: 429 e rede fora do ar viram ErroFipe.
    async function pedir(caminho) {
      let r;
      try { r = await fetch(BASE + caminho); } catch (e) { throw new ErroFipe('rede', 'Sem conexão com a FIPE.'); }
      if (r.status === 429) throw new ErroFipe('limite', 'Limite de consultas da FIPE atingido. Tente de novo mais tarde.');
      if (!r.ok) throw new ErroFipe('http', `A FIPE respondeu erro ${r.status}.`);
      try { return await r.json(); } catch (e) { throw new ErroFipe('formato', 'A FIPE respondeu num formato inesperado.'); }
    }
    // Consultas em andamento por chave: pedidos simultâneos da mesma chave dividem uma só chamada (apagada ao terminar, com sucesso ou erro).
    const emAndamento = new Map();
    // Lê do cache se ainda válido; senão consulta a API, confere a forma da resposta ("valida") e grava.
    function comCache(chave, ttl, caminho, valida) {
      if (emAndamento.has(chave)) return emAndamento.get(chave);
      const p = (async () => {
        const c = await cache.get(chave);
        if (c && agora() - c.t < ttl) return c.v;
        const v = await pedir(caminho);
        if (!valida(v)) throw new ErroFipe('formato', 'A FIPE respondeu num formato inesperado.');
        await cache.set(chave, { t: agora(), v });
        return v;
      })().finally(() => emAndamento.delete(chave));
      emAndamento.set(chave, p);
      return p;
    }
    return {
      referencias: () => comCache('referencias', TTL.referencias, '/references', FORMA.referencias),
      marcas: () => comCache('marcas', TTL.marcas, '/cars/brands', FORMA.lista),
      modelos: (marca) => comCache(`modelos:${marca}`, TTL.modelos, `/cars/brands/${seg(marca)}/models`, FORMA.lista),
      anos: (marca, modelo) => comCache(`anos:${marca}:${modelo}`, TTL.anos, `/cars/brands/${seg(marca)}/models/${seg(modelo)}/years`, FORMA.lista),
      // Preço chaveado pelo mês de referência mais recente: virou o mês, o cache antigo deixa de valer.
      async preco(marca, modelo, anoCodigo) {
        const ref = (await this.referencias())[0].code;
        return comCache(`preco:${ref}:${marca}:${modelo}:${anoCodigo}`, TTL.preco, `/cars/brands/${seg(marca)}/models/${seg(modelo)}/years/${seg(anoCodigo)}`, FORMA.preco);
      },
    };
  }

  // Acha a marca FIPE no começo das palavras do título (tenta 3, 2 e 1 palavras). Retorna { marca, outras, resto } ou null.
  // "outras" são marcas FIPE cujo nome começa pelo da achada ("Caoa Chery" e "Caoa Chery/Chery" dividem os modelos Chery).
  function acharMarca(palavras, marcas) {
    const porNome = new Map(marcas.map((m) => [P.normalizar(m.name), m]));
    for (let n = Math.min(3, palavras.length); n >= 1; n--) {
      const nome = palavras.slice(0, n).join(' ');
      const marca = porNome.get(ALIAS_MARCA[nome] || nome);
      if (marca) {
        const base = P.normalizar(marca.name) + ' ';
        const outras = marcas.filter((m) => m !== marca && (P.normalizar(m.name) + ' ').startsWith(base));
        return { marca, outras, resto: palavras.slice(n) };
      }
    }
    return null;
  }

  // Pontua uma versão FIPE contra as pistas do anúncio (cilindrada, palavras de versão, câmbio).
  function pontuar(nomeFipe, palavraModelo, anuncio) {
    const palavras = P.normalizar(nomeFipe).split(' ');
    const texto = new Set(anuncio.tokens);
    let pontos = 0;
    // Cilindrada: bate com a do anúncio (+4) ou a versão tem outra cilindrada (-4).
    const cils = palavras.filter((p) => /^\d\.\d$/.test(p));
    if (anuncio.cilindrada && cils.length) pontos += cils.includes(anuncio.cilindrada) ? 4 : -4;
    // Palavras de versão: igual (+3), abreviação do que o anúncio escreveu como "Expres." (+1,5), ausente (-0,2 para desempate).
    for (const p of palavras) {
      if (p === palavraModelo || p.length < 2 || GENERICAS.has(p) || /^\d+(\.\d+)?$/.test(p)) continue;
      if (texto.has(p)) pontos += 3;
      else if (p.length >= 4 && anuncio.tokens.some((t) => t.length > p.length && t.startsWith(p))) pontos += 1.5;
      else pontos -= 0.2;
    }
    // Câmbio: anúncio automático e versão "Aut" (+2); anúncio manual e versão "Aut" (-3) ou "Mec" (+1).
    const aut = palavras.some((p) => p.startsWith('aut'));
    if (anuncio.cambio === 'automatico' && aut) pontos += 2;
    if (anuncio.cambio === 'manual') pontos += aut ? -3 : palavras.includes('mec') ? 1 : 0;
    return Math.round(pontos * 10) / 10;
  }

  // Quantas palavras do título (a partir da primeira) abrem o nome FIPE, juntando ou separando palavras ("eco sport" ~ "ecosport",
  // "hb 20" ~ "hb20"). "nome" são as palavras normalizadas do nome FIPE. Retorna { k, n } (k do título, n do nome) ou null.
  function cabeca(titulo, nome) {
    const fraca = titulo[0].length < 2 || FRACAS.has(titulo[0]);
    for (let k = Math.min(4, titulo.length); k >= (fraca ? 2 : 1); k--) {
      const alvo = titulo.slice(0, k).join('');
      let acc = '';
      for (let n = 0; n < nome.length && acc.length < alvo.length; n++) { acc += nome[n]; if (acc === alvo) return { k, n: n + 1 }; }
    }
    return null;
  }

  // Versões da lista cujo nome abre com as palavras do título "v" (ver cabeca). Cada uma leva k e as palavras da cabeça (ini, n).
  function porCabeca(modelos, v) {
    const saida = [];
    for (const m of modelos) {
      const nome = P.normalizar(m.name).split(' ');
      const h = cabeca(v, nome);
      if (h) saida.push({ m, nome, ini: 0, n: h.n, k: h.k });
    }
    return saida;
  }

  // Último recurso, quando nenhum nome abre com o título: o modelo aparece no meio do nome ("SW4" em "Hilux SW4", "Evoque" em
  // "Range Rover Evoque"). Só vale se a expressão é específica (4+ letras ou tem dígito) e todos os nomes achados começam pela mesma palavra.
  function porPalavraSolta(modelos, v) {
    const fraca = v[0].length < 2 || FRACAS.has(v[0]);
    if (fraca && v.length < 2) return [];
    const frase = (fraca ? v.slice(0, 2) : v.slice(0, 1)).join(' ');
    if (frase.length < 4 && !/\d/.test(frase)) return [];
    const palavras = frase.split(' '), saida = [];
    for (const m of modelos) {
      const nome = P.normalizar(m.name).split(' ');
      const ini = nome.findIndex((_, i) => palavras.every((w, j) => nome[i + j] === w));
      if (ini >= 0) saida.push({ m, nome, ini, n: palavras.length, k: 1 });
    }
    return new Set(saida.map((c) => c.nome[0])).size === 1 ? saida : [];
  }

  // Escolhe, só pelos NOMES, as versões FIPE que podem ser o anúncio (função pura: o teste do corpus a usa sem rede).
  // "modelos" = lista FIPE da marca; "resto" = palavras do título depois da marca. Retorna [{ modelo, nome, pontos }] do melhor para o pior.
  // Estratégia: o nome FIPE tem de abrir pelo modelo do título (juntando/separando palavras); tenta o título como veio e sem "novo/nova/new";
  // se a 2ª palavra do título é outra família da marca e nenhum nome da 1ª a contém ("C3 Aircross" -> "Aircross"), vale a 2ª;
  // sem nenhuma abertura, tenta a palavra solta no meio do nome. Palavras do título além da primeira que abrem o nome valem BONUS_CABECA.
  function escolherCandidatos(modelos, resto, anuncio) {
    if (!resto.length) return [];
    const variantes = [resto];
    if (resto.length > 1 && NOVOS.has(resto[0])) variantes.push(resto.slice(1));
    for (const v of variantes) {
      let achados = porCabeca(modelos, v);
      // Se nenhum nome abre com a cabeça + palavra do título, tenta a cabeça reescrita (ver REESCRITA_CABECA).
      if (achados.length) {
        const k = Math.max(...achados.map((a) => a.k)), reescrever = REESCRITA_CABECA[v[k]];
        const nova = reescrever && reescrever(v.slice(0, k).join(''));
        const outros = nova ? porCabeca(modelos, [nova, ...v.slice(k + 1)]).filter((a) => a.nome[0] === nova) : [];
        if (outros.length) achados = outros;
      }
      if (v.length > 1) {
        const segunda = porCabeca(modelos, v.slice(1));
        if (segunda.length && !achados.some((a) => a.k > 1 || a.nome.includes(v[1]))) achados = segunda;
      }
      if (!achados.length) achados = porPalavraSolta(modelos, v);
      if (!achados.length) continue;
      return achados
        .map((a) => {
          // As palavras da cabeça são iguais em todos os candidatos: ficam fora da pontuação, que compara só o restante do nome.
          const sobra = a.nome.filter((_, i) => i < a.ini || i >= a.ini + a.n).join(' ');
          return { modelo: a.m.code, nome: a.m.name.replace(/\s+/g, ' ').trim(), pontos: Math.round((pontuar(sobra, '', anuncio) + BONUS_CABECA * (a.k - 1)) * 10) / 10 };
        })
        .sort((a, b) => b.pontos - a.pontos);
    }
    return [];
  }

  // Com marcas FIPE irmãs (Chery), escolhe a marca cujo melhor candidato pontua mais. listas = [{ marca, modelos }].
  // Retorna { marca, candidatos } (candidatos vazio se nenhuma marca tem).
  function escolherEntreMarcas(listas, resto, anuncio) {
    let melhor = { marca: listas[0].marca, candidatos: [] };
    for (const { marca, modelos } of listas) {
      const candidatos = escolherCandidatos(modelos, resto, anuncio);
      if (candidatos.length && (!melhor.candidatos.length || candidatos[0].pontos > melhor.candidatos[0].pontos)) melhor = { marca, candidatos };
    }
    return melhor;
  }

  // Escolhe o código de ano ("2015-5") para o ano do anúncio: combustível do anúncio, senão flex, senão o primeiro.
  function escolherAno(anos, ano, combustivel) {
    const doAno = anos.filter((a) => a.code.startsWith(ano + '-'));
    if (!doAno.length) return null;
    const por = (dig) => doAno.find((a) => a.code.endsWith('-' + dig));
    return (combustivel && por(COD_COMBUSTIVEL[combustivel])) || por('5') || doAno[0];
  }

  // Casa o anúncio com versões FIPE. Retorna { tipo: 'provavel'|'ambiguo'|'nenhum'|'sem-marca', ... }.
  async function casar(cliente, anuncio) {
    const marcas = await cliente.marcas();
    const achada = anuncio.ano && acharMarca(anuncio.palavras, marcas);
    if (!achada) return { tipo: 'sem-marca' };
    const { resto } = achada;
    // Lido do anúncio, devolvido ao selo para depuração quando não há casamento.
    const lido = { marca: achada.marca.name, modelo: resto.join(' '), ano: anuncio.ano };
    // Candidatos por nome (escolherEntreMarcas); a lista de modelos de cada marca vem do cache (1 chamada só na primeira vez).
    const marcasDoTitulo = resto.length ? [achada.marca, ...achada.outras] : [];
    const listas = [];
    for (const m of marcasDoTitulo) listas.push({ marca: m, modelos: await cliente.modelos(m.code) });
    const escolha = marcasDoTitulo.length ? escolherEntreMarcas(listas, resto, anuncio) : { marca: achada.marca, candidatos: [] };
    const marca = escolha.marca;
    let pendentes = escolha.candidatos;

    // Valida o ano: busca os anos só dos candidatos próximos do topo (poupa cota), em rodadas.
    let validos = [];
    for (let rodada = 0; rodada < MAX_RODADAS && !validos.length && pendentes.length; rodada++) {
      const lote = pendentes.filter((c) => c.pontos >= pendentes[0].pontos - MARGEM).slice(0, MAX_ANOS_POR_RODADA);
      pendentes = pendentes.filter((c) => !lote.includes(c));
      const anos = await emParalelo(lote.map((c) => () => cliente.anos(marca.code, c.modelo)), PARALELO);
      lote.forEach((c, i) => {
        const a = escolherAno(anos[i], anuncio.ano, anuncio.combustivel);
        if (a) validos.push({ ...c, anoCodigo: a.code, combustivelFipe: a.name.replace(/^\d+\s*/, '') });
      });
    }
    if (!validos.length) return { tipo: 'nenhum', lido };

    // Folga clara sobre o segundo -> "provável"; senão ambíguo, com faixa de preço dos melhores.
    validos.sort((a, b) => b.pontos - a.pontos);
    const clara = validos.length === 1 || validos[0].pontos - validos[1].pontos >= MARGEM;
    const topo = validos.filter((c) => c.pontos >= validos[0].pontos - MARGEM);
    const aConsultar = (clara ? validos.slice(0, 1) : topo).slice(0, MAX_PRECOS);
    const precos = await emParalelo(aConsultar.map((c) => () => cliente.preco(marca.code, c.modelo, c.anoCodigo)), PARALELO);
    aConsultar.forEach((c, i) => { c.valor = P.lerNumero(precos[i].price.replace('R$', '')); c.mes = precos[i].referenceMonth; });
    const valores = aConsultar.map((c) => c.valor);
    return {
      tipo: clara ? 'provavel' : 'ambiguo',
      lido,
      marca: marca.code,
      candidatos: validos,
      faixa: clara ? null : { min: Math.min(...valores), max: Math.max(...valores) },
      mes: aConsultar[0].mes,
      confiancaBaixa: validos[0].pontos < 3,
    };
  }

  // Preço de uma versão escolhida à mão no selo. Retorna { valor, mes }.
  async function consultarPreco(cliente, marca, modelo, anoCodigo) {
    const p = await cliente.preco(marca, modelo, anoCodigo);
    return { valor: P.lerNumero(p.price.replace('R$', '')), mes: p.referenceMonth };
  }

  const api = { criarCliente, casar, consultarPreco, acharMarca, pontuar, escolherCandidatos, escolherEntreMarcas, cabeca, escolherAno, ErroFipe, emParalelo };
  // Exporta nos dois mundos: global (service worker) e module.exports (testes em Node).
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  raiz.FipeApi = api;
})(globalThis);
