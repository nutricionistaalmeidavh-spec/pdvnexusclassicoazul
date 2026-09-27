# Product Image Mobile Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Completar as etapas 6–8 do roadmap de foto de produto: mostrar a foto no caixa, permitir captura por celular via QR/LAN e provar o fluxo por QA automatizado e empacotado.

**Architecture:** A captura móvel ficará isolada em um módulo Node testável que gerencia servidor HTTP temporário, sessões/tokens e a página móvel. `main.cjs` injeta a persistência de imagem existente (`artisys-upload` + `artisys-files`) e expõe somente IPC limitado; o renderer consome um bridge tipado e reutiliza o lifecycle atual de `imageRef`. A foto no caixa usa o bridge já existente para resolver a URL local em runtime, sem persistir bytes ou URLs absolutas.

**Tech Stack:** TypeScript/React, Electron 44.4.5, Node.js `http`/`crypto`/`os`, biblioteca open source `qrcode`, Node test runner, `artisys-upload`, `artisys-files`.

**Spec:** `docs/superpowers/specs/2026-09-26-product-image-mobile-capture-design.md`

## Global Constraints

- Escopo desta implementação: somente `windows-10`; a árvore `windows-7` deve permanecer idêntica à `main`.
- Uma única foto principal por produto.
- Formatos permitidos: `image/jpeg`, `image/png`, `image/webp`.
- Tamanho máximo: `5 * 1024 * 1024` bytes.
- Sessão de captura móvel: validade padrão de `5 * 60 * 1000` ms.
- Token de sessão: criptograficamente aleatório, não sequencial e de uso único.
- Transporte: somente LAN local; sem túnel, relay, cloud, Firebase, S3 ou serviço pago obrigatório.
- Armazenamento: reutilizar `userData/pdv-product-images`; não criar segundo diretório de imagens.
- Persistência de produto: somente `imageRef`; nunca persistir bytes/base64 nem URL absoluta da máquina.
- Não alterar regras de venda, estoque, pagamento, troco, impressão ou demais regras de negócio.
- Electron permanece exatamente em `44.4.5`.
- O renderer não recebe acesso arbitrário a filesystem, sockets ou ao servidor HTTP.

## Review Focus

- **Sem IPv4 privado utilizável:** `start()` deve falhar de forma controlada, sem deixar sessão ou servidor vazando.
- **Upload chunked/sem `Content-Length` ultrapassa 5 MB:** interromper leitura e responder `413` sem buffer ilimitado nem arquivo parcial.
- **Sessão antiga termina depois de uma nova:** resultado da sessão obsoleta não pode substituir a foto do draft atual.
- **Formulário/app fecha enquanto aguarda:** a sessão deve ser cancelada; o servidor fecha quando não houver sessões ativas.
- **`imageRef` aponta para arquivo ausente/corrompido no caixa:** mostrar placeholder e manter venda/caixa operacionais.

---

### Task 1: Criar o serviço de captura móvel testável

**Files:**
- Create: `windows-10/apps/nexus-desktop/pdv-product-mobile-capture.mjs`
- Create: `windows-10/tests/pdv-product-mobile-capture.test.mjs`
- Modify: `windows-10/apps/nexus-desktop/package.json`
- Modify: `windows-10/package-lock.json`

**Interfaces:**
- Consumes: callback de persistência `saveImage({ productCode, fileName, type, data }) -> Promise<{ imageRef, imageUrl?, fileName? }>`; Node `http`, `crypto`, `os`; `qrcode` local.
- Produces: `createPdvProductMobileCaptureService(options)` retornando `start(productCode, productName?)`, `status(sessionId)`, `cancel(sessionId)` e `close()`.

- [ ] **Step 1: Escrever testes RED para criação e ciclo de vida de sessão**

Em `pdv-product-mobile-capture.test.mjs`, criar testes que fixem:

```js
const service = createPdvProductMobileCaptureService({
  saveImage,
  sessionTtlMs: 5 * 60 * 1000,
  maxBytes: 5 * 1024 * 1024,
  hostResolver: () => "192.168.1.20",
  now: () => now
});
```

Asserções mínimas: `start("00123", "Produto")` retorna `sessionId`, URL `http://192.168.1.20:<porta>/capture/<token>`, `qrDataUrl` começando por `data:image/`, `expiresAt`; `status()` inicia em `waiting`; após avanço do relógio passa a `expired`; `cancel()` produz `cancelled`.

- [ ] **Step 2: Rodar o teste e confirmar RED**

Run: `cd windows-10 && node --test tests/pdv-product-mobile-capture.test.mjs`
Expected: FAIL porque o módulo/serviço ainda não existe.

- [ ] **Step 3: Adicionar `qrcode` como dependência local do desktop**

Modificar `apps/nexus-desktop/package.json` e atualizar `package-lock.json` com npm. A dependência deve ser open source, empacotada localmente e não executar chamadas de rede em runtime.

- [ ] **Step 4: Implementar `createPdvProductMobileCaptureService(options)`**

Assinatura pública:

```js
createPdvProductMobileCaptureService({
  saveImage,
  sessionTtlMs = 5 * 60 * 1000,
  maxBytes = 5 * 1024 * 1024,
  hostResolver = resolvePrivateIpv4,
  now = () => Date.now()
})
```

Usar `crypto.randomBytes()` para `sessionId` e token; manter sessões somente em memória; abrir `http.createServer()` em porta dinâmica e encerrar o servidor quando não houver sessões `waiting`/`received` ainda consultáveis conforme a política do módulo.

- [ ] **Step 5: Implementar seleção de IPv4 privado e falha sem LAN**

Exportar/testar `resolvePrivateIpv4(networkInterfaces = os.networkInterfaces()) -> string | null`. Aceitar IPv4 privado RFC1918 (`10/8`, `172.16/12`, `192.168/16`), não loopback. `start()` deve rejeitar com erro estável quando nenhum endereço for encontrado e não criar sessão/servidor residual.

- [ ] **Step 6: Implementar página móvel mínima**

`GET /capture/<token>` deve responder HTML UTF-8 contendo exatamente o fluxo de seleção/câmera por:

```html
<input type="file" accept="image/*" capture="environment">
```

A página envia o `File` como corpo binário para `POST /capture/<token>/image`, preservando `Content-Type` e passando o nome apenas como metadado/cabeçalho; nenhum dado de cliente, venda ou configuração da loja entra no HTML.

- [ ] **Step 7: Escrever testes RED para HTTP e segurança**

Cobrir via HTTP real em localhost/host injetado:
- endpoint desconhecido -> `404`;
- token expirado/cancelado -> `410`;
- segundo upload após sucesso -> `409`;
- MIME fora de JPEG/PNG/WebP -> erro de tipo (`415` ou resposta estável equivalente definida no módulo);
- `Content-Length` maior que 5 MB -> `413` antes de acumular;
- upload chunked que ultrapassa 5 MB -> `413` durante streaming;
- JPG/PNG/WebP válido chama `saveImage` uma vez e `status()` vira `received` com `imageRef`;
- resposta pública não contém caminho absoluto do desktop.

- [ ] **Step 8: Implementar leitura limitada e endpoint de upload**

Ler chunks até `maxBytes`; ao ultrapassar, destruir/ignorar restante do corpo, não chamar `saveImage` e responder `413`. Depois do primeiro upload válido, invalidar o token para novos uploads e conservar por `sessionId` apenas o resultado necessário ao renderer.

- [ ] **Step 9: Testar encerramento e ausência de vazamento**

Adicionar teste que cancela/expira todas as sessões e confirma que `close()` é idempotente e encerra listener/servidor. Incluir caso de falha em `saveImage`: sessão não pode virar `received` nem permitir referência parcial.

- [ ] **Step 10: Rodar testes e confirmar GREEN**

Run: `cd windows-10 && node --test tests/pdv-product-mobile-capture.test.mjs`
Expected: todos os testes passam.

- [ ] **Step 11: Commit**

Commit: `feat: add local mobile product photo capture service`.

---

### Task 2: Integrar persistência de imagem e bridge Electron

**Files:**
- Modify: `windows-10/apps/nexus-desktop/main.cjs`
- Modify: `windows-10/apps/nexus-desktop/preload.cjs`
- Modify: `windows-10/packages/desktop-runtime/src/index.ts`
- Modify: `windows-10/tests/pdv-classic-blue-ui.test.mjs`

**Interfaces:**
- Consumes: `createPdvProductMobileCaptureService()` da Task 1 e módulos existentes `artisys-upload`/`artisys-files`.
- Produces: `persistPdvProductImage({ productCode, fileName, type, data })`; IPC `nexus-pdv-mobile-capture:start|status|cancel`; `DesktopPdvMobileCaptureBridge`; `getDesktopPdvMobileCaptureBridge()`.

- [ ] **Step 1: Escrever testes RED do contrato de bridge**

Em `pdv-classic-blue-ui.test.mjs`, verificar que runtime e preload expõem somente:

```text
pdvMobileCapture.start
pdvMobileCapture.status
pdvMobileCapture.cancel
```

E que `main.cjs` registra os três IPCs. O teste não deve aceitar APIs genéricas de `listen`, `fs`, `socket` ou `request` no bridge.

- [ ] **Step 2: Rodar e confirmar RED**

Run: `cd windows-10 && node --test tests/pdv-classic-blue-ui.test.mjs`
Expected: FAIL por ausência do novo bridge.

- [ ] **Step 3: Extrair persistência comum de imagem em `main.cjs`**

Criar:

```js
async function persistPdvProductImage({ productCode, fileName, type, data })
```

Ela deve validar exatamente uma imagem com `validateUploadBatch`, `maxFileSize = 5 * 1024 * 1024` e MIME JPEG/PNG/WebP, gerar nome/caminho controlado pelo desktop dentro de `products/<safeProductCode>/...`, escrever por `artisys-files` e retornar `{ imageRef, imageUrl, fileName }`.

- [ ] **Step 4: Fazer a seleção desktop reutilizar `persistPdvProductImage`**

`selectPdvProductImage(productCode)` continua exibindo diálogo e lendo o arquivo, mas delega validação/escrita à função comum. Não alterar UX já mergeada.

- [ ] **Step 5: Criar instância lazy do serviço móvel**

`main.cjs` deve injetar `saveImage: persistPdvProductImage`; `start` usa código/nome do produto; `status` e `cancel` delegam ao serviço. No fechamento do app/janela, chamar `close()` para evitar listener residual.

- [ ] **Step 6: Adicionar os três handlers IPC e preload limitado**

Handlers:

```text
nexus-pdv-mobile-capture:start
nexus-pdv-mobile-capture:status
nexus-pdv-mobile-capture:cancel
```

Preload:

```js
pdvMobileCapture: {
  start: (productCode, productName) => ipcRenderer.invoke(...),
  status: (sessionId) => ipcRenderer.invoke(...),
  cancel: (sessionId) => ipcRenderer.invoke(...)
}
```

- [ ] **Step 7: Adicionar tipos no desktop runtime**

Definir os contratos da spec:

```ts
export interface DesktopPdvMobileCaptureSession {
  sessionId: string;
  url: string;
  qrDataUrl: string;
  expiresAt: string;
}

export interface DesktopPdvMobileCaptureStatus {
  state: "waiting" | "received" | "expired" | "cancelled";
  imageRef?: string;
  imageUrl?: string;
}

export interface DesktopPdvMobileCaptureBridge {
  start(productCode: string, productName?: string): Promise<DesktopPdvMobileCaptureSession>;
  status(sessionId: string): Promise<DesktopPdvMobileCaptureStatus>;
  cancel(sessionId: string): Promise<boolean>;
}
```

Adicionar `pdvMobileCapture?: DesktopPdvMobileCaptureBridge` em `Window.nexusDesktop` e `getDesktopPdvMobileCaptureBridge()`.

- [ ] **Step 8: Rodar contrato, typecheck e serviço**

Run:
```bash
cd windows-10
node --test tests/pdv-classic-blue-ui.test.mjs tests/pdv-product-mobile-capture.test.mjs
npm run typecheck
```
Expected: PASS/exit 0.

- [ ] **Step 9: Commit**

Commit: `feat: bridge mobile product photo capture into Electron`.

---

### Task 3: Mostrar foto do produto no caixa

**Files:**
- Modify: `windows-10/apps/pdv-demo/src/PdvDemoApp.tsx`
- Modify: `windows-10/tests/pdv-classic-blue-ui.test.mjs`

**Interfaces:**
- Consumes: `CatalogProduct.imageRef` e `getDesktopPdvProductImageBridge().url(imageRef)` já existentes.
- Produces: produto visualmente ativo do caixa + `cashierProductImageUrl` runtime + área de foto com placeholder seguro.

- [ ] **Step 1: Escrever teste RED do contrato visual do caixa**

O teste estrutural deve exigir uma área estável de imagem no caixa, resolução via `desktopProductImageBridge.url`, `<img>` quando há URL e texto/elemento de placeholder quando não há. Deve também exigir que a lógica não chame `remove()` a partir do caixa.

- [ ] **Step 2: Rodar e confirmar RED**

Run: `cd windows-10 && node --test tests/pdv-classic-blue-ui.test.mjs`
Expected: FAIL porque o caixa ainda não renderiza foto.

- [ ] **Step 3: Definir produto visualmente ativo**

No `PdvDemoApp`, derivar o produto exibido priorizando o produto do item mais recentemente adicionado/ativo na venda; quando não houver item, usar apenas um destaque de catálogo já existente se houver um hook inequívoco. Não criar nova regra de venda nem persistência para essa seleção.

- [ ] **Step 4: Resolver URL local de forma reativa**

Manter estado `cashierProductImageUrl`. Quando `activeCashierProduct?.imageRef` mudar, chamar `desktopProductImageBridge.url(imageRef)`; em referência vazia, arquivo ausente ou erro, limpar URL. Proteger contra race de efeito desmontado/resultado antigo.

- [ ] **Step 5: Renderizar foto + fallback na superfície Classic Blue**

Adicionar área fixa/coerente com a UI atual. Se houver URL, `<img>` com `objectFit: "contain"` e `alt` com nome do produto; caso contrário, placeholder neutro “Sem foto”. O erro de imagem (`onError`) retorna ao placeholder e não afeta a venda.

- [ ] **Step 6: Rodar teste, typecheck e build do renderer**

Run:
```bash
cd windows-10
node --test tests/pdv-classic-blue-ui.test.mjs
npm run typecheck
npm run build:pdv-demo
```
Expected: PASS/exit 0.

- [ ] **Step 7: Commit**

Commit: `feat: show product photo in cashier`.

---

### Task 4: Conectar QR/celular ao formulário de produto

**Files:**
- Modify: `windows-10/apps/pdv-demo/src/PdvDemoApp.tsx`
- Modify: `windows-10/tests/pdv-classic-blue-ui.test.mjs`

**Interfaces:**
- Consumes: `getDesktopPdvMobileCaptureBridge()` da Task 2 e lifecycle existente de `productDraft.imageRef`/preview.
- Produces: ação “Tirar foto pelo celular”, QR/status/polling e adoção segura de foto recebida.

- [ ] **Step 1: Escrever testes RED do fluxo de UI**

Exigir no código do formulário:
- texto `Tirar foto pelo celular`;
- getter `getDesktopPdvMobileCaptureBridge`;
- render de `qrDataUrl` e URL LAN de fallback;
- polling de `status(sessionId)`;
- cancelamento da sessão;
- adoção de `imageRef` recebido no mesmo draft da seleção local.

- [ ] **Step 2: Rodar e confirmar RED**

Run: `cd windows-10 && node --test tests/pdv-classic-blue-ui.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Unificar adoção de uma nova imagem no draft**

Extrair helper renderer, por exemplo:

```ts
async function adoptDraftProductImage(result: { imageRef: string; imageUrl?: string }): Promise<void>
```

Ele aplica `imageRef`/preview e preserva as regras atuais: imagem temporária anterior é removida quando apropriado; imagem original persistida entra na fila de remoção somente após persistência bem-sucedida.

- [ ] **Step 4: Implementar início de sessão móvel**

Ao clicar `Tirar foto pelo celular`, exigir código do produto/draft; cancelar sessão anterior ativa antes de iniciar nova; chamar `start(productCode, productName)` e guardar a sessão retornada. Se bridge não existir, informar que a função requer o desktop Electron.

- [ ] **Step 5: Renderizar QR, fallback e estado**

Enquanto `waiting`, mostrar `<img src={session.qrDataUrl}>`, URL LAN copiável/legível, expiração e botão de cancelar. Estados `expired` e `cancelled` devem encerrar polling e permitir gerar nova sessão.

- [ ] **Step 6: Implementar polling com proteção contra sessão obsoleta**

Consultar `status(sessionId)` aproximadamente a cada 1 segundo. Antes de aplicar `received`, confirmar que o `sessionId` ainda é o ativo. Sessão antiga nunca altera o draft após outra sessão ter sido criada/cancelada.

- [ ] **Step 7: Aplicar foto recebida pelo celular**

Quando `received` vier com `imageRef`, chamar `adoptDraftProductImage({ imageRef, imageUrl })`, encerrar polling/estado de espera e informar sucesso. O produto só passa a persistir a nova referência quando o usuário executar o save já existente.

- [ ] **Step 8: Cancelar sessão no ciclo de vida do formulário**

Cancelar a sessão ativa em: `Cancelar` edição/cadastro, troca por nova sessão, desmontagem do componente/fechamento relevante e após fluxo encerrado quando necessário. Não remover a imagem recebida se ela já foi adotada pelo draft; usar o lifecycle de draft existente para isso.

- [ ] **Step 9: Rodar teste, typecheck e build**

Run:
```bash
cd windows-10
node --test tests/pdv-classic-blue-ui.test.mjs tests/pdv-product-mobile-capture.test.mjs
npm run typecheck
npm run build:pdv-demo
```
Expected: PASS/exit 0.

- [ ] **Step 10: Commit**

Commit: `feat: capture product photo from phone by qr`.

---

### Task 5: Empacotar e colocar QA no pipeline

**Files:**
- Modify: `windows-10/apps/nexus-desktop/electron-builder.cjs`
- Modify: `windows-10/tests/pdv-packaging.test.mjs`
- Modify: `.github/workflows/windows10-electron-runtime-verify.yml`

**Interfaces:**
- Consumes: módulo `pdv-product-mobile-capture.mjs`, testes das Tasks 1–4.
- Produces: instalador contendo o módulo + CI disparando para todos os arquivos relevantes + gates completos.

- [ ] **Step 1: Escrever teste RED de empacotamento**

Em `pdv-packaging.test.mjs`, exigir `config.files.includes("pdv-product-mobile-capture.mjs")` para o build do PDV.

- [ ] **Step 2: Rodar e confirmar RED**

Run: `cd windows-10 && npm run build:pdv-demo`
Expected: postbuild falha no novo assert até o builder ser atualizado.

- [ ] **Step 3: Incluir módulo no Electron Builder**

Adicionar `pdv-product-mobile-capture.mjs` à lista `files` de `electron-builder.cjs`; manter Electron `44.4.5` e os módulos `artisys-*` existentes.

- [ ] **Step 4: Corrigir triggers do workflow**

Nos blocos `push.paths` e `pull_request.paths`, incluir pelo menos:

```text
windows-10/apps/nexus-desktop/main.cjs
windows-10/apps/nexus-desktop/preload.cjs
windows-10/apps/nexus-desktop/pdv-product-mobile-capture.mjs
windows-10/apps/nexus-desktop/package.json
windows-10/apps/pdv-demo/src/PdvDemoApp.tsx
windows-10/packages/desktop-runtime/src/index.ts
windows-10/package.json
windows-10/package-lock.json
windows-10/tests/pdv-classic-blue-ui.test.mjs
windows-10/tests/pdv-product-mobile-capture.test.mjs
windows-10/tests/pdv-packaging.test.mjs
.github/workflows/windows10-electron-runtime-verify.yml
```

- [ ] **Step 5: Adicionar teste móvel ao gate de CI**

Executar `tests/pdv-product-mobile-capture.test.mjs` junto do gate Classic Blue ou em step separado com nome explícito. Manter audit, typecheck, pagamentos, upgrade, renderer, instalador, assert Electron e smoke gráfico.

- [ ] **Step 6: Preservar o gate Windows 7**

Manter a comparação `origin/main:windows-7` vs `HEAD:windows-7`; nenhum arquivo de Windows 7 pode ser alterado neste plano.

- [ ] **Step 7: Rodar build e testes locais disponíveis**

Run:
```bash
cd windows-10
node --test tests/pdv-classic-product-isolation.test.mjs tests/pdv-classic-blue-ui.test.mjs tests/pdv-product-mobile-capture.test.mjs
npm run build:pdv-demo
```
Expected: PASS/exit 0.

- [ ] **Step 8: Commit**

Commit: `test: gate mobile product photo capture`.

---

### Task 6: Verificação final e revisão da branch

**Files:**
- Review: todas as mudanças da branch contra `main`.
- No product-code changes expected unless a gate exposes a defect in Tasks 1–5.

**Interfaces:**
- Consumes: Tasks 1–5 completas.
- Produces: branch pronta para PR, com evidência reproduzível das etapas 6–8 e sem alteração em Windows 7.

- [ ] **Step 1: Instalar lockfile exato**

Run: `cd windows-10 && npm ci`
Expected: exit 0.

- [ ] **Step 2: Rodar security audit**

Run: `npm audit --audit-level=high`
Expected: exit 0; vulnerabilidade high/critical nova bloqueia conclusão.

- [ ] **Step 3: Rodar typecheck**

Run: `npm run typecheck`
Expected: exit 0.

- [ ] **Step 4: Rodar testes de negócio existentes**

Run: `npm run test:pdv-payments`
Expected: todos passam.

- [ ] **Step 5: Rodar testes de upgrade/release**

Run: `npm run test:pdv-upgrade`
Expected: todos passam.

- [ ] **Step 6: Rodar isolamento, UI e captura móvel**

Run:
```bash
node --test tests/pdv-classic-product-isolation.test.mjs tests/pdv-classic-blue-ui.test.mjs tests/pdv-product-mobile-capture.test.mjs
```
Expected: todos passam, incluindo HTTP localhost, limite chunked, expiração, cancelamento e reuso.

- [ ] **Step 7: Build do renderer e teste de empacotamento**

Run: `npm run build:pdv-demo`
Expected: exit 0 e postbuild de packaging PASS.

- [ ] **Step 8: Gerar instalador Windows 10 sem publicar**

Run:
```bash
CSC_IDENTITY_AUTO_DISCOVERY=false npm run dist:pdv --workspace @nexus-core/nexus-desktop -- --publish never
```
No runner Windows usar sintaxe de ambiente equivalente. Expected: instalador e `win-unpacked` gerados, contendo o módulo móvel e Electron 44.4.5.

- [ ] **Step 9: Rodar smoke gráfico empacotado**

Abrir o executável empacotado pelo mesmo procedimento do workflow atual, confirmar janela `PDV Nexus Clássico Azul` e produzir screenshot não vazio. Não declarar esse gate concluído sem execução gráfica real.

- [ ] **Step 10: Confirmar Windows 7 intocado**

Comparar a árvore `windows-7` da branch com `origin/main:windows-7`. Expected: SHAs de árvore idênticos.

- [ ] **Step 11: Abrir PR e aguardar CI real**

Criar PR `feat/product-image-mobile-capture -> main`. Exigir workflow `Windows 10 Electron Runtime Verify` verde no HEAD exato da PR antes de considerar pronta para integração.

- [ ] **Step 12: Revisão final da branch**

Revisar diff completo com foco em: exposição de rede, token/expiração/reuso, limite de memória, lifecycle da imagem, race de sessão no renderer, empacotamento e ausência de mudanças de negócio/Windows 7. Corrigir issues Critical/Important e reexecutar gates afetados.

- [ ] **Step 13: Entregar status**

Relatar separadamente:
- Etapa 6 — foto no caixa;
- Etapa 7 — captura QR/celular;
- Etapa 8 — QA.

Só marcar cada uma como concluída com evidência dos gates correspondentes. A integração em `main` permanece uma decisão explícita do usuário após PR verde/revisada.
