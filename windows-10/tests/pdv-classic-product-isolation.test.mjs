import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import test from "node:test";

const require = createRequire(import.meta.url);
const desktopDir = fileURLToPath(new URL("../apps/nexus-desktop/", import.meta.url));
const identityPath = path.join(desktopDir, "pdv-product-identity.cjs");
const bootstrapPath = path.join(desktopDir, "bootstrap.cjs");
const mainPath = path.join(desktopDir, "main.cjs");
const builderPath = path.join(desktopDir, "electron-builder.cjs");
const pdvBuilderPath = path.join(desktopDir, "electron-builder-pdv.cjs");
const pdvIndexPath = fileURLToPath(new URL("../apps/pdv-demo/index.html", import.meta.url));
const releasePath = fileURLToPath(new URL("../../pdv-release.json", import.meta.url));
const packagePath = fileURLToPath(new URL("../package.json", import.meta.url));

test("classic blue identity module sets isolated name and userData", () => {
  assert.equal(fs.existsSync(identityPath), true, "pdv-product-identity.cjs must exist");
  const { applyPdvProductIdentity } = require(identityPath);
  const calls = [];
  const fakeApp = {
    getPath(name) { assert.equal(name, "appData"); return "C:\\Users\\qa\\AppData\\Roaming"; },
    setName(value) { calls.push(["name", value]); },
    setPath(name, value) { calls.push([name, value]); }
  };
  applyPdvProductIdentity(fakeApp, path.win32);
  assert.deepEqual(calls[0], ["name", "PDV Nexus Clássico Azul"]);
  assert.equal(calls[1][0], "userData");
  assert.equal(path.win32.basename(calls[1][1]), "PDV Nexus Classico Azul");
});

test("electron builder gives pdv-demo an independent Windows identity", () => {
  process.env.NEXUS_APP = "pdv-demo";
  delete require.cache[require.resolve(builderPath)];
  const config = require(builderPath);
  assert.equal(config.appId, "com.artisys.pdvnexus.classicoazul");
  assert.equal(config.productName, "PDV Nexus Clássico Azul");
  assert.equal(config.artifactName, "PDV-Nexus-Classico-Azul-Setup-${version}.${ext}");
  assert.equal(config.nsis.shortcutName, "PDV Nexus Clássico Azul");
});

test("packaged Electron runtime matches the secured Windows 10 dependency", () => {
  process.env.NEXUS_APP = "pdv-demo";
  delete require.cache[require.resolve(builderPath)];
  const config = require(builderPath);
  const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  const securedVersion = String(pkg.devDependencies?.electron || "").replace(/^[~^]/, "");
  assert.equal(securedVersion, "44.4.5");
  assert.equal(config.electronVersion, securedVersion);
});

test("bootstrap applies classic identity before migration touches userData", () => {
  const source = fs.readFileSync(bootstrapPath, "utf8");
  const applyIndex = source.indexOf("applyPdvProductIdentity(app, path)");
  const migrationIndex = source.indexOf("preparePdvVersionMigration({");
  assert.ok(applyIndex >= 0, "bootstrap must apply classic identity");
  assert.ok(migrationIndex >= 0, "bootstrap must retain migration guard");
  assert.ok(applyIndex < migrationIndex, "identity must be applied before migration reads userData");
});

test("runtime title is classic blue from the first rendered frame", () => {
  const source = fs.readFileSync(mainPath, "utf8");
  const html = fs.readFileSync(pdvIndexPath, "utf8");
  assert.match(source, /"pdv-demo":\s*\{\s*title:\s*"PDV Nexus Clássico Azul"/m);
  assert.match(html, /<title>PDV Nexus Clássico Azul<\/title>/);
  assert.doesNotMatch(html, /<title>PDV Nexus<\/title>/);
});

test("pdv package metadata does not embed original updater", () => {
  process.env.NEXUS_APP = "pdv-demo";
  delete require.cache[require.resolve(pdvBuilderPath)];
  const config = require(pdvBuilderPath);
  assert.equal(config.extraMetadata?.pdvUpdateChannel, undefined);
  assert.equal(config.extraMetadata?.pdvUpdateManifestUrl, undefined);
  const release = JSON.parse(fs.readFileSync(releasePath, "utf8"));
  assert.equal(release.version, "0.1.19");
  assert.equal(release.manifestUrl, null);
  assert.deepEqual(release.distribution, {});
  const serialized = JSON.stringify(release);
  assert.doesNotMatch(serialized, /PDVNexus\/releases\/latest\/download/);
  assert.doesNotMatch(serialized, /1M0_SfF1h_zUqEM-Ns1HJ8ZtCMMcbHnFr/);
});