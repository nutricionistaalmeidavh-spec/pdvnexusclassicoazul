# PDV Nexus Clássico Azul — Bootstrap e Isolamento

## Objetivo

Criar o repositório `nutricionistaalmeidavh-spec/pdvnexusclassicoazul` como produto independente a partir de um snapshot do `nutricionistaalmeidavh-spec/PDVNexus`, preservando o repositório original sem alterações e preparando a base para uma nova UI clássica azul.

Este documento cobre somente as fases 0–3 aprovadas:

1. congelar a origem;
2. copiar o código com isolamento Git;
3. isolar identidade, dados locais e atualização;
4. comprovar um baseline funcional antes da alteração visual.

## Fonte congelada

- Repositório fonte: `nutricionistaalmeidavh-spec/PDVNexus`
- Branch fonte: `main`
- Commit fonte: `07d7bba2f184e298cb53fa1d3d1a24b37539e844`
- Repositório destino: `nutricionistaalmeidavh-spec/pdvnexusclassicoazul`
- Branch destino: `main`

O commit acima é a única referência permitida para a primeira cópia. Alterações posteriores no `PDVNexus` não entram automaticamente no Clássico Azul.

## Regra de segurança do repositório original

O `PDVNexus` é somente fonte de leitura. Nenhuma alteração, commit, branch, tag, release ou configuração será criada nele durante este trabalho.

A cópia deve resultar em um repositório Git independente. O destino não deve possuir remote de escrita apontando para `PDVNexus`.

Gate obrigatório após a cópia:

```text
origin -> https://github.com/nutricionistaalmeidavh-spec/pdvnexusclassicoazul.git
```

Nenhum outro remote de escrita é permitido.

## Escopo da cópia

A cópia inicial preserva a estrutura completa do snapshot, inclusive as duas edições publicáveis existentes:

- `windows-10/`: Electron 39.8.10 + SQLite nativo;
- `windows-7/`: linha legada, com runtime e persistência próprios;
- documentação, testes, QA, scripts e configuração necessários ao build;
- arquivos de release usados pelo produto, que serão isolados antes de qualquer release do Clássico Azul.

Artefatos gerados localmente, `node_modules`, instaladores e diretórios ignorados pelo Git não fazem parte da cópia versionada.

## Isolamento de identidade do produto

A edição `pdv-demo` do destino deve deixar de se identificar como o mesmo aplicativo instalado do PDV Nexus atual.

Valores do Clássico Azul:

- `appId`: `com.artisys.pdvnexus.classicoazul`
- `productName`: `PDV Nexus Clássico Azul`
- instalador Windows 10+: `PDV-Nexus-Classico-Azul-Setup-${version}.${ext}`
- atalho do Windows: `PDV Nexus Clássico Azul`
- pasta de dados do Electron: `PDV Nexus Classico Azul`

O objetivo é permitir que `PDV Nexus` e `PDV Nexus Clássico Azul` coexistam na mesma máquina sem colisão de instalação, atalho ou dados.

## Isolamento de dados locais

O Clássico Azul não deve ler nem escrever no `userData` do `PDV Nexus` existente.

Antes de inicializar qualquer banco, backup ou updater do PDV, o processo Electron do Clássico Azul deve usar:

```text
appData/PDV Nexus Classico Azul
```

Dentro dessa pasta, os nomes internos existentes podem ser preservados (`pdv-nexus.sqlite`, `pdv-upgrade-backups`, `pdv-backups` etc.), porque o isolamento ocorre pela raiz de `userData`.

Esse isolamento também deve valer para segredos locais, logs e arquivos auxiliares que já usam `app.getPath("userData")`.

## Isolamento de atualização e distribuição

O destino não pode continuar usando o manifest de release do repositório `PDVNexus`.

Durante as fases 0–3, o auto-updater do Clássico Azul deve ficar explicitamente desativado até existir um canal de release próprio validado.

Portanto, no baseline inicial:

- não apontar para `PDVNexus/releases`;
- não publicar release;
- não publicar instalador no Google Drive;
- não alterar a pasta de distribuição atual do PDV Nexus;
- o pacote desktop do Clássico Azul deve ser executável/testável sem inicializar o updater do produto original.

A configuração definitiva de releases próprias fica para a fase 8 do roadmap.

## Fase 0 — snapshot

Registrar no destino um arquivo de proveniência contendo repositório, branch e SHA de origem. O valor do SHA deve ser exatamente:

`07d7bba2f184e298cb53fa1d3d1a24b37539e844`

O gate da fase é a possibilidade de identificar de forma inequívoca a versão do `PDVNexus` que originou o novo produto.

## Fase 1 — cópia segura

Copiar o conteúdo versionado do snapshot para o repositório destino, preservando a história do destino como repositório próprio.

A cópia não deve transportar o diretório `.git` do repositório fonte.

Após a cópia:

- `git remote -v` do destino deve mostrar apenas o novo repositório como `origin`;
- a árvore de arquivos do destino deve conter as edições `windows-10/` e `windows-7/`;
- o SHA fonte deve permanecer documentado como proveniência, sem criar vínculo de atualização automática com o original.

## Fase 2 — isolamento do produto

Modificar somente no destino os pontos necessários para separar:

- identidade do instalador;
- nome do produto;
- atalho do Windows;
- raiz `userData`;
- canal/manifest de atualização.

Não alterar nesta fase regras de venda, estoque, pagamento, clientes, financeiro, recibos, banco de domínio ou UI do caixa.

## Fase 3 — baseline funcional

A baseline é executada antes de qualquer alteração visual.

### Windows 10+

Executar na raiz `windows-10/`:

```powershell
npm ci
npm run typecheck
npm run test:pdv-payments
npm run test:pdv-upgrade
npm run build:pdv-demo
```

Depois executar o PDV desktop em modo local e confirmar que ele abre usando a identidade e `userData` próprios do Clássico Azul.

### Critérios mínimos

A fase 3 só é considerada concluída se:

- instalação/dependências concluírem sem erro;
- typecheck passar;
- testes de pagamentos passarem;
- testes de upgrade passarem;
- build do `pdv-demo` passar;
- o desktop abrir como `PDV Nexus Clássico Azul`;
- nenhum arquivo de dados do PDV Nexus original for usado;
- nenhum updater do PDV Nexus original for acionado;
- o repositório original continuar no mesmo SHA de referência, sem commits criados por este trabalho.

## Não objetivos desta etapa

Ficam explicitamente fora das fases 0–3:

- implementar a nova UI clássica azul;
- alterar fluxos funcionais do caixa;
- publicar instalador;
- publicar no Google Drive;
- criar release GitHub;
- habilitar auto-update próprio;
- portar a UI para Windows 7.

## Dependências e custo

O core desta etapa deve permanecer R$ 0, self-hosted/local e baseado nas dependências já presentes no projeto. Nenhum serviço pago é necessário para concluir as fases 0–3.

## Critério de conclusão

Ao final da fase 3 existe um `pdvnexusclassicoazul` funcional, isolado e testado, ainda visualmente equivalente ao snapshot do PDV Nexus, pronto para receber a UI Clássico Azul sem risco de modificar ou atualizar o produto original.
