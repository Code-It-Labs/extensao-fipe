// Parser genérico de anúncios de carro: funções puras que transformam texto (título, preço, ficha, descrição)
// em dados estruturados. Não conhece nenhum site: cada leitor de página (content-facebook.js, e no futuro
// OLX, Webmotors, iCarros) só extrai o texto do DOM e chama lerAnuncio().
// Carregamento: content script clássico (listado antes do leitor no manifest) e service worker (importScripts)
// usam o objeto global FipeParser; os testes em Node usam module.exports. Sem import/export de propósito.
(function (raiz) {
  // Normaliza para comparação: minúsculas, sem acento, só letras/dígitos; "1,6" e "1.6" viram "1.6"; "Ka+" vira "ka plus".
  function normalizar(texto) {
    return String(texto || '')
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/(?<=[a-z\d])\+/g, ' plus ')
      .replace(/(?<=\d)[.,](?=\d)/g, '#')
      .replace(/[^a-z0-9#]+/g, ' ')
      .replace(/#/g, '.')
      .trim();
  }

  // Converte "18,000", "18.000", "12.900,00" ou "1.5" em número (en e pt-BR). Retorna null se não houver dígito.
  function lerNumero(texto) {
    const s = String(texto || '').replace(/[^\d.,]/g, '');
    if (!/\d/.test(s)) return null;
    const ultimo = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
    if (ultimo === -1) return Number(s);
    const sep = s[ultimo];
    const outro = sep === '.' ? ',' : '.';
    const depois = s.slice(ultimo + 1);
    // Separador único e repetido, ou seguido de exatamente 3 dígitos, é milhar; o resto é decimal.
    const milhar = s.includes(outro) ? false : (s.split(sep).length > 2 || depois.length === 3);
    if (milhar) return Number(s.replace(/[.,]/g, ''));
    return Number(s.slice(0, ultimo).replace(/[.,]/g, '') + '.' + depois);
  }

  // Preço pedido: aceita "R$18,000" (en) e "R$ 18.000" / "R$ 12.900,00" (pt-BR).
  function lerPreco(texto) {
    const m = String(texto || '').match(/R\$\s*([\d.,]+)/);
    return m ? lerNumero(m[1]) : null;
  }

  // Combustível da ficha: "Fuel type: Gasoline" (en); "Combustível: Gasolina" (pt-BR) é palpite.
  function lerCombustivel(texto) {
    const m = String(texto || '').match(/(?:fuel type|combust[ií]vel)\s*:?\s*([^\n·]+)/i);
    if (!m) return null;
    const v = normalizar(m[1]);
    if (/gasolin/.test(v)) return 'gasolina';
    if (/ethanol|etanol|alcool/.test(v)) return 'alcool';
    if (/diesel/.test(v)) return 'diesel';
    if (/flex/.test(v)) return 'flex';
    if (/electric|eletric/.test(v)) return 'eletrico';
    if (/hybrid|hibrid/.test(v)) return 'hibrido';
    return null;
  }

  // Câmbio da ficha: "Manual transmission" / "Automatic transmission" (en); "Câmbio manual" é palpite pt-BR.
  function lerCambio(texto) {
    const m = String(texto || '').match(/(manual|automatic|autom[aá]tic[oa])\s+transmission|(?:c[aâ]mbio|transmiss[aã]o)\s*:?\s*(manual|autom[aá]tic[oa])/i);
    if (!m) return null;
    return /^manual/i.test(m[1] || m[2]) ? 'manual' : 'automatico';
  }

  // Primeira cilindrada plausível ("1.6", "1,6", "1.0"); ignora milhares e preços ("41,000", "R$ 12.900,00").
  function lerCilindrada(texto) {
    const re = /(?<![\d.,])(\d)[.,](\d)(?!\d)/g;
    for (const m of String(texto || '').matchAll(re)) {
      const v = Number(m[1] + '.' + m[2]);
      if (v >= 0.6 && v <= 8) return m[1] + '.' + m[2];
    }
    return null;
  }

  // Separa o ano e as palavras restantes (normalizadas) do título: "2008 Renault LOGAN" -> {ano: 2008, palavras: ["renault","logan"]}.
  function dividirTitulo(titulo) {
    const norm = normalizar(titulo);
    const m = norm.match(/(?<![\d.])(19[5-9]\d|20[0-4]\d)(?![\d.])/);
    if (!m) return { ano: null, palavras: norm ? norm.split(' ') : [] };
    const palavras = norm.split(' ').filter((p) => p !== m[1]);
    return { ano: Number(m[1]), palavras };
  }

  // Monta o anúncio estruturado a partir do texto cru lido da página. Só estes campos seguem para o casamento.
  function lerAnuncio({ titulo, preco, sobre, descricao }) {
    const dividido = dividirTitulo(titulo);
    const ano = dividido.ano;
    // Mesmos limites que o service worker exige (anuncioValido): palavra com mais de 200 caracteres é descartada e a lista é cortada em 100.
    const palavras = dividido.palavras.filter((p) => p.length <= 200).slice(0, 100);
    const textoLivre = `${titulo || ''}\n${descricao || ''}`;
    let cambio = lerCambio(sobre);
    // Fronteira com \p{L} (o \b do JS não trata letra acentuada como palavra: "autêntico" casaria "aut"); "manual" no texto impede inferir automático.
    const palavra = (re) => new RegExp(`(?<!\\p{L})(?:${re})(?!\\p{L})`, 'iu').test(textoLivre);
    if (!cambio && !palavra('manual') && palavra('autom[aá]tic[oa]|aut')) cambio = 'automatico';
    return {
      ano,
      palavras,
      preco: lerPreco(preco),
      combustivel: lerCombustivel(sobre),
      cambio,
      cilindrada: lerCilindrada(textoLivre),
      // Palavras do título + descrição, usadas para pontuar as versões da FIPE.
      // Tokens com mais de 200 caracteres (hash, texto colado sem espaços) são descartados e a lista é cortada em 5000 (na ordem de aparição): o service worker rejeita o anúncio inteiro acima desses limites.
      tokens: [...new Set(normalizar(textoLivre).split(' ').filter((t) => t && t.length <= 200))].slice(0, 5000),
    };
  }

  // Formata número como "R$ 41.572" (pt-BR, sem centavos).
  function formatarReal(n) {
    return 'R$ ' + Math.round(n).toLocaleString('pt-BR');
  }

  // Texto da diferença entre pedido e FIPE: "R$ 23.572 abaixo da FIPE (57%)"; percentual sobre o valor FIPE.
  function formatarDiferenca(pedido, fipe) {
    if (pedido == null || !fipe) return null;
    const dif = Math.round(fipe - pedido);
    if (dif === 0) return 'igual à FIPE';
    const pct = Math.round((Math.abs(dif) / fipe) * 100);
    return `${formatarReal(Math.abs(dif))} ${dif > 0 ? 'abaixo' : 'acima'} da FIPE (${pct}%)`;
  }

  const api = { normalizar, lerNumero, lerPreco, lerCombustivel, lerCambio, lerCilindrada, dividirTitulo, lerAnuncio, formatarReal, formatarDiferenca };
  // Exporta nos dois mundos: global (extensão) e module.exports (testes em Node).
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  raiz.FipeParser = api;
})(globalThis);
