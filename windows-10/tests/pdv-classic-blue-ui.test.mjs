import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createWorkspace } from "../apps/nexus-desktop/artisys-files.mjs";
import { validateUploadBatch } from "../apps/nexus-desktop/artisys-upload.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

test("classic blue chrome is mounted and imported last", () => {
  const main = read("apps/pdv-demo/src/main.tsx");
  assert.match(main, /ClassicBlueChrome/);
  assert.match(main, /pdv-classic-blue\.css/);
  assert.match(main, /data-cashier-layout="classic-blue"/);
});

test("classic blue chrome exposes the operational Windows-style menus", () => {
  const chrome = read("apps/pdv-demo/src/ClassicBlueChrome.tsx");
  for (const label of ["Cadastros", "Movimentações", "Relatórios", "Utilitários", "Ajuda"]) assert.match(chrome, new RegExp(label));
  assert.match(chrome, /PDV Nexus Clássico Azul/);
  assert.match(chrome, /Caixa 001/);
});

test("customer presentation keeps the Classic Blue window title", () => {
  const decor = read("apps/pdv-demo/src/CustomerPresentationDecor.tsx");
  assert.match(decor, /document\.title\s*=\s*"PDV Nexus Clássico Azul"/);
  assert.doesNotMatch(decor, /document\.title\s*=\s*"PDV Nexus"/);
});

test("cashier uses classic table, totals and function-key surface", () => {
  const app = read("apps/pdv-demo/src/PdvDemoApp.tsx");
  assert.match(app, /data-classic-blue="cashier"/);
  assert.match(app, /classic-blue-table-head/);
  assert.match(app, /Descrição do Produto/);
  assert.match(app, /classic-blue-total-card/);
  assert.match(app, />TOTAL</);
  assert.match(app, />RECEBIDO</);
  assert.match(app, />TROCO</);
  assert.match(app, /F2/);
  assert.match(app, /F3/);
  assert.match(app, /F6/);
  assert.match(app, /F8/);
  assert.match(app, /F12/);
});

test("classic presentation preserves existing business hooks", () => {
  const app = read("apps/pdv-demo/src/PdvDemoApp.tsx");
  for (const symbol of ["completePdvSale", "closePdvCashSession", "applyPdvStockMovement", "createPdvAutoBackup", "renderPdvReceipt"]) assert.match(app, new RegExp(symbol));
  assert.match(app, /event\.key === "F2"/);
  assert.match(app, /event\.key === "F3"/);
  assert.match(app, /event\.key === "F6"/);
  assert.match(app, /event\.key === "F8"/);
  assert.match(app, /event\.key === "Delete"/);
  assert.match(app, /event\.key === "F12"/);
});

test("product registration supports one validated local product image", () => {
  const app = read("apps/pdv-demo/src/PdvDemoApp.tsx");
  const runtime = read("packages/desktop-runtime/src/index.ts");
  const preload = read("apps/nexus-desktop/preload.cjs");
  const desktop = read("apps/nexus-desktop/main.cjs");
  const builder = read("apps/nexus-desktop/electron-builder.cjs");

  assert.match(app, /imageRef/);
  assert.match(app, /Selecionar foto/);
  assert.match(app, /Remover foto/);
  assert.match(app, /getDesktopPdvProductImageBridge/);
  assert.match(runtime, /DesktopPdvProductImageBridge/);
  assert.match(preload, /pdvProductImage/);
  assert.match(desktop, /nexus-pdv-product-image:select/);
  assert.match(desktop, /image\/jpeg/);
  assert.match(desktop, /image\/png/);
  assert.match(desktop, /image\/webp/);
  assert.match(desktop, /5 \* 1024 \* 1024/);
  assert.match(builder, /artisys-upload\.mjs/);
  assert.match(builder, /artisys-files\.mjs/);
});

test("mobile capture bridge exposes only start status and cancel", () => {
  const runtime = read("packages/desktop-runtime/src/index.ts");
  const preload = read("apps/nexus-desktop/preload.cjs");
  const desktop = read("apps/nexus-desktop/main.cjs");

  assert.match(runtime, /DesktopPdvMobileCaptureSession/);
  assert.match(runtime, /DesktopPdvMobileCaptureStatus/);
  assert.match(runtime, /DesktopPdvMobileCaptureBridge/);
  assert.match(runtime, /getDesktopPdvMobileCaptureBridge/);
  assert.match(preload, /pdvMobileCapture:\s*\{/);
  assert.match(preload, /start:\s*\(productCode, productName\)/);
  assert.match(preload, /status:\s*\(sessionId\)/);
  assert.match(preload, /cancel:\s*\(sessionId\)/);
  assert.doesNotMatch(preload, /pdvMobileCapture:[\s\S]{0,500}\b(?:listen|socket|filesystem|fs|request)\s*:/);
  assert.match(desktop, /persistPdvProductImage/);
  assert.match(desktop, /nexus-pdv-mobile-capture:start/);
  assert.match(desktop, /nexus-pdv-mobile-capture:status/);
  assert.match(desktop, /nexus-pdv-mobile-capture:cancel/);
});

test("cashier resolves and renders active product photo with a safe placeholder", () => {
  const app = read("apps/pdv-demo/src/PdvDemoApp.tsx");
  assert.match(app, /activeCashierProduct/);
  assert.match(app, /cashierProductImageUrl/);
  assert.match(app, /desktopProductImageBridge\.url\(/);
  assert.match(app, /data-classic-blue="product-image"/);
  assert.match(app, /Sem foto/);
  assert.match(app, /onError=\{\(\) => setCashierProductImageUrl\(""\)\}/);
});

test("product image upload policy accepts only one JPG PNG or WebP up to 5 MB", () => {
  const policy = { maxFiles: 1, maxFileSize: 5 * 1024 * 1024, accept: ["image/jpeg", "image/png", "image/webp"] };
  const accepted = validateUploadBatch([{ name: "produto.webp", size: 1024, type: "image/webp" }], policy);
  assert.equal(accepted.accepted.length, 1);
  assert.equal(accepted.rejected.length, 0);

  const invalidType = validateUploadBatch([{ name: "produto.gif", size: 1024, type: "image/gif" }], policy);
  assert.deepEqual(invalidType.rejected[0].reasons, ["type-not-allowed"]);

  const oversized = validateUploadBatch([{ name: "produto.jpg", size: 5 * 1024 * 1024 + 1, type: "image/jpeg" }], policy);
  assert.deepEqual(oversized.rejected[0].reasons, ["file-too-large"]);

  const tooMany = validateUploadBatch([
    { name: "a.png", size: 100, type: "image/png" },
    { name: "b.png", size: 100, type: "image/png" }
  ], policy);
  assert.equal(tooMany.accepted.length, 1);
  assert.deepEqual(tooMany.rejected[0].reasons, ["too-many-files"]);
});

test("product image workspace persists locally and confines paths", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pdv-product-image-"));
  try {
    const workspace = await createWorkspace(tempRoot);
    const imageRef = "products/00101/foto.jpg";
    await workspace.writeFile(imageRef, Buffer.from("image-bytes"));
    assert.equal((await workspace.readFile(imageRef)).toString(), "image-bytes");
    await assert.rejects(() => workspace.writeFile("../escape.jpg", Buffer.from("x")), /escapes root/);
    await workspace.remove(imageRef);
    await assert.rejects(() => workspace.readFile(imageRef));
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("classic stylesheet declares the blue operational shell", () => {
  const css = read("apps/pdv-demo/src/pdv-classic-blue.css");
  assert.match(css, /--classic-blue-700/);
  assert.match(css, /\.classic-blue-menubar/);
  assert.match(css, /\.classic-blue-items-table/);
  assert.match(css, /\.classic-blue-function-bar/);
  assert.match(css, /\.classic-blue-statusbar/);
});
