# Backlog público: limitações conhecidas e ideias

Lista do que a extensão ainda não faz, do que não foi confirmado e de ideias. Não é uma promessa de entrega. Quer ajudar com algum item ou achou outro? Veja o [CONTRIBUTING.md](../CONTRIBUTING.md) e abra uma issue.

## Sites

| Item | Detalhe |
|---|---|
| Webmotors | Ainda não suportada. O site pede verificação de "pessoa, não robô" para ler as páginas, e o projeto não contorna esse tipo de bloqueio. Para criar o leitor, é preciso ter páginas de anúncio de carro salvas (Página da Web, completa) ou outra forma legítima de ler o texto. |
| iCarros | Ainda não suportado: os classificados estavam desativados quando foram verificados (novembro/2026). |
| `web.facebook.com` e `m.facebook.com` | Cobertos pelo `matches` do manifest (`*.facebook.com`), mas não testados. |
| Content script só entra ao carregar a página | Se você chega ao Marketplace clicando num link de outra página do Facebook (navegação sem recarregar), o selo só aparece depois do F5. Ideia: `matches` em `facebook.com/*` com checagem do caminho. |

## Navegadores e plataformas

| Item | Detalhe |
|---|---|
| Edge, Brave e Windows | Não testados. Testados: Firefox 159 (complemento temporário) e Chrome for Testing 157 (zip do Chrome descompactado), com anúncios reais do Facebook e da OLX. |
| OLX no Chrome | Vista em um só anúncio (Corolla 2022). Convém reconfirmar com mais anúncios. |
| `host_permissions` sem o Facebook | Funcionou no Firefox 159 e no Chrome 157. Se em algum navegador o selo não aparecer, recolocar `https://www.facebook.com/marketplace/*` em `host_permissions` e em `tests/manifest.test.js`. |
| Aviso do `about:debugging` por ter `service_worker` junto de `background.scripts` | Não se sabe se o Firefox mostra aviso (o teste automatizado não exibe avisos). O pacote do Firefox já sai sem `service_worker`; só o manifest da raiz (carregado direto da pasta) tem as duas chaves. |
| Id da extensão no Firefox | `extensao-fipe@codeitlabs.com.br`. Para carga temporária funciona; para uma instalação permanente o Firefox exige extensão assinada pela Mozilla, e o id não deve mudar depois de publicado em loja. |
| Publicação em loja | Chrome Web Store e Firefox Add-ons eliminariam o aviso do modo desenvolvedor e a instalação manual. Ainda não feita. |

## Casamento com a FIPE

| Item | Detalhe |
|---|---|
| Range Rover Velar | Casa com "Range Rover HSE" (a FIPE abrevia como "Range R.VELAR"). É o único erro de família no conjunto de 263 títulos de teste. |
| Título sem a marca | "Range Rover Evoque" ou "Hilux SRV" (sem "Land Rover"/"Toyota") dá "sem marca". |
| Versão em ordem diferente da FIPE | O resultado depende da pontuação; anúncio ambíguo sem nenhuma pista (por exemplo, Voyage) não destaca a versão mais comum. |
| Conjunto de teste otimista | Os 263 títulos (`tests/fixtures/corpus-anuncios.json`) são escritos à mão, não são anúncios reais. Ideia: acrescentar títulos reais que o selo errar (via issue "Carro errado") e regerar `tests/fixtures/fipe-modelos.json` a cada alguns meses (`tests/gerar-fixture-modelos.js`, cerca de 34 chamadas). |
| Elétrico e híbrido | O código de ano da FIPE (dígito depois do hífen, por exemplo `2015-5`) só foi conferido para gasolina (1), álcool (2), diesel (3) e flex (5). Os demais combustíveis não foram conferidos. |
| Moto, caminhão e outros veículos | A ficha "Sobre esse veículo" existe para todos; uma moto (por exemplo, "Honda CG") mostra "Não encontrei na FIPE". Ideia: filtrar por tipo de veículo. |

## Consultas, cota e cache

| Item | Detalhe |
|---|---|
| Cota do serviço de terceiros | O serviço (`fipe.parallelum.com.br`) limita as consultas; não foi confirmado quanto. A primeira consulta de um modelo novo custa cerca de 45 chamadas. |
| Erro de rede ou 429 | Fica até recarregar a página (F5). Ideia: botão "tentar de novo". |
| Faixa de valores | Usa só até 5 versões, para poupar a cota. |
| Cache | Não apaga as entradas vencidas (só as substitui) e, se a gravação falhar, a resposta daquela consulta se perde. Ideia: conferir `?reference=<código>` para travar o mês de referência. |
| Escolha salva | Lê todo o `storage.local` a cada gravação (serve para o limite de 200; trocar por um índice próprio se o cache crescer). Não expira por idade e só vale em anúncio ambíguo. Escolhas antigas sem o prefixo do site ficam órfãs e contam no limite até saírem. |

## Leitura da página

| Item | Detalhe |
|---|---|
| Selo fixo no canto inferior direito | Inserir perto do preço seria frágil com o HTML ofuscado do Facebook. |
| Releitura a cada 1 s | O ciclo relê a página uma vez por segundo (e o leitor da OLX relê o DOM em anúncio de carro). Ideia: trocar por `MutationObserver`. |
| Título velho ao navegar entre anúncios sem F5 | A guarda `startsWith(h1)` é fraca para h1 curto (por exemplo, "2015 Volkswagen"). Ideia: só confiar nas tags (`og:title`, título da aba) se `og:url` contiver o id da URL. |
| Selo piscando | Com o anúncio parado por 30 s, e "Ver mais" na descrição limpa o selo e zera a lista de versões (a chave de estabilidade inclui a ficha e a descrição). |
| Ruído na descrição | Textos como "A localização é aproximada" e "Ver mais" entram na descrição lida; `og:description` quase nunca é usado. |
| OLX: JSON-LD velho | Se a OLX não trocar o `<script>` JSON-LD ao navegar, dois anúncios seguidos com o mesmo título (por exemplo, dois "Fiat Uno Way 2015") usariam o JSON-LD do anterior, que não traz o id. Com h1 no Chrome, se o texto do h1 diferir do `name` do JSON-LD, o preço cai no texto da página; o bloco "Detalhes" depende da quebra de linha do `innerText`. Falha suave (preço do texto, título do h1 ou da aba). |
| Preço lido de anúncios parecidos | `textoDoPreco` pode pegar o "R$" de anúncios parecidos se a página não tiver o preço antes do ancestral comum nem JSON-LD. No Facebook em pt-BR (Firefox 159) o preço do próprio anúncio aparece já no 2º ancestral do título e a seção de parecidos só entra no 10º; como a busca sobe no máximo 8 níveis, o risco é baixo. Repetir a medição se o Facebook mudar o layout. |
| O Facebook muda o site | A extensão lê o texto da página, nunca classes CSS; mesmo assim um dia o leitor pode precisar de ajuste. |

## Testes

| Item | Detalhe |
|---|---|
| Limites do `jsdom` | Os testes dos leitores usam `jsdom`, que não tem layout. Ficam sem teste automatizado: o ramo `getClientRects` do `visivel`; `h2` escondido ignorado; escolha do `h2` mais próximo com vários anúncios no DOM; `og:description` como descrição; ano 19xx (as fixtures só têm 20xx); critério `km` da ficha; título mais curto em vez de mais longo. As páginas de teste são sintéticas (o HTML real é ofuscado): só o [roteiro manual](ROTEIRO-TESTE.md) confirma o Facebook e a OLX de verdade. |
| Textos em pt-BR do leitor | Parte deles é palpite e não foi confirmada em anúncios reais. Foram confirmados a seção "Sobre esse veículo", os separadores do título da aba e o prefixo "Vendido ·". |
| Ícone | O atual é geométrico (3 tamanhos); um ícone refinado é bem-vindo. |
