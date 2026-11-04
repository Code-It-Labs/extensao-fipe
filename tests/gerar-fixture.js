// Gera tests/fixtures/fipe-voyage-logan.json com dados reais da API FIPE (uso manual, fora da suíte de testes).
// Uso: node tests/gerar-fixture.js [arquivo-de-saida]   (padrão: tests/fixtures/fipe-voyage-logan.json)
// Gasta cerca de 65 consultas da cota diária da API, com 1,1 s entre elas. Os valores mudam a cada mês de
// referência: ao regerar, os testes que citam preços (R$ 19.002 etc.) precisam ser atualizados.
const fs = require('node:fs');
const path = require('node:path');

const BASE = 'https://fipe.parallelum.com.br/api/v2';
const saida = process.argv[2] || path.join(__dirname, 'fixtures', 'fipe-voyage-logan.json');
// Marcas e filtro de nome do modelo; ano para o qual os preços são coletados.
const ALVOS = [{ marca: '59', filtro: /voyage/i, ano: '2015' }, { marca: '48', filtro: /logan/i, ano: '2008' }];

// Espera entre chamadas para respeitar o throttle da API.
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// GET na API; erro HTTP interrompe a geração.
async function get(caminho) {
  await dormir(1100);
  const r = await fetch(BASE + caminho);
  if (!r.ok) throw new Error(`${r.status} ${caminho}`);
  return r.json();
}

(async () => {
  const dados = { _nota: `Dados reais da API FIPE (parallelum v2) coletados em ${new Date().toISOString().slice(0, 10)}. Modelos filtrados por VOYAGE/LOGAN; preços só do ano do anúncio de teste.`, referencias: (await get('/references')).slice(0, 3), marcas: await get('/cars/brands'), modelos: {}, anos: {}, precos: {} };
  for (const { marca, filtro, ano } of ALVOS) {
    dados.modelos[marca] = (await get(`/cars/brands/${marca}/models`)).filter((m) => filtro.test(m.name));
    for (const m of dados.modelos[marca]) {
      const anos = await get(`/cars/brands/${marca}/models/${m.code}/years`);
      dados.anos[`${marca}/${m.code}`] = anos;
      for (const a of anos.filter((y) => y.code.startsWith(ano + '-'))) dados.precos[`${marca}/${m.code}/${a.code}`] = await get(`/cars/brands/${marca}/models/${m.code}/years/${a.code}`);
    }
  }
  fs.writeFileSync(saida, JSON.stringify(dados, null, 1));
  console.log(`${Object.keys(dados.anos).length} modelos, ${Object.keys(dados.precos).length} preços -> ${saida}`);
})().catch((e) => { console.error(e); process.exit(1); });
