# CLAUDE.md — extensao-fipe

## 1. O que é
- **Mantenedor:** Code It Labs. Repositório público e gratuito: github.com/Code-It-Labs/extensao-fipe (licença MIT). Para o público: `README.md`, `PRIVACY.md`, `CONTRIBUTING.md`; guia de empacotar e lançar: `docs/EMPACOTAR.md`.
- **Descrição:** extensão de Chrome/Firefox (Manifest V3) que, num anúncio de carro do Facebook Marketplace ou da OLX, lê ano/marca/modelo, consulta a Tabela FIPE e mostra um selo na página com o valor FIPE e a diferença para o preço pedido. Planejado: Webmotors (precisa de páginas de amostra) e iCarros (classificados desativados).
- **Status:** v0.2.0, testada com anúncios reais no Firefox 159 e no Chrome for Testing 157 (selo, versão salva, popup, service worker); 125 testes (123 passam, 2 pulados que usam a API real). Edge, Brave, Windows e outros domínios do Facebook não testados.
- Pendências e ideias: `docs/BACKLOG.md` (público; manter neutro, sem nomes pessoais nem processo interno).

## 2. Stack
- JavaScript puro, sem biblioteca e sem build (adicionar dependência só com autorização do mantenedor). Node 24 só para testes (`node:test`).
- Arquivos clássicos, sem `import`/`export`: `src/parser.js` e `src/fipe.js` expõem os globais `FipeParser` e `FipeApi` (e `module.exports` guardado por `typeof module`, para os testes). O content script carrega `parser.js` antes do leitor (ordem no manifest); o service worker usa `importScripts`.
- Núcleo genérico: `parser.js` (texto -> dados) e `fipe.js` (API, cache, casamento). Cada leitor conhece só o seu site (`content-facebook.js`, `content-olx.js`); o selo (ciclo, desenho, escolha salva) vive em `src/selo-comum.js` (`FipeSelo.iniciar({ site, idDaUrl, lerPagina })`). Site novo = novo leitor + novo bloco em `content_scripts`, na ordem: `parser.js`, `ciclo.js`, `selo-comum.js`, leitor.
- `src/ciclo.js` (decisão pura do ciclo de 1 s, global `FipeCiclo`) é carregado entre `parser.js` e o leitor do site.
- `jsdom` (devDependency) só para testar os leitores de página; a extensão em si continua sem dependências e sem build. Rodar `npm install` uma vez (`node_modules` está no `.gitignore`; Node >= 24.15).
- `background.scripts` (Firefox, event page) e `service_worker` (Chrome) apontam para o mesmo `src/background.js`; as duas listas de carga (manifest e `importScripts`) devem ficar na mesma ordem: `parser.js`, `fipe.js`. O código usa `globalThis.browser || chrome`.

## 3. Rodar e testar
```bash
npm install                               # uma vez (jsdom); sem isso os testes dos leitores falham com "Cannot find module 'jsdom'"
npm test                                  # = node --test (offline, usa fixtures)
FIPE_REAL=1 node --test tests/api-real.test.js   # opcional: bate na API real (~25 consultas)
node tests/gerar-fixture.js                # regera tests/fixtures/fipe-voyage-logan.json (~65 consultas; muda os preços dos testes)
node tools/empacotar.js                    # gera dist/*.zip (Chrome e Firefox)
```
- Carregar no Chrome: `chrome://extensions` > Modo do desenvolvedor > Carregar sem compactação > escolher o zip do Chrome descompactado (ou a pasta do projeto). Depois de editar, recarregar a extensão **e** dar F5 na aba.
- Firefox (mínimo 127): `about:debugging#/runtime/this-firefox` > Carregar extensão temporária > escolher `manifest.json`. É removida ao fechar o Firefox; depois de editar, clicar em Recarregar e dar F5 na aba.
- Os leitores do Facebook e da OLX são testados em `tests/content-facebook.test.js` e `tests/content-olx.test.js` com o DOM do jsdom (`tests/helper-dom.js` documenta as polifills de `innerText`/`checkVisibility`). Não substituem o roteiro manual (`docs/ROTEIRO-TESTE.md`): o HTML real é ofuscado e as fixtures são sintéticas.
- `node --test tests/` (com pasta) NÃO funciona no Node 24 (trata `tests` como módulo). Usar `node --test` ou `node --test tests/*.test.js`.

## 4. Publicar e rollback
- Lançar: mudar `version` no `manifest.json` e no `package.json` (um teste confere), rodar `npm install --package-lock-only`, commitar na `main` e enviar a tag `vX.Y.Z`; `.github/workflows/release.yml` testa, empacota e cria a Release com os zips e o `SHA256SUMS`. Detalhes em `docs/EMPACOTAR.md`.
- Rollback: apagar a Release e a tag (`git push --delete origin <tag>`) e reverter o commit; para uso local, `git checkout <commit> -- .` e recarregar a extensão.

## 5. Decisões já tomadas
- A API é chamada só no service worker (`background.js`): o content script não pode por CORS. O `background.js` valida os pedidos (códigos `/^[\w-]+$/`, forma e tamanho do anúncio) e o `fipe.js` confere a forma das respostas antes de gravar no cache.
- Cache em `storage.local`: marcas, modelos e anos 30 dias; referências 1 dia; preço chaveado pelo código do mês de referência.
- Escolha salva por anúncio em `storage.local`: chave `escolha:<site>:<id>` (`fb`, `olx`), máximo de 200 no total (as mais antigas saem primeiro).
- Privacidade: a FIPE só recebe códigos de marca/modelo/ano (e de modelos parecidos quando a versão não é clara); título, descrição, URL e id nunca saem do navegador. Mudou permissão, site suportado ou o que é guardado: atualizar `PRIVACY.md` e o README.
- Selo fixo no canto inferior direito (inserir perto do preço seria frágil com o HTML ofuscado).
- Código de ano da FIPE: dígito após o hífen = combustível (1 gasolina, 2 álcool, 3 diesel, 5 flex; conferido em chamadas reais). Não dá para montar `2015-1` a partir do ano: é preciso listar os anos do modelo.
- Id do Firefox `extensao-fipe@codeitlabs.com.br` (`browser_specific_settings.gecko.id`): é só um identificador, não um e-mail real, e não deve mudar depois de publicado em loja.

## 6. Fora de escopo
- Motos/caminhões; Webmotors e iCarros. Ver `docs/BACKLOG.md`.

## 7. Armadilhas
- API FIPE pública (`fipe.parallelum.com.br/api/v2`) sem chave: cota de 500/dia e rajada de 50 lidas em headers de respostas em cache (não confirmadas). `/references` fica em `/api/v2/references` (não em `/cars/`). Listas de modelos vêm da marca inteira (centenas); filtramos no cliente.
- Nome FIPE tem espaços duplos e abreviações ("T.Flex", "Expres.", "Aut."); o casamento normaliza e trata prefixo.
- O HTML do Facebook é ofuscado: ler só por `h1`/`h2`/texto, nunca por classe. Textos em pt-BR verificados em páginas reais: "Sobre esse veículo", "Descrição do vendedor", "Tipo de combustível", "Câmbio", prefixo "Vendido  ·" no h1; o separador do título da aba varia (" - " ou " — ").
- Mudar texto, h2 ou estrutura lida em `content-facebook.js` exige atualizar as fixtures de `tests/helper-dom.js` (os textos delas vieram de páginas reais).
- O content script só entra em carga/recarga de uma URL `/marketplace/*`. Quem chega ao Marketplace por clique a partir de outra página do Facebook (SPA) não vê o selo até dar F5.
- O `matches` de `/marketplace/*` pega todos os anúncios; "só carro" vem do conteúdo (seção "About this vehicle"/"Sobre esse veículo" presente e marca FIPE reconhecida).
- A OLX bloqueia `curl` (403) e requisições automáticas em sequência: as páginas de teste dela são sintéticas, feitas do texto de páginas reais inspecionadas à mão. O leitor da OLX só lê preço, nome do carro e descrição do JSON-LD (nunca o anunciante) e não depende do `<h1>` (o Firefox recebe a página sem ele).
- `host_permissions` só da FIPE (sem Facebook nem OLX): funcionou no Chrome 157 e no Firefox 159; se faltar selo em outro navegador, recolocar o site em `host_permissions` e em `tests/manifest.test.js`.
- O zip do Firefox não é assinado: só serve como complemento temporário.
