# Como instalar a extensão "FIPE no Marketplace e OLX" (Chrome)

A extensão mostra, nos anúncios de carro do Facebook Marketplace e da OLX, o valor da Tabela FIPE e a diferença para o preço pedido. Ela ainda não está nas lojas de extensões: você instala a partir de uma pasta, em poucos passos. Leva uns 3 minutos. Os passos abaixo são para o Google Chrome. O Edge e o Brave devem funcionar do mesmo jeito, mas não foram testados; os nomes dos botões podem variar, e o endereço começa com `edge://` ou `brave://` no lugar de `chrome://`.

## Instalar

1. **Baixe** o arquivo do Chrome na [página de Releases](https://github.com/Code-It-Labs/extensao-fipe/releases/latest) do projeto, na seção **Assets**. O nome é parecido com `extensao-fipe-chrome-0.2.0.zip` (o número muda a cada versão). **Não baixe "Source code"**: esse é o código-fonte, não a extensão pronta. Opcional: o `SHA256SUMS`, na mesma seção, serve para conferir se o download veio intacto.
2. **Descompacte** o arquivo em uma pasta que você **não vai apagar** (por exemplo, `Documentos\extensao-fipe`). O navegador lê a extensão direto dessa pasta: se ela for apagada ou movida, a extensão para de funcionar.
3. Abra o Chrome e digite na barra de endereço: `chrome://extensions`
4. Ligue o **"Modo do desenvolvedor"** (o interruptor fica na página de extensões; o lugar e o nome podem variar entre navegadores e versões).
5. Clique em **"Carregar sem compactação"** e escolha a pasta que você descompactou (a que tem o arquivo `manifest.json` dentro).
6. A extensão **"FIPE no Marketplace e OLX"** aparece na lista. Confira se está ligada.
7. **Fixe o ícone** para ele ficar visível: clique no ícone de peça de quebra-cabeça (extensões) ao lado da barra de endereço e clique no alfinete ao lado de "FIPE no Marketplace e OLX". Clicar no ícone abre uma explicação curta de como usar.

## Usar

1. Abra um anúncio de **carro** no Facebook Marketplace ou na OLX.
2. **Aperte F5** para recarregar a página (a extensão só entra quando a página carrega).
3. O selo aparece no **canto inferior direito** (nos dois sites), com o valor da FIPE e a diferença para o preço pedido.

Observação: foi testado no Chrome for Testing 157 e no Firefox 159, com anúncios reais do Facebook e da OLX. Edge, Brave e Windows não foram testados; a OLX no Chrome foi vista em um só anúncio.

Lembrete: a FIPE é só uma referência. Preço abaixo da FIPE não garante bom negócio.

## Aviso sobre extensões do modo desenvolvedor

Ao abrir o Chrome, ele pode mostrar um aviso sobre extensões do modo desenvolvedor. É normal para extensões carregadas de uma pasta, como esta; o texto e as opções do aviso podem variar. Feche o aviso ou escolha a opção que mantém a extensão ativada (não a que a desativa). Se a extensão for desativada sem querer, vá a `chrome://extensions` e ligue o interruptor dela de novo.

## Atualizar para uma versão nova

1. Descompacte o novo `.zip` **na mesma pasta de antes**, substituindo os arquivos (ou apague a pasta antiga e crie outra com o mesmo nome e local).
2. Vá em `chrome://extensions` e clique no botão de **recarregar** (seta circular) no cartão da extensão.
3. Abra um anúncio (Marketplace ou OLX) e aperte **F5**.

Se você descompactar em outra pasta, remova a extensão antiga e instale de novo pelos passos acima.

## Remover

Em `chrome://extensions`, clique em **"Remover"** no cartão da extensão. Depois pode apagar a pasta.

## Se não funcionar

- **O selo não aparece:** aperte **F5** na página do anúncio. Se você chegou ao Marketplace clicando em um link de outra página do Facebook, também precisa do F5.
- **Confira se a extensão está ligada** em `chrome://extensions` (interruptor ligado) e se você abriu o anúncio *depois* de instalar.
- **Confira se o anúncio é de carro.** A extensão não funciona em moto, caminhão nem em outros produtos, e precisa que o anúncio traga ano, marca e modelo.
- **Aparece uma mensagem de erro no selo (por exemplo, falha de rede):** confira sua conexão e recarregue a página (**F5**). A consulta à FIPE precisa de internet, e o selo só tenta de novo quando a página é recarregada.
- **Mensagem de limite de consultas:** o serviço público de terceiros que a extensão usa limita as consultas (não foi confirmado quanto). Espere um tempo e recarregue a página; se continuar, tente mais tarde.
- **O selo mostra uma versão que você acha errada:** use a lista "Escolha a versão" do selo, ou confira o carro na própria Tabela FIPE.

