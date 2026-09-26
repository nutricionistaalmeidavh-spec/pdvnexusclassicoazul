import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

const require = createRequire(import.meta.url);
const desktopDir = fileURLToPath(new URL("../apps/nexus-desktop/", import.meta.url));
function load(name) {
  const target = path.join(desktopDir, name);
  delete require.cache[require.resolve(target)];
  return require(target);
}

test("Windows 7 builder remains classic-blue and updater-free", () => {
  const config = load("electron-builder-pdv-win7.cjs");
  assert.equal(config.appId, "com.artisys.pdvnexus.classicoazul");
  assert.equal(config.productName, "PDV Nexus Clássico Azul");
  assert.equal(config.extraMetadata?.pdvUpdateChannel, undefined);
  assert.equal(config.extraMetadata?.pdvUpdateManifestUrl, undefined);
  assert.equal(config.artifactName, "PDV-Nexus-Classico-Azul-Windows-7-Setup-${version}.${ext}");
});

test("Windows 8 x86 builder remains classic-blue and updater-free", () => {
  const config = load("electron-builder-pdv-win8-x86.cjs");
  assert.equal(config.appId, "com.artisys.pdvnexus.classicoazul");
  assert.equal(config.productName, "PDV Nexus Clássico Azul");
  assert.equal(config.extraMetadata?.pdvUpdateChannel, undefined);
  assert.equal(config.extraMetadata?.pdvUpdateManifestUrl, undefined);
  assert.equal(config.artifactName, "PDV-Nexus-Classico-Azul-Windows-8-32bit-Setup-${version}.${ext}");
});
