// Decisão pura do ciclo de 1 s do leitor de página: dado o que a página mostra agora e as chaves do ciclo anterior,
// diz o que fazer (limpar o selo, aguardar ou consultar) e quais são as novas chaves. Não toca no DOM nem em chrome.*,
// por isso é testável em Node. Carrega como script clássico (global FipeCiclo, listado antes de content-facebook.js
// no manifest) e como module.exports nos testes.
(function (raiz) {
  // Chave de estabilidade: anúncio + tudo o que alimenta a consulta (título, preço, ficha e descrição).
  function chaveDe(id, dados) {
    return [id, dados.titulo, dados.preco, dados.sobre, dados.descricao].join('|');
  }

  // Retorna { acao: 'limpar'|'aguardar'|'consultar', chaveVista, chaveConsultada }.
  // "limpar": o chamador incrementa o contador de pedidos (descarta respostas atrasadas) e remove o selo.
  function decidir({ id, dados, chaveVista, chaveConsultada }) {
    // Sem anúncio de veículo na tela: limpa e esquece tudo.
    if (!id || !dados) return { acao: 'limpar', chaveVista: null, chaveConsultada: null };
    const chave = chaveDe(id, dados);
    // Anúncio ou conteúdo mudou: o selo e a resposta em voo são do estado anterior; recomeça a contar a estabilidade.
    if (chave !== chaveVista) return { acao: 'limpar', chaveVista: chave, chaveConsultada: null };
    // Estável por 2 ciclos: consulta uma única vez por chave.
    if (chave === chaveConsultada) return { acao: 'aguardar', chaveVista, chaveConsultada };
    return { acao: 'consultar', chaveVista, chaveConsultada: chave };
  }

  const api = { chaveDe, decidir };
  // Exporta nos dois mundos: global (content script) e module.exports (testes em Node).
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  raiz.FipeCiclo = api;
})(globalThis);
