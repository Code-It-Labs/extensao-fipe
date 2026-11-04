// Script do popup de ajuda: escreve a versão da extensão (lida do manifest) na linha de versão.
// "chrome" existe no Chrome, Edge, Brave e também no Firefox; sem arquivo extra para o Firefox.
document.getElementById('versao').textContent = chrome.runtime.getManifest().version;
