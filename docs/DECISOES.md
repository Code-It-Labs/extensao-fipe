<!-- Registro público das decisões já tomadas no projeto; complementa a seção 5 do CLAUDE.md. O que está em aberto fica no BACKLOG.md. -->
# Decisões do projeto

Cada linha registra uma decisão já tomada: data, o que foi decidido e o motivo. Quando a data não foi anotada na época, aparece "não registrada". Ideias e pendências ficam no [BACKLOG.md](BACKLOG.md).

## Arquitetura

| Data | Decisão | Motivo |
|---|---|---|
| não registrada | JavaScript puro, sem biblioteca e sem build; o `jsdom` entra só como devDependency de teste. | A extensão roda sem dependências e os leitores de página precisam de DOM nos testes. |
| não registrada | A API da FIPE é chamada só no service worker (`background.js`), que valida os pedidos (códigos no formato `/^[\w-]+$/`, forma e tamanho do anúncio); o `fipe.js` confere a forma das respostas antes de gravar no cache. | O content script não pode chamar a API por causa do CORS. |
| não registrada | Cache em `storage.local`: marcas, modelos e anos por 30 dias, referências por 1 dia, e o preço chaveado pelo código do mês de referência. | Motivo não registrado. |
| não registrada | A escolha de versão fica salva por anúncio em `storage.local`, na chave `escolha:<site>:<id>` (`fb`, `olx`), com no máximo 200 no total (as mais antigas saem primeiro). | Depois de escolher na lista do selo, a mesma versão volta ao reabrir o anúncio. |
| não registrada | O selo fica fixo no canto inferior direito da página. | Inserir o selo perto do preço seria frágil com o HTML ofuscado do Facebook. |
| não registrada | O código de ano da FIPE é tratado assim: o dígito depois do hífen é o combustível (1 gasolina, 2 álcool, 3 diesel, 5 flex), e os anos do modelo são listados em vez de montar `2015-1` a partir do ano. | Foi conferido em chamadas reais: não dá para deduzir o código só pelo ano. |
| 2026-11-04 | O casamento de modelos passou a ser por cabeça de palavras (junta e separa palavras, trata "novo/nova/new", usa a segunda palavra como família). | Num conjunto de 263 títulos escritos à mão, a família do modelo passou de cerca de 87% para 99,6% de acertos. |

## Privacidade e segurança

| Data | Decisão | Motivo |
|---|---|---|
| não registrada | A FIPE só recebe códigos de marca, modelo e ano (e de modelos parecidos quando a versão não é clara); título, descrição, URL e id do anúncio nunca saem do navegador. Mudou permissão, site suportado ou o que é guardado: atualizar o `PRIVACY.md` e o README. | Motivo não registrado. |
| não registrada | `host_permissions` só da FIPE, sem o Facebook nem a OLX. | Menor permissão possível; funcionou no Chrome 157 e no Firefox 159. |
| não registrada | O leitor da OLX lê só preço, nome do carro e descrição do JSON-LD, nunca o anunciante, e não depende do `<h1>`. | Motivo não registrado; sobre o `<h1>`, o Firefox recebe a página da OLX sem ele. |
| 2026-11-04 | O parser (`lerAnuncio`) descarta palavras do título com mais de 200 caracteres e corta a lista em 100; descarta tokens com mais de 200 e corta em 5000. | Respeitar os limites que o código de fundo exige sem recusar anúncio real por tamanho. |

## Sites e escopo

| Data | Decisão | Motivo |
|---|---|---|
| não registrada | Motos e caminhões ficam fora do escopo. | Motivo não registrado. Hoje uma moto mostra "Não encontrei na FIPE". |
| não registrada | Webmotors e iCarros ficam fora do escopo por ora. | A Webmotors bloqueia o acesso automatizado e não há páginas de amostra para criar o leitor; o iCarros desativou os classificados. |
| 2026-11-04 | Suporte à OLX, ao lado do Facebook Marketplace, com o selo, o ciclo de leitura e a escolha salva compartilhados em `src/selo-comum.js`. | Cada leitor conhece só o seu site; o que é comum fica em um só lugar. |

## Publicação

| Data | Decisão | Motivo |
|---|---|---|
| 2026-11-04 | Licença MIT em nome da Code It Labs, com repositório público e gratuito. | Distribuição aberta e gratuita. |
| 2026-11-04 | O id do Firefox é `extensao-fipe@codeitlabs.com.br` (`browser_specific_settings.gecko.id`) e não deve mudar depois de publicado em loja. | É só um identificador, não um e-mail real. |
| 2026-11-04 | O release roda em três jobs (testar, empacotar, publicar), com conferência de que o commit baixado é o da tag e `--verify-tag` na criação da Release. | O código das dependências de teste não pode alterar o pacote publicado, e uma tag movida não gera Release. |
| não registrada | Os PRs entram na `main` por squash. | Um commit por PR na `main`, com "(#N)" no título. |
