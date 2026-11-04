// Código de fundo da extensão (service worker no Chrome, event page no Firefox): recebe mensagens do content script, consulta a FIPE e responde.
// A chamada à API fica aqui (e não no content script) por causa do CORS da página do Facebook.
// Chrome (service worker): parser.js e fipe.js entram com importScripts (síncrono, no topo).
// Firefox (event page): não há importScripts; o manifest já carrega os dois antes, na ordem de "background.scripts".
if (typeof importScripts === 'function') importScripts('parser.js', 'fipe.js');

// No Firefox existe "browser" (com promessas); no Chrome, "chrome" (MV3 também devolve promessas).
const api = globalThis.browser || chrome;

// Cache persistente em storage.local, no formato { get, set } que o cliente FIPE espera.
const cache = {
  get: async (chave) => (await api.storage.local.get(chave))[chave],
  set: (chave, valor) => api.storage.local.set({ [chave]: valor }),
};
const cliente = FipeApi.criarCliente({ fetch: (url) => fetch(url), cache });

// Código de marca, modelo ou ano da FIPE ("59", "4753", "2015-5"): só letras, dígitos, "_" e "-". Fora disso o pedido é recusado sem consultar a API.
const ehCodigo = (x) => typeof x === 'string' && /^[\w-]+$/.test(x);

// Anúncio vindo do content script (formato de FipeParser.lerAnuncio) com limites razoáveis: o casamento não processa lixo nem tamanhos absurdos.
const ehLista = (x, max) => Array.isArray(x) && x.length <= max && x.every((t) => typeof t === 'string' && t.length <= 200);
const ehTextoOuNulo = (x) => x === null || (typeof x === 'string' && x.length <= 50);
const anuncioValido = (a) => !!a && typeof a === 'object' && (a.ano === null || Number.isInteger(a.ano))
  && ehLista(a.palavras, 100) && ehLista(a.tokens, 5000) && [a.combustivel, a.cambio, a.cilindrada].every(ehTextoOuNulo);

// Executa o pedido do content script; erros viram { ok: false, erro } com mensagem pronta para o selo.
async function tratar(msg) {
  try {
    if (msg.tipo === 'casar') {
      if (!anuncioValido(msg.anuncio)) throw new FipeApi.ErroFipe('pedido', 'Pedido inválido: anúncio fora do formato esperado.');
      return { ok: true, resultado: await FipeApi.casar(cliente, msg.anuncio) };
    }
    if (msg.tipo === 'preco') {
      if (![msg.marca, msg.modelo, msg.anoCodigo].every(ehCodigo)) throw new FipeApi.ErroFipe('pedido', 'Pedido inválido: código de marca, modelo ou ano fora do formato.');
      return { ok: true, resultado: await FipeApi.consultarPreco(cliente, msg.marca, msg.modelo, msg.anoCodigo) };
    }
    return { ok: false, erro: { tipo: 'interno', mensagem: 'Pedido desconhecido.' } };
  } catch (e) {
    const conhecido = e instanceof FipeApi.ErroFipe;
    return { ok: false, erro: { tipo: conhecido ? e.tipo : 'interno', mensagem: conhecido ? e.message : 'Erro inesperado ao consultar a FIPE.' } };
  }
}

// Listener registrado no topo; "return true" mantém o canal aberto para a resposta assíncrona.
api.runtime.onMessage.addListener((msg, remetente, responder) => {
  if (remetente.id !== api.runtime.id) return false;
  tratar(msg).then(responder);
  return true;
});
