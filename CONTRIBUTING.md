# Contribuindo

Obrigado por querer ajudar. Este é um projeto pequeno, mantido pela Code It Labs, então o melhor é conversar antes de mudanças grandes: abra uma [issue](https://github.com/Code-It-Labs/extensao-fipe/issues/new/choose) descrevendo o que você quer fazer.

## Como reportar um carro errado

É a contribuição mais útil. Abra uma issue com o formulário **"Carro errado"** e traga:

- o link do anúncio (ou o título e o ano, se o anúncio saiu do ar);
- o texto que o selo mostrou (versão, valor, faixa);
- se possível, o valor da versão certa no [site oficial da FIPE](https://veiculos.fipe.org.br/).

Com isso dá para adicionar o título ao conjunto de teste do casamento (`tests/fixtures/corpus-anuncios.json`) e corrigir a regra sem quebrar os outros carros.

## Como rodar

Precisa do Node 24.15 ou mais novo (só para os testes e o empacotamento; a extensão não usa Node).

```bash
npm install
npm test                                         # offline, usa os arquivos de exemplo
FIPE_REAL=1 node --test tests/api-real.test.js   # opcional: API real (~25 consultas; gasta a cota diária, use com moderação)
node tools/empacotar.js                          # gera os zips em dist/
```

Use `node --test` (ou `node --test tests/*.test.js`). `node --test tests/` não funciona no Node 24.

Para ver a extensão rodando: `chrome://extensions` > Modo do desenvolvedor > Carregar sem compactação > pasta do repositório. Depois de editar, recarregue a extensão **e** aperte F5 na página do anúncio. O roteiro de teste manual está em [docs/ROTEIRO-TESTE.md](docs/ROTEIRO-TESTE.md).

## Estilo do código

- **JavaScript puro, sem build e sem bibliotecas** na extensão. Nada de dependência nova no projeto sem conversar antes na issue (o `jsdom` é só dos testes).
- Arquivos clássicos, sem `import`/`export`: os arquivos expõem um global (`FipeParser`, `FipeApi`...) e, quando precisam rodar nos testes, `module.exports` guardado por `typeof module`.
- HTML, CSS e JS em arquivos separados. Nada de CSS ou JS dentro do HTML.
- **Comentários em português do Brasil**: todo arquivo começa com um comentário dizendo o que ele é e qual o papel dele no projeto, e cada bloco de código tem um comentário curto sobre a função dele.
- Código mínimo: prefira o que o projeto já tem, depois a biblioteca padrão do JavaScript.
- Privacidade em primeiro lugar: nada do anúncio, do anunciante ou da página pode sair do navegador (a FIPE só recebe códigos de marca, modelo e ano). O texto vindo da página nunca entra como HTML (use `textContent`).
- O HTML dos sites (principalmente o do Facebook) é ofuscado: leia só por tags (`h1`, `h2`) e texto, nunca por classe CSS.

## Testes são obrigatórios

- Código novo ou alterado vem com teste que o cobre (`tests/*.test.js`, com `node:test`).
- Correção de bug vem com um teste que **falharia** sem a correção.
- Os testes rodam offline, com arquivos de exemplo em `tests/fixtures/`. Mudança só visual não precisa de teste.
- `npm test` precisa passar. O CI do GitHub roda o mesmo comando em cada push e pull request.

## Como propor um novo site

Um site novo é um leitor de página mais um bloco no manifest (veja "Como adicionar um site novo" no [README](README.md#como-adicionar-um-site-novo)). Antes de escrever código, abra uma issue com **"Sugestão"** dizendo o site e dois ou três links de anúncios de carro. O site precisa:

- permitir a leitura do anúncio por um navegador comum (não vamos contornar verificações de "sou humano" nem bloqueios);
- ter o ano, a marca e o modelo do carro no próprio anúncio.

O pull request deve incluir o leitor (`src/content-<site>.js`), o bloco no `manifest.json`, o teste do leitor, a atualização do `tests/manifest.test.js`, do `PRIVACY.md` (permissões) e do README (sites suportados e o que foi testado).

## Pull requests

1. Faça um fork e crie uma branch a partir da `main`.
2. Mantenha o pull request pequeno e com um só assunto.
3. Rode `npm test` antes de abrir.
4. Preencha o modelo do pull request.

Ao contribuir, você concorda que sua contribuição fica sob a [licença MIT](LICENSE) do projeto.
