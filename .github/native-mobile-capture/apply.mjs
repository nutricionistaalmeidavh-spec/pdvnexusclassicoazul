import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const desktopDir = path.join(root, "windows-10", "apps", "nexus-desktop");
const servicePath = path.join(desktopDir, "pdv-product-mobile-capture.mjs");

const serviceSource = `import crypto from "node:crypto";
import http from "node:http";
import os from "node:os";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const qrcode = require("qrcode-generator");

const DEFAULT_SESSION_TTL_MS = 5 * 60 * 1000;
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

function isPrivateIpv4(address) {
  const parts = String(address || "").split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  if (parts[0] === 10) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  return false;
}

export function resolvePrivateIpv4(networkInterfaces = os.networkInterfaces()) {
  for (const entries of Object.values(networkInterfaces || {})) {
    for (const entry of entries || []) {
      const family = entry?.family;
      if ((family === "IPv4" || family === 4) && !entry?.internal && isPrivateIpv4(entry?.address)) {
        return entry.address;
      }
    }
  }
  return null;
}

function makeQrDataUrl(value) {
  const qr = qrcode(0, "M");
  qr.addData(value);
  qr.make();
  return qr.createDataURL(5, 3);
}

function randomHex(bytes) {
  return crypto.randomBytes(bytes).toString("hex");
}

export function createPdvProductMobileCaptureService({
  saveImage,
  sessionTtlMs = DEFAULT_SESSION_TTL_MS,
  maxBytes = DEFAULT_MAX_BYTES,
  hostResolver = resolvePrivateIpv4,
  now = () => Date.now()
} = {}) {
  if (typeof saveImage !== "function") throw new Error("saveImage é obrigatório para captura móvel.");

  const sessions = new Map();
  let server = null;
  let serverPort = null;

  async function ensureServer() {
    if (server?.listening && serverPort) return serverPort;
    server = http.createServer((_request, response) => {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
    });
    await new Promise((resolve, reject) => {
      const onError = (error) => { server?.off("listening", onListening); reject(error); };
      const onListening = () => { server?.off("error", onError); resolve(); };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(0, "0.0.0.0");
    });
    const address = server.address();
    serverPort = typeof address === "object" && address ? address.port : null;
    if (!serverPort) throw new Error("Não foi possível iniciar o servidor local de captura.");
    return serverPort;
  }

  function refreshSession(session) {
    if (session.state === "waiting" && now() >= session.expiresAtMs) session.state = "expired";
    return session;
  }

  function getSession(sessionId) {
    const session = sessions.get(String(sessionId || ""));
    if (!session) throw new Error("Sessão de captura não encontrada.");
    return refreshSession(session);
  }

  async function start(productCode, productName = "") {
    const host = hostResolver();
    if (!host) throw new Error("Nenhum IPv4 privado de rede local está disponível para captura pelo celular.");
    const port = await ensureServer();
    const createdAtMs = now();
    const sessionId = randomHex(16);
    const token = randomHex(24);
    const expiresAtMs = createdAtMs + sessionTtlMs;
    const url = \`http://\${host}:\${port}/capture/\${token}\`;
    const session = {
      sessionId,
      token,
      productCode: String(productCode || "novo-produto"),
      productName: String(productName || ""),
      createdAtMs,
      expiresAtMs,
      state: "waiting",
      maxBytes
    };
    sessions.set(sessionId, session);
    return {
      sessionId,
      url,
      qrDataUrl: makeQrDataUrl(url),
      expiresAt: new Date(expiresAtMs).toISOString()
    };
  }

  async function status(sessionId) {
    const session = getSession(sessionId);
    const result = { state: session.state };
    if (session.imageRef) result.imageRef = session.imageRef;
    if (session.imageUrl) result.imageUrl = session.imageUrl;
    return result;
  }

  async function cancel(sessionId) {
    const session = getSession(sessionId);
    if (session.state === "waiting") session.state = "cancelled";
    return true;
  }

  async function close() {
    if (!server) return;
    const current = server;
    server = null;
    serverPort = null;
    if (!current.listening) return;
    await new Promise((resolve) => current.close(() => resolve()));
  }

  return { start, status, cancel, close };
}
`;

fs.writeFileSync(servicePath, serviceSource, "utf8");
execFileSync(
  process.platform === "win32" ? "npm.cmd" : "npm",
  ["install", "qrcode-generator@2.0.4", "--workspace", "@nexus-core/nexus-desktop", "--save-exact"],
  { cwd: path.join(root, "windows-10"), stdio: "inherit" }
);
