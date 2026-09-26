import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

const require = createRequire(import.meta.url);
const builtIndexUrl = new URL("../apps/pdv-demo/dist/index.html", import.meta.url);
const builderPath = fileURLToPath(new URL("../apps/nexus-desktop/electron-builder.cjs", import.meta.url));

test("o build do PDV usa recursos relativos compativeis com Electron file://", async () => {
  const html = await readFile(builtIndexUrl, "utf8");
  const resourceUrls = [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)].map(
    ([, resourceUrl]) => resourceUrl,
  );

  assert.ok(resourceUrls.length > 0, "o HTML precisa carregar ao menos um recurso");
  assert.equal(
    resourceUrls.some((resourceUrl) => resourceUrl.startsWith("/")),
    false,
    `recursos absolutos quebram no Electron: ${resourceUrls.join(", ")}`,
  );
});

test("o pacote do PDV inclui o modulo de identidade exigido pelo bootstrap", () => {
  process.env.NEXUS_APP = "pdv-demo";
  delete require.cache[require.resolve(builderPath)];
  const config = require(builderPath);
  assert.ok(
    config.files.includes("pdv-product-identity.cjs"),
    "electron-builder precisa empacotar pdv-product-identity.cjs porque bootstrap.cjs faz require dele",
  );
});
