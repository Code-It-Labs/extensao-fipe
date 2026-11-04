# Roteiro de teste manual

Roteiro para quem quer conferir a extensão no próprio navegador (colaboradores, ou quem testa uma mudança antes de abrir um pull request). Cada passo diz o que esperar. **Anote o que for diferente** (texto da mensagem, versão do navegador, captura de tela cortada só no selo, sem nomes, fotos nem dados de pessoas) e **abra uma issue** ([Defeito](https://github.com/Code-It-Labs/extensao-fipe/issues/new/choose) ou "Carro errado"). Itens em aberto e limitações conhecidas: [BACKLOG.md](BACKLOG.md).

Já testado em navegador real, por quem mantém o projeto: Firefox 159 (complemento temporário) e Chrome for Testing 157 (zip do Chrome descompactado), com anúncios reais do Facebook e da OLX; no Chrome 157, o selo, a versão salva depois do F5, o popup e o service worker funcionaram. **Ainda não verificado em navegador real:** os passos 4, 5 e 6 (navegar entre anúncios sem F5, selo parado por 30 s, "Ver mais"), Edge, Brave e Windows.

Anúncios de teste: use qualquer anúncio de carro do Facebook Marketplace e da OLX que esteja no ar. O ideal é ter um com a versão clara no título (para o selo "Provável") e um sem a versão (para a faixa e o seletor). Os valores mudam a cada mês.

## A. Firefox (127 ou mais novo; testado no 159)
1. Abrir `about:debugging#/runtime/this-firefox` > **Carregar extensão temporária** > escolher o `manifest.json` da pasta do repositório (ou do zip do Firefox descompactado). **Anotar qualquer aviso ou erro que o Firefox mostrar** (em especial algo sobre `service_worker`; veja o [BACKLOG.md](BACKLOG.md)).
2. Abrir um anúncio com a versão clara e dar F5. Esperado, em até cerca de 20 s, um selo no canto inferior direito com "FIPE <mês>: R$ ...", "Provável: <modelo>" e "Pedido R$ ...: ... abaixo/acima da FIPE".
3. Abrir um anúncio sem a versão no texto e dar F5. Esperado: faixa de valores e um seletor "Escolha a versão". Escolher uma versão: o selo mostra um valor único. O título da página pode vir com "Vendido".
4. Sem dar F5, ir de um anúncio para outro clicando (ou pelo voltar do navegador). Esperado: o selo muda e mostra o carro do anúncio novo, nunca o do anterior.
5. Deixar um anúncio aberto parado por 30 s. Esperado: o selo não pisca nem some.
6. Clicar em "Ver mais" na descrição. Esperado: o selo pode sumir e voltar (comportamento conhecido); anotar se ficar sumido.
7. Abrir um anúncio que não é carro (um sofá, por exemplo). Esperado: nenhum selo.
8. Chegar ao Marketplace clicando a partir do feed do Facebook e abrir um carro, sem F5. Esperado: pode não aparecer selo (limitação conhecida); dar F5 e ver se aparece.
9. `about:addons` > a extensão > **Permissões**: anotar se facebook.com, olx.com.br e fipe.parallelum.com.br aparecem.
10. **OLX:** abrir um anúncio de carro (F5). Esperado: selo no canto inferior direito. Ir para outro anúncio sem F5: o selo mostra o carro do anúncio novo. Abrir uma listagem de carros da OLX: nenhum selo.
11. **Versão salva:** num anúncio ambíguo, escolher uma versão no seletor, dar F5. Esperado: a versão escolhida volta aplicada ("Versão escolhida (salva)").

## B. Chrome (testado no Chrome for Testing 157; Edge e Brave não testados)
1. `chrome://extensions` > Modo do desenvolvedor > Carregar sem compactação > pasta do repositório (ou do zip do Chrome descompactado). Anotar avisos.
2. Repetir os passos 2 a 8, 10 e 11 acima. Se o selo não aparecer em nenhum anúncio, o suspeito é a permissão do Facebook (veja `host_permissions` no [BACKLOG.md](BACKLOG.md)).
3. Clicar no ícone da extensão: deve abrir o popup de ajuda com a versão.

## Como reportar
Uma linha por passo: "ok" ou o que aconteceu de diferente, com o navegador e a versão. Se o selo mostrar o carro errado, mande o link do anúncio e o texto do selo.
