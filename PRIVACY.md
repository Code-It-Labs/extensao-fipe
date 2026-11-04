# Política de privacidade

Extensão **FIPE no Marketplace e OLX**. Última atualização: versão 0.2.0 (2026).

Em uma frase: a extensão só envia a um serviço público de consulta à FIPE **códigos** de marca, modelo e ano (do carro e, quando a versão não é clara, de modelos parecidos da mesma família). Nada do anúncio, do anunciante ou da página sai do seu navegador.

## O que a extensão lê na página

Só nas páginas de **anúncio de carro** do Facebook Marketplace (`/marketplace/item/...`) e da OLX (`/autos-e-pecas/carros-vans-e-utilitarios/...`). Nas outras páginas desses sites ela não lê nada (em outras páginas da OLX o script é carregado, mas não faz nada por não ser anúncio de carro).

Nesses anúncios ela lê o que está escrito no próprio anúncio: título, preço pedido, ficha do veículo (ano, marca, modelo, combustível, câmbio) e descrição do vendedor. Ela **não usa, não guarda e não envia** dados do anunciante e não lê mensagens, conta, cookies nem outras abas. Para achar o anúncio, o leitor percorre no navegador o texto do bloco do anúncio; na OLX, o JSON-LD da página (que traz também o nome do anunciante) é lido só para pegar o nome do carro, o preço e a descrição.

Esse texto é processado **dentro do navegador**, para descobrir a marca, o modelo, o ano e as pistas da versão. Ele não é enviado a ninguém.

## O que é enviado e para onde

A extensão faz consultas a um único endereço: `https://fipe.parallelum.com.br`, um serviço público e **não oficial** que repete os dados da Tabela FIPE. As consultas levam apenas:

- a lista de marcas, a de modelos de uma marca e a de anos de um modelo;
- os **códigos** de marca, modelo e ano do carro, para pedir o valor;
- a lista de meses de referência.

Quando o anúncio não deixa clara a versão, a consulta inclui também **códigos de modelos parecidos da mesma família** (até cerca de 20 por rodada, em até 2 rodadas) e o preço de até 5 versões. Por isso o serviço de terceiros pode **inferir a família do carro que você está olhando e o ritmo das suas consultas** (quantas, e quando).

Não vão a esse serviço o título, a descrição, o preço pedido, o link, o id do anúncio, nomes de pessoas nem qualquer outro texto da página. Como acontece com qualquer site que você acessa, o serviço recebe o seu **endereço de IP** e os dados técnicos comuns de uma requisição (como o navegador). A política dele é dele: a extensão não controla o que o serviço guarda. Não há nenhum outro servidor, inclusive nenhum do autor da extensão.

## O que fica guardado no navegador

Tudo em `storage.local` da própria extensão, no seu computador:

| Dado | Para quê | Por quanto tempo |
|---|---|---|
| Respostas da FIPE: marcas, modelos, anos e preços | Não repetir consultas e poupar a cota diária do serviço | Listas e preços valem 30 dias (o preço é guardado junto do mês de referência); a lista de meses vale 1 dia. A extensão não apaga sozinha as entradas vencidas: elas ficam até serem substituídas ou até você remover a extensão. |
| Versão que você escolheu num anúncio | Mostrar de novo a mesma versão quando você reabrir o anúncio | Até 200 escolhas no total; ao passar disso, as mais antigas são apagadas. Cada uma guarda o site (`fb` ou `olx`), o id do anúncio (que já está no endereço da página), os códigos de marca, modelo e ano, o nome da versão e a data. |

Esses dados nunca são enviados para fora do navegador (o id do anúncio e a escolha ficam só aqui).

## O que a extensão não tem

Não há conta, cadastro, login, análise de uso (analytics), rastreamento, publicidade, venda ou compartilhamento de dados.

## Permissões (manifest.json) e por quê

- **`storage`**: guardar o cache e as versões escolhidas, descritos acima.
- **Acesso a `https://fipe.parallelum.com.br/*`**: fazer as consultas à FIPE (o código de fundo da extensão faz isso; a página do site não pode, por causa do CORS).
- **Execução nas páginas `https://*.facebook.com/marketplace/*` e `https://*.olx.com.br/*`**: ler o anúncio e desenhar o selo no canto da página. O navegador pode descrever isso como "ler e alterar seus dados" nesses sites. A extensão usa o acesso só para o que foi dito acima.

Não há outras permissões (nada de abas, histórico, cookies, downloads ou todos os sites).

## Como apagar os dados

Remova a extensão: em `chrome://extensions` (ou `edge://extensions`, `brave://extensions`) clique em **Remover**; no Firefox, em `about:addons`, **Remover**. Os dados dela no navegador são apagados com ela.

## Mudanças

Se esta política mudar, o arquivo é atualizado neste repositório e a mudança fica no histórico do Git.

## Contato

Dúvidas sobre privacidade: abra uma [issue](https://github.com/Code-It-Labs/extensao-fipe/issues). Falha de segurança: veja [SECURITY.md](SECURITY.md).
