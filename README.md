# NEXUS

Script Tampermonkey para Sploop.io.

## Instalação (somente uma vez)

1. Instale o Tampermonkey no navegador.
2. Abra [NEXUS.user.js](https://raw.githubusercontent.com/kurofunways-cpu/NEXUS/main/NEXUS.user.js) e confirme a instalação.
3. Nas configurações do Tampermonkey, ative a verificação de atualizações e, se disponível, a instalação automática.
4. Desative cópias antigas ou duplicadas da NEXUS e recarregue o jogo.

## Atualizações

O Tampermonkey verifica [NEXUS.meta.js](https://raw.githubusercontent.com/kurofunways-cpu/NEXUS/main/NEXUS.meta.js) e baixa [NEXUS.user.js](https://raw.githubusercontent.com/kurofunways-cpu/NEXUS/main/NEXUS.user.js) quando o campo `@version` aumenta.

Cada nova versão deve ser **publicada neste repositório** (não basta gerar um arquivo no ChatGPT). Atualizações dependem do intervalo de verificação do Tampermonkey e normalmente entram em funcionamento após recarregar a página.

## Observação

A versão executável é JavaScript (`.user.js`). Arquivos `.lua` fornecidos como cópias contêm o mesmo código JavaScript e não executam em interpretadores Lua.
