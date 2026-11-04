<!-- Guia de quem empacota e publica a extensão: como gerar os zips, como lançar uma versão no GitHub e o que ainda não foi testado. Não vai dentro dos zips. -->
# Empacotar e publicar uma versão

## Gerar os pacotes

Node 24.15 ou mais novo, sem dependências:

```bash
node tools/empacotar.js
```

Cria em `dist/` (fora do Git):

- `extensao-fipe-chrome-<versão>.zip`: para Chrome, Edge e Brave (Edge e Brave não foram testados). O manifest do pacote não leva a chave `browser_specific_settings` nem `background.scripts`.
- `extensao-fipe-firefox-<versão>.zip`: para o Firefox. **Não é assinado**: só serve como complemento temporário em `about:debugging`. Instalação permanente no Firefox exigiria assinatura da Mozilla.

Nenhum `.md` entra nos zips: o gerador só leva o que o manifest e o popup usam, mais o arquivo `LICENSE` (a licença MIT pede que o aviso de copyright acompanhe as cópias). O guia de instalação para quem baixa é o [INSTALAR.md](../INSTALAR.md).

A versão vem do `manifest.json`.

O id da extensão no Firefox (`browser_specific_settings.gecko.id`, hoje `extensao-fipe@codeitlabs.com.br`) não deve mudar depois que a extensão for publicada numa loja: o id identifica a extensão e os dados dela.

## Lançar uma versão no GitHub

1. Mude `version` em `manifest.json` **e** em `package.json` (o teste em `tests/manifest.test.js` confere que são iguais) e rode `npm install --package-lock-only` para o `package-lock.json` acompanhar.
2. Rode `npm test`.
3. Atualize o `CHANGELOG.md`, faça o commit na `main` e envie ao GitHub (a tag só é aceita se o commit dela já estiver na `main`).
4. Crie e envie a tag com o `v` na frente da versão, por exemplo:

   ```bash
   git tag v0.2.1
   git push origin v0.2.1
   ```

5. O workflow `.github/workflows/release.yml` tem dois jobs. O `empacotar` (sem permissão de escrita) confere que a tag bate com a versão do manifest e que o commit dela está na `main`, roda os testes, gera os dois zips e o `SHA256SUMS`. O `publicar` (o único com permissão de escrita, sem baixar o código nem rodar npm) confere o `SHA256SUMS` e cria a Release com notas automáticas e esses arquivos anexados. Confira o resultado na aba **Actions** e em **Releases**.

Se o workflow falhar depois de criar a tag, apague a tag (`git push --delete origin <tag>` e `git tag -d <tag>`), corrija e crie de novo.

## O que foi testado e o que não foi

- Testes automáticos: conferem o manifest e o conteúdo dos zips (`tests/empacotar.test.js`). Os workflows do GitHub não puderam ser executados antes da publicação; só foram conferidos como YAML.
- Firefox 159: extensão carregada como temporária, com anúncios reais do Facebook e da OLX.
- Chrome for Testing 157: zip do Chrome descompactado e carregado, com anúncios reais do Facebook e da OLX (selo, versão salva depois do F5, popup e service worker).
- **Não testados:** Edge, Brave, Windows, Safari, o Chrome comum (fora o Chrome for Testing) e a OLX em mais de um anúncio no Chrome.

O zip é gerado por código próprio (sem o comando `zip`) e foi validado com `unzip -t` no Mac; não foi aberto no Windows. Se o Windows reclamar do arquivo, o plano B é trocar a geração pelo `zip` do sistema.

O texto do aviso de "modo desenvolvedor" que o Chrome mostra ao abrir não foi visto de perto; o `INSTALAR.md` o descreve em termos gerais.
