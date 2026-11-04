// Gera tests/fixtures/fipe-modelos.json: lista de marcas e NOMES de modelos das marcas mais comuns no mercado de usados
// brasileiro, vindos da API FIPE real (uso manual, fora da suíte). Serve de base ao teste de casamento por nome
// (tests/casamento-corpus.test.js), que não usa rede. Não consulta anos nem preços.
// Uso: node tests/gerar-fixture-modelos.js [arquivo-de-saida]
// Gasta ~1 + 1 por marca (cerca de 35 chamadas da cota diária), com 1,2 s entre elas.
const fs = require('node:fs');
const path = require('node:path');

const BASE = 'https://fipe.parallelum.com.br/api/v2';
const saida = process.argv[2] || path.join(__dirname, 'fixtures', 'fipe-modelos.json');
// Marcas buscadas, pelo nome FIPE exato (nome -> usado só para achar o código na lista de marcas).
const MARCAS = ['Fiat', 'GM - Chevrolet', 'VW - VolksWagen', 'Ford', 'Renault', 'Honda', 'Toyota', 'Hyundai', 'Jeep', 'Nissan',
  'Peugeot', 'Citroën', 'Mitsubishi', 'Kia Motors', 'Mercedes-Benz', 'BMW', 'Audi', 'Volvo', 'Land Rover', 'Caoa Chery',
  'Caoa Chery/Chery', 'Suzuki', 'MINI', 'Troller', 'Subaru', 'Mazda', 'Porsche', 'JAC', 'Lexus', 'Chrysler', 'RAM', 'BYD', 'GWM'];

// Espera entre chamadas para respeitar o throttle da API.
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// GET na API; erro HTTP interrompe a geração.
async function get(caminho) {
  await dormir(1200);
  const r = await fetch(BASE + caminho);
  if (!r.ok) throw new Error(`${r.status} ${caminho}`);
  return r.json();
}

(async () => {
  const marcas = await get('/cars/brands');
  const dados = { _nota: `Nomes de modelos reais da API FIPE (parallelum v2) coletados em ${new Date().toISOString().slice(0, 10)}. Sem anos nem preços.`, marcas, modelos: {} };
  let chamadas = 1;
  for (const nome of MARCAS) {
    const marca = marcas.find((m) => m.name === nome);
    if (!marca) { console.warn(`marca ausente na FIPE: ${nome}`); continue; }
    dados.modelos[marca.code] = await get(`/cars/brands/${marca.code}/models`);
    chamadas++;
  }
  fs.writeFileSync(saida, JSON.stringify(dados, null, 1));
  console.log(`${Object.keys(dados.modelos).length} marcas, ${Object.values(dados.modelos).reduce((s, l) => s + l.length, 0)} modelos, ${chamadas} chamadas -> ${saida}`);
})().catch((e) => { console.error(e); process.exit(1); });
