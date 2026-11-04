// Mede o casamento anúncio -> família FIPE no nível dos NOMES (sem rede e sem consultar ano nem preço): usa os nomes reais
// de modelos de ~33 marcas (fixtures/fipe-modelos.json) e um corpus de títulos de Marketplace (fixtures/corpus-anuncios.json).
// Imprime acertos, erros e "nenhum"; falha se houver erro de família ou se os acertos caírem abaixo do piso.
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../src/parser.js');
const F = require('../src/fipe.js');
const dados = require('./fixtures/fipe-modelos.json');
const { anuncios } = require('./fixtures/corpus-anuncios.json');

// Piso de acertos entre os positivos: a lógica antiga (primeira palavra) fazia ~87% neste corpus e a atual faz ~99%.
// 95% pega a volta ao comportamento antigo e deixa folga para a lista FIPE mudar quando o fixture for regerado.
const PISO = 0.95;
// Mesma folga do casar(): candidatos dentro dela do primeiro formam o "topo" que o selo mostraria.
const MARGEM = 3;
const nomeNorm = (nome) => P.normalizar(nome) + ' ';

// Roda o casamento por nome de um item do corpus. Retorna { resultado: 'acerto'|'erro'|'nenhum', topo, marca }.
function classificar(item) {
  const a = P.lerAnuncio({ titulo: item.titulo, descricao: item.descricao, preco: 'R$ 10.000' });
  const achada = a.ano && F.acharMarca(a.palavras, dados.marcas);
  if (!achada) return { resultado: 'nenhum', topo: [] };
  const listas = [achada.marca, ...achada.outras].map((m) => ({ marca: m, modelos: dados.modelos[m.code] || [] }));
  const { candidatos } = F.escolherEntreMarcas(listas, achada.resto, a);
  if (!candidatos.length) return { resultado: 'nenhum', topo: [] };
  const topo = candidatos.filter((c) => c.pontos >= candidatos[0].pontos - MARGEM).slice(0, 20);
  if (item.familia === null) return { resultado: 'erro', topo };
  const re = new RegExp(item.familia, 'i');
  return { resultado: topo.every((c) => re.test(nomeNorm(c.nome))) ? 'acerto' : 'erro', topo };
}

test('corpus: tamanho mínimo e toda família esperada existe na lista FIPE (evita regex com erro de digitação)', () => {
  assert.ok(anuncios.length >= 100, `só ${anuncios.length} anúncios`);
  assert.ok(anuncios.some((a) => a.familia === null), 'faltam casos negativos');
  const nomes = Object.values(dados.modelos).flat().map((m) => nomeNorm(m.name));
  for (const a of anuncios.filter((x) => x.familia)) {
    assert.ok(nomes.some((n) => new RegExp(a.familia, 'i').test(n)), `família sem nenhum nome FIPE: ${a.titulo} -> ${a.familia}`);
  }
});

test('corpus: zero erro de família e acertos acima do piso', () => {
  const por = { acerto: 0, erro: 0, nenhum: 0 };
  const falhas = [], pendentesQuePassaram = [];
  let positivos = 0, negativosOk = 0, negativos = 0;
  for (const item of anuncios) {
    const r = classificar(item);
    if (item.familia === null) {
      negativos++;
      if (r.resultado === 'nenhum') negativosOk++;
      else falhas.push(`falso positivo: ${item.titulo} -> ${r.topo.slice(0, 2).map((c) => c.nome).join(' | ')}`);
      continue;
    }
    positivos++;
    por[r.resultado]++;
    if (item.pendente) { if (r.resultado === 'acerto') pendentesQuePassaram.push(item.titulo); continue; }
    if (r.resultado === 'erro') falhas.push(`família errada: ${item.titulo} -> ${r.topo.filter((c) => !new RegExp(item.familia, 'i').test(nomeNorm(c.nome))).slice(0, 2).map((c) => c.nome).join(' | ')}`);
  }
  const taxa = por.acerto / positivos;
  console.log(`# casamento por nome: ${positivos} positivos: ${por.acerto} acertos (${(taxa * 100).toFixed(1)}%), ${por.erro} erros de família, ${por.nenhum} nenhum; negativos: ${negativosOk}/${negativos} sem casar`);
  assert.deepEqual(falhas, []);
  assert.deepEqual(pendentesQuePassaram, [], 'casos marcados "pendente" já acertam: remova a marca no corpus');
  assert.ok(taxa >= PISO, `acertos ${(taxa * 100).toFixed(1)}% abaixo do piso de ${PISO * 100}%`);
});
