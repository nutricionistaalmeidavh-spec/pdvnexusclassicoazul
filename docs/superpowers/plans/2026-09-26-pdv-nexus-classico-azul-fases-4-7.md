# PDV Nexus Clássico Azul — Plano de Implementação Fases 4–7

## Base segura

- Base: `main` após Fases 0–3.
- Branch: `work/fases-4-7-classico-azul`.
- O repositório `PDVNexus` original permanece somente leitura e fora de qualquer destino de escrita.
- Updater, GitHub Release e Google Drive permanecem desativados; a publicação só volta na Fase 8.

## Fase 4 — UI Clássico Azul

Objetivo: substituir apenas a apresentação do caixa por uma interface operacional inspirada no PDV clássico azul de referência, mantendo o núcleo de negócio existente.

Implementar:

1. barra de menus no estilo Windows clássico (`Cadastros`, `Movimentações`, `Relatórios`, `Utilitários`, `Ajuda`);
2. faixa azul `VENDA (PDV)`;
3. cabeçalho compacto com cliente, código/busca, venda, operador e caixa;
4. grade principal de itens com colunas `Código`, `Descrição do Produto`, `Qtde.`, `Unitário`, `Total`;
5. painel direito com último produto, total, recebido e troco;
6. barra de teclas de função com atalhos coerentes com as funções já existentes;
7. barra de status inferior;
8. CSS próprio `pdv-classic-blue.css`, sem remover os estilos das demais telas.

Gate: teste estrutural da UI deve falhar antes da implementação (RED) e passar depois (GREEN), seguido de typecheck e build.

## Fase 5 — Integração funcional

A nova apresentação deve chamar somente fluxos já existentes:

- nova venda;
- foco na busca de produto;
- seleção de cliente;
- inclusão e remoção de item;
- desconto;
- pagamentos e recebimentos;
- finalização;
- caixa/financeiro;
- balança.

Preservar os atalhos legados `F2`, `F3`, `F6`, `F8` e `Delete`; adicionar `F12` apenas como alias de finalização, sem remover o comportamento anterior.

Não alterar regras de SQLite, estoque, cálculo de total/troco, persistência, backup, impressão ou regras financeiras.

## Fase 6 — Regressão e QA

Executar no Windows 10+:

- `npm ci`;
- `npm run typecheck`;
- `npm run test:pdv-payments`;
- `npm run test:pdv-upgrade`;
- testes de isolamento do produto;
- teste estrutural da UI clássica;
- `npm run build:pdv-demo`;
- ArtiSys QA gráfico pelo `bootstrap.cjs`;
- fluxo `ui-review` com screenshot;
- comparação dos arquivos de domínio/banco com a `main` de Fase 3 para garantir ausência de alteração de regras de negócio.

## Fase 7 — Port Windows 7

Portar a mesma apresentação para a linha `windows-7`, mantendo Electron 22 e a persistência compatível dessa edição.

Gates:

- teste estrutural da UI clássica;
- typecheck;
- pagamentos;
- upgrade/isolamento;
- build do renderer;
- build real do instalador Windows 7 x64;
- build real do instalador Windows 8 x86;
- nomes de artefato e canais de update continuam isolados.

## Critério de conclusão

Fases 4–7 só são consideradas concluídas se todos os gates ficarem verdes e a publicação continuar desativada. Nenhum merge em `main` é feito automaticamente; a integração final continua sendo uma decisão explícita do usuário.