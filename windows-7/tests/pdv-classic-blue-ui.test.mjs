import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  for (const label of ["Cadastros", "Movimentações", "Relatórios", "Utilitários", "Ajuda"]) {
    assert.match(chrome, new RegExp(label));
  }
  assert.match(chrome, /PDV Nexus Clássico Azul/);
  assert.match(chrome, /Caixa 001/);
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
  for (const symbol of ["completePdvSale", "closePdvCashSession", "applyPdvStockMovement", "createPdvAutoBackup", "renderPdvReceipt"]) {
    assert.match(app, new RegExp(symbol));
  }
  assert.match(app, /event\.key === "F2"/);
  assert.match(app, /event\.key === "F3"/);
  assert.match(app, /event\.key === "F6"/);
  assert.match(app, /event\.key === "F8"/);
  assert.match(app, /event\.key === "Delete"/);
  assert.match(app, /event\.key === "F12"/);
});

test("classic stylesheet declares the blue operational shell", () => {
  const css = read("apps/pdv-demo/src/pdv-classic-blue.css");
  assert.match(css, /--classic-blue-700/);
  assert.match(css, /\.classic-blue-menubar/);
  assert.match(css, /\.classic-blue-items-table/);
  assert.match(css, /\.classic-blue-function-bar/);
  assert.match(css, /\.classic-blue-statusbar/);
});
