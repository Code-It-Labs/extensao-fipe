# Changelog

Todas as mudanças relevantes do projeto ficam neste arquivo. O formato segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e as versões seguem o [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [0.2.0] - 2026-11-04

Primeira versão publicada no GitHub (Release v0.2.0, com os zips do Chrome e do Firefox e o `SHA256SUMS`).

### Adicionado
- Suporte à **OLX** (`src/content-olx.js`), ao lado do Facebook Marketplace. O selo, o ciclo de leitura e a escolha salva ficam em `src/selo-comum.js`, compartilhados pelos dois sites.
- **Versão escolhida salva** por anúncio (`storage.local`, no máximo 200 escolhas): depois de escolher na lista do selo, a mesma versão volta ao reabrir o anúncio.
- **Pacotes** para Chrome (Edge e Brave não testados) e Firefox (`node tools/empacotar.js`), ícone, popup de ajuda ao clicar no ícone e guia `INSTALAR.md`. A `LICENSE` vai dentro dos dois zips.
- Workflows do GitHub: CI (`npm test`) e Release (zips e `SHA256SUMS` anexados à Release ao criar uma tag `v*`), Dependabot, `.editorconfig`.
- Documentação para quem contribui: `README.md`, `PRIVACY.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `docs/EMPACOTAR.md`, `docs/ROTEIRO-TESTE.md`, formulários de issue e modelo de pull request. Licença MIT.
- Testes dos leitores de página e do selo com `jsdom` (só dos testes) e testes do empacotamento e do manifest. São 125 testes, 123 passam e 2 são pulados (consultam a API real).

### Alterado
- **Casamento de modelos** por cabeça de palavras: junta e separa palavras ("eco sport" e "ecosport"), trata "novo/nova/new", usa a segunda palavra como família, aceita palavra solta única e as duas marcas Chery. Num conjunto de 263 títulos escritos à mão, a família do modelo passou de cerca de 87% para 99,6% de acertos (1 erro conhecido: Range Rover Velar; nenhum dos 15 títulos que não deviam casar casou).
- O id da extensão no Firefox passou a ser `extensao-fipe@codeitlabs.com.br`.

### Corrigido
- Leitura em pt-BR do Facebook: seção "Sobre esse veículo", separadores do título da aba e prefixo "Vendido ·" em anúncios vendidos.
- HB20 Sedan e Fox Cross, cujo nome na FIPE embute a palavra do título.

### Segurança
- O código de fundo só aceita pedidos de preço com códigos de marca, modelo e ano no formato esperado (`/^[\w-]+$/`) e anúncios com a forma e o tamanho esperados; o resto é recusado com erro claro, sem consultar a API.
- Os códigos são codificados com `encodeURIComponent` ao montar a URL da FIPE.
- As respostas da API são conferidas (listas, campos esperados, preço com número) antes de entrar no cache; resposta fora do formato vira erro claro.

## [0.1.0]

Versão inicial, só para uso local (nunca publicada): leitor do Facebook Marketplace, parser, cliente da API FIPE com cache, casamento do anúncio com a FIPE, service worker (Chrome) e event page (Firefox), selo e testes offline.
