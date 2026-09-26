# PDV Nexus Clássico Azul — Fases 0–3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar uma cópia funcional e independente do PDV Nexus no repositório `nutricionistaalmeidavh-spec/pdvnexusclassicoazul`, isolando identidade, dados locais e updater, e comprovar o baseline Windows 10+ antes de qualquer mudança de UI.

**Architecture:** O commit `07d7bba2f184e298cb53fa1d3d1a24b37539e844` do `PDVNexus` é tratado como snapshot somente-leitura. A árvore versionada desse snapshot é importada para o repositório novo sem transportar `.git`; depois o shell Electron recebe identidade própria e `userData` próprio, e o metadata de build deixa o auto-updater sem canal/manifest. A UI, regras de venda, estoque, pagamentos e banco de domínio permanecem inalterados nesta etapa.

**Tech Stack:** Git/GitHub, Node.js/npm, TypeScript, React, Electron 39.8.10 (Windows 10+), Electron 22.3.27 (Windows 7), Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-26-pdv-nexus-classico-azul-bootstrap-design.md`

## Global Constraints

- Repositório fonte: `nutricionistaalmeidavh-spec/PDVNexus`.
- Commit fonte imutável para a cópia: `07d7bba2f184e298cb53fa1d3d1a24b37539e844`.
- Repositório destino: `nutricionistaalmeidavh-spec/pdvnexusclassicoazul`.
- Não escrever, criar branch, tag, release ou commit no repositório fonte.
- `appId`: `com.artisys.pdvnexus.classicoazul`.
- `productName`: `PDV Nexus Clássico Azul`.
- Instalador Windows 10+: `PDV-Nexus-Classico-Azul-Setup-${version}.${ext}`.
- Atalho: `PDV Nexus Clássico Azul`.
- `userData`: `appData/PDV Nexus Classico Azul`.
- Auto-updater desativado nas fases 0–3; nenhum manifest do `PDVNexus` pode ser usado em runtime.
- Não publicar release ou Google Drive nesta etapa.
- Não alterar UI do caixa nem regras de negócio nesta etapa.
- Core R$ 0, local/self-hosted e somente dependências já existentes.

## Review Focus

- O destino não pode conservar nenhum remote de escrita apontando para `PDVNexus`; o gate deve mostrar apenas `pdvnexusclassicoazul` como `origin`.
- O `userData` deve ser redefinido antes de `preparePdvVersionMigration`, pois o bootstrap usa o caminho antes de carregar `main.cjs`.
- O build do PDV não pode embutir `pdvUpdateChannel` nem o manifest do produto original.
- O isolamento de identidade deve existir nas duas linhas (`windows-10` e `windows-7`) mesmo que o baseline executado nesta etapa seja Windows 10+.
- A importação não pode perder arquivos binários/versionados nem substituir os documentos de spec/plan já existentes no destino.

---

### Task 1: Importar o snapshot e registrar proveniência

**Files:**
- Import: toda a árvore versionada do commit fonte, excluindo apenas `.git`.
- Preserve: `docs/superpowers/specs/2026-09-26-pdv-nexus-classico-azul-bootstrap-design.md`.
- Preserve: `docs/superpowers/plans/2026-09-26-pdv-nexus-classico-azul-fases-0-3.md`.
- Create: `SOURCE_PROVENANCE.md`.

**Interfaces:**
- Consumes: commit fonte `07d7bba2f184e298cb53fa1d3d1a24b37539e844`.
- Produces: árvore independente contendo `windows-10/`, `windows-7/`, `.github/`, testes, scripts e documentação; `SOURCE_PROVENANCE.md` com origem inequívoca.

- [ ] **Step 1: Materializar o snapshot fonte e uma cópia local do destino em diretórios separados**

Checkout da origem deve ser detached no SHA fixo; o destino deve permanecer um clone/repositório independente.

- [ ] **Step 2: Copiar a árvore versionada sem `.git` para o destino**

Preservar os dois documentos Superpowers do destino e não copiar `node_modules`, instaladores ou outros ignorados não versionados.

- [ ] **Step 3: Criar `SOURCE_PROVENANCE.md`**

O arquivo deve afirmar exatamente:

```text
source_repository=nutricionistaalmeidavh-spec/PDVNexus
source_branch=main
source_commit=07d7bba2f184e298cb53fa1d3d1a24b37539e844
destination_repository=nutricionistaalmeidavh-spec/pdvnexusclassicoazul
```

- [ ] **Step 4: Verificar a árvore importada**

Checar que existem ao menos `windows-10/package.json`, `windows-7/package.json`, `.github/`, `pdv-release.json` e os dois documentos Superpowers. Comparar a lista de caminhos versionados do snapshot com o destino, admitindo apenas `SOURCE_PROVENANCE.md` e os documentos Superpowers como extras antes da Task 2.

- [ ] **Step 5: Verificar isolamento Git**

Run: `git remote -v` no destino.
Expected: apenas `https://github.com/nutricionistaalmeidavh-spec/pdvnexusclassicoazul.git` para fetch/push; nenhuma URL de `PDVNexus`.

- [ ] **Step 6: Commit da importação no destino**

Commit: `chore: import PDV Nexus snapshot for classic blue edition`.

---

### Task 2: Isolar identidade, userData e updater

**Files:**
- Create: `windows-10/apps/nexus-desktop/pdv-product-identity.cjs`.
- Create: `windows-7/apps/nexus-desktop/pdv-product-identity.cjs`.
- Modify: `windows-10/apps/nexus-desktop/bootstrap.cjs`.
- Modify: `windows-7/apps/nexus-desktop/bootstrap.cjs`.
- Modify: `windows-10/apps/nexus-desktop/main.cjs` (somente título `APP_META.pdv-demo`).
- Modify: `windows-7/apps/nexus-desktop/main.cjs` (somente título `APP_META.pdv-demo`).
- Modify: `windows-10/apps/nexus-desktop/electron-builder.cjs`.
- Modify: `windows-7/apps/nexus-desktop/electron-builder.cjs`.
- Modify: `windows-10/apps/nexus-desktop/electron-builder-pdv.cjs`.
- Modify: `windows-7/apps/nexus-desktop/electron-builder-pdv.cjs` se o arquivo equivalente existir no snapshot.
- Modify: `pdv-release.json` somente para neutralizar destinos do produto original sem alterar `version`.
- Create: `windows-10/tests/pdv-classic-product-isolation.test.mjs`.
- Create: `windows-7/tests/pdv-classic-product-isolation.test.mjs`.

**Interfaces:**
- Consumes: shell Electron importado na Task 1.
- Produces: `applyPdvProductIdentity(app, pathModule)`; identidade de instalador Clássico Azul; `userData` isolado; build sem metadata de auto-update do PDV original.

- [ ] **Step 1: Escrever testes de isolamento antes da implementação**

Cada `pdv-classic-product-isolation.test.mjs` deve verificar por leitura/importação controlada que:

```text
appId == com.artisys.pdvnexus.classicoazul
productName == PDV Nexus Clássico Azul
artifactName == PDV-Nexus-Classico-Azul-Setup-${version}.${ext}
shortcutName == PDV Nexus Clássico Azul
userData basename == PDV Nexus Classico Azul
bootstrap aplica a identidade antes de preparePdvVersionMigration
config PDV não contém pdvUpdateChannel do Nexus original
config PDV não contém URL .../PDVNexus/releases/...
```

- [ ] **Step 2: Rodar os testes e confirmar RED**

Run em cada linha: `node --test tests/pdv-classic-product-isolation.test.mjs`.
Expected: FAIL porque a identidade ainda é `PDV Nexus` / `com.nexuscore.pdv` e o updater ainda está configurado.

- [ ] **Step 3: Criar `applyPdvProductIdentity(app, pathModule)` nas duas linhas**

Assinatura CommonJS:

```text
applyPdvProductIdentity(app, pathModule) -> void
```

Comportamento fixo: `app.setName("PDV Nexus Clássico Azul")` e `app.setPath("userData", pathModule.join(app.getPath("appData"), "PDV Nexus Classico Azul"))`.

- [ ] **Step 4: Aplicar a identidade no início do fluxo PDV do `bootstrap.cjs`**

A chamada deve ocorrer antes de qualquer `app.getPath("userData")` usado por `preparePdvVersionMigration`.

- [ ] **Step 5: Alterar somente a apresentação de identidade em `main.cjs`**

`APP_META["pdv-demo"].title` deve ser `PDV Nexus Clássico Azul`; não alterar persistência, IPC, tabelas ou lógica de domínio.

- [ ] **Step 6: Alterar a configuração do Electron Builder nas duas linhas**

Valores exatos para `pdv-demo`: `appId`, `productName`, `artifactName` e `nsis.shortcutName` definidos nos Global Constraints. Outros apps do monorepo permanecem inalterados.

- [ ] **Step 7: Desabilitar updater do Clássico Azul durante o baseline**

`electron-builder-pdv.cjs` deve manter `version: release.version`, mas não embutir `pdvUpdateChannel` nem `pdvUpdateManifestUrl`. `pdv-release.json` mantém `schemaVersion` e `version=0.1.19`, mas não pode apontar para release/Drive do `PDVNexus` original.

- [ ] **Step 8: Rodar testes de isolamento e confirmar GREEN**

Run em `windows-10/` e `windows-7/`: `node --test tests/pdv-classic-product-isolation.test.mjs`.
Expected: PASS em ambas.

- [ ] **Step 9: Procurar referências runtime perigosas**

Pesquisar nos arquivos de build/bootstrap/release por `com.nexuscore.pdv`, `PDV-Nexus-Setup`, `PDVNexus/releases/latest/download` e a pasta Google Drive original. Expected: nenhuma dessas referências permanece nos pontos de runtime/distribuição do `pdv-demo` Clássico Azul; documentação histórica pode conservar referências explicativas.

- [ ] **Step 10: Commit do isolamento no destino**

Commit: `feat: isolate PDV Nexus classic blue product identity`.

---

### Task 3: Comprovar baseline Windows 10+

**Files:**
- No product-code changes expected; only fix defects if a gate exposes a regression introduced by Tasks 1–2.
- Record: `docs/baseline-fases-0-3.md`.

**Interfaces:**
- Consumes: produto isolado da Task 2.
- Produces: evidência reproduzível de dependências, typecheck, testes, build e inicialização local sem updater original.

- [ ] **Step 1: Instalar exatamente o lockfile**

Run em `windows-10/`: `npm ci`.
Expected: exit 0.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`.
Expected: exit 0.

- [ ] **Step 3: Testes de pagamentos**

Run: `npm run test:pdv-payments`.
Expected: todos os testes passam.

- [ ] **Step 4: Testes de upgrade/release contract**

Run: `npm run test:pdv-upgrade`.
Expected: todos os testes passam; se um teste pressupõe o manifest original, ajustar o teste para o novo contrato de updater desativado, sem restaurar a URL antiga.

- [ ] **Step 5: Reexecutar teste de isolamento**

Run: `node --test tests/pdv-classic-product-isolation.test.mjs`.
Expected: PASS.

- [ ] **Step 6: Build do renderer PDV**

Run: `npm run build:pdv-demo`.
Expected: exit 0 e `apps/pdv-demo/dist/` gerado.

- [ ] **Step 7: Smoke do shell desktop**

Run: `npm run desktop:start:pdv` em ambiente gráfico Windows/compatível. Confirmar título `PDV Nexus Clássico Azul`, criação/uso de `appData/PDV Nexus Classico Azul` e ausência de tentativa de updater do `PDVNexus`. Se o executor atual não dispuser de sessão gráfica Windows, registrar explicitamente essa limitação e executar o smoke de bootstrap/metadata automatizado; não declarar o smoke visual como concluído sem evidência real.

- [ ] **Step 8: Criar `docs/baseline-fases-0-3.md`**

Registrar SHA fonte, SHA do destino testado, comandos executados, status de cada gate, resultado do smoke e confirmação de que nenhum release/Drive foi publicado.

- [ ] **Step 9: Verificar que o repositório fonte não recebeu escrita deste trabalho**

Consultar o `PDVNexus` e registrar que nenhuma ação de escrita foi realizada nele; comparar o SHA fonte documentado com o snapshot usado, sem assumir que terceiros não possam ter avançado `main` durante a execução.

- [ ] **Step 10: Commit das evidências de baseline**

Commit: `test: record classic blue baseline gates`.

---

### Task 4: Revisão final das fases 0–3

**Files:**
- Review all changes in the destination repository only.

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: confirmação de que a base está pronta para a Fase 4 sem alteração visual ainda.

- [ ] **Step 1: Revisar diff completo contra o snapshot**

As diferenças intencionais devem estar limitadas à proveniência/documentação, identidade do produto, isolamento de `userData`, neutralização do updater/distribuição e testes/evidências dessas mudanças.

- [ ] **Step 2: Rodar gate agregado final**

Em `windows-10/`: `npm run typecheck && npm run test:pdv-payments && npm run test:pdv-upgrade && node --test tests/pdv-classic-product-isolation.test.mjs && npm run build:pdv-demo`.
Expected: exit 0.

- [ ] **Step 3: Verificar ausência de publicação**

Confirmar: sem GitHub Release novo, sem upload Google Drive, sem alteração de release do `PDVNexus` original.

- [ ] **Step 4: Verificar escopo visual**

Confirmar que `windows-10/apps/pdv-demo/src/PdvDemoApp.tsx` e o equivalente Windows 7 não receberam alteração de UI nesta etapa, exceto se um teste obrigatório exigiu ajuste estritamente não visual documentado por ruling.

- [ ] **Step 5: Entregar status**

Relatar Fase 0, 1, 2 e 3 separadamente como `concluída`, `bloqueada` ou `parcial`, citando os gates reais. Não chamar a Fase 3 de concluída se o único item ausente for o smoke gráfico real; nesse caso marcar especificamente esse subgate como pendente.
