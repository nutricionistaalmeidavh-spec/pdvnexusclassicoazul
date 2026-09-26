# Baseline — Fases 4–7 — PDV Nexus Clássico Azul

- Base segura (Fases 0–3): `main` em `53af2183406c46debca3fd221118b6b73474a578`.
- Branch de implementação: `work/fases-4-7-classico-azul`.
- Commit submetido aos gates finais: `fd1730b784a13c9c2d6a01b52fda5f73b74f4fe6`.
- Gate final: GitHub Actions run `36249940612`.
- Fonte original `nutricionistaalmeidavh-spec/PDVNexus`: nenhuma escrita realizada.

## Fase 4 — UI Clássico Azul

Implementado nas linhas Windows 10+ e Windows 7/8:

- chrome de janela clássico azul;
- barra de menus `Cadastros`, `Movimentações`, `Relatórios`, `Utilitários`, `Ajuda`;
- faixa `VENDA (PDV)`;
- seleção de cliente e entrada por código/barras/nome;
- grade operacional com `Código`, `Descrição do Produto`, `Qtde.`, `Unitário`, `Total`;
- painel do último produto;
- painéis `TOTAL`, `RECEBIDO` e `TROCO`;
- barra de teclas de função;
- barra de status;
- controles explícitos `− / +` para quantidade de itens unitários.

O contrato da UI foi criado antes da implementação e confirmado RED nas duas linhas; depois passou GREEN.

## Fase 5 — Integração funcional

A UI usa os handlers existentes do PDV para:

- nova venda;
- busca/inclusão de produto;
- cliente;
- quantidade e remoção de item;
- desconto;
- formas de pagamento;
- finalização;
- financeiro/caixa.

Atalhos existentes `F2`, `F3`, `F6`, `F8` e `Delete` foram preservados. `F12` foi adicionado como alias de finalização.

Durante a regressão inicial foi detectado que a primeira versão visual havia ocultado os controles explícitos de aumentar/diminuir quantidade exigidos pelo contrato existente. O problema foi corrigido reutilizando `adjustSaleItemQuantity`, sem alterar a regra de negócio.

## Fase 6 — Regressão Windows 10+

Gate `windows10-regression-and-qa`: PASS.

- domínio/banco/runtime comparados com a `main` de Fase 3: sem alterações nos diretórios protegidos;
- `npm ci`: PASS;
- `npm run typecheck`: PASS;
- `npm run test:pdv-payments`: PASS — 83/83 testes;
- `npm run test:pdv-upgrade`: PASS — 9/9 testes;
- identidade + contrato Classic Blue: PASS — 10/10 testes;
- renderer Vite: PASS;
- instalador Windows 10 x64: PASS;
- ArtiSys QA iniciado pelo `bootstrap.cjs`: PASS;
- fluxo gráfico `ui-review-classic-blue`: PASS;
- screenshot e `run-summary.json`: produzidos;
- artifact de QA: `Classic-Blue-Phase6-QA-v2`, ID `10908049315`.

### Instalador Windows 10

- arquivo: `PDV-Nexus-Classico-Azul-Setup-0.1.19.exe`;
- SHA-256: `04EEE2AB2AC07C38B07FDFD1AE76A6D98F393C689C7DDAA2F25F58E4BC5B3C22`.

## Fase 7 — Port e regressão legada

Gate `legacy-phase7`: PASS.

- `npm ci`: PASS;
- typecheck: PASS;
- pagamentos/estoque: PASS — 79/79 testes;
- upgrade/release contract: PASS — 6/6 testes;
- identidade, builders legados e contrato Classic Blue: PASS — 12/12 testes;
- renderer: PASS;
- instalador Windows 7 x64: PASS;
- instalador Windows 8 x86/32-bit: PASS.

### Instaladores legados

- Windows 7 x64: `PDV-Nexus-Classico-Azul-Windows-7-Setup-0.1.19.exe`
  - SHA-256: `5D8676892316D36CF34AC4D3000204A6D8B80A7B3156BDF8E462EFDE22BBAB99`.
- Windows 8 x86: `PDV-Nexus-Classico-Azul-Windows-8-32bit-Setup-0.1.19.exe`
  - SHA-256: `A48BFB170C42BB83AB0E732F2CEE61BA6718E7680FEF7BC3B4E5B9867B0D94DB`.

## Isolamento e publicação

- `appId`: `com.artisys.pdvnexus.classicoazul`;
- `productName`: `PDV Nexus Clássico Azul`;
- updater original permanece desativado;
- `pdv-release.json.manifestUrl`: `null`;
- `pdv-release.json.distribution`: `{}`;
- workflow de publicação continua hard-disabled até a Fase 8;
- nenhuma GitHub Release foi publicada;
- nenhum arquivo foi enviado ao Google Drive durante as Fases 4–7.

## Observação de dependências

`npm ci` continua reportando 6 vulnerabilidades de severidade alta nas dependências já herdadas pela linha do projeto. Elas não foram introduzidas pela mudança de UI e não impediram os gates funcionais/build, mas devem ser tratadas em uma rodada separada de atualização de dependências para não misturar risco de upgrade com a mudança visual.
