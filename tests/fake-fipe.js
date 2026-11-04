// Ajudante de teste: fetch simulado da API FIPE servido pelo fixture fipe-voyage-logan.json (offline).
// Registra cada chamada em "chamadas"; URL que o fixture não conhece responde 404 e fica registrada, para os
// testes mostrarem exatamente o que o casamento consultou.
const dados = require('./fixtures/fipe-voyage-logan.json');

const BASE = 'https://fipe.parallelum.com.br/api/v2';

// Cria { fetch, chamadas, desconhecidas, cache } novos; o cache é um Map em memória no formato esperado pelo cliente.
function criarFake() {
  const chamadas = [];
  const desconhecidas = [];
  const mapa = new Map();
  const resposta = (status, corpo) => { if (status === 404) desconhecidas.push(chamadas[chamadas.length - 1]); return { status, ok: status >= 200 && status < 300, json: async () => corpo }; };
  async function fetch(url) {
    const caminho = url.replace(BASE, '');
    chamadas.push(caminho);
    let m;
    // Rotas: referências, marcas, modelos da marca, anos do modelo e preço do ano; o resto é 404.
    if (caminho === '/references') return resposta(200, dados.referencias);
    if (caminho === '/cars/brands') return resposta(200, dados.marcas);
    if ((m = caminho.match(/^\/cars\/brands\/(\d+)\/models$/))) return dados.modelos[m[1]] ? resposta(200, dados.modelos[m[1]]) : resposta(404, {});
    if ((m = caminho.match(/^\/cars\/brands\/(\d+)\/models\/(\d+)\/years$/))) return dados.anos[`${m[1]}/${m[2]}`] ? resposta(200, dados.anos[`${m[1]}/${m[2]}`]) : resposta(404, {});
    if ((m = caminho.match(/^\/cars\/brands\/(\d+)\/models\/(\d+)\/years\/([\d-]+)$/))) return dados.precos[`${m[1]}/${m[2]}/${m[3]}`] ? resposta(200, dados.precos[`${m[1]}/${m[2]}/${m[3]}`]) : resposta(404, {});
    return resposta(404, {});
  }
  const cache = { get: async (k) => mapa.get(k), set: async (k, v) => { mapa.set(k, v); } };
  return { fetch, chamadas, desconhecidas, cache };
}

module.exports = { criarFake };
