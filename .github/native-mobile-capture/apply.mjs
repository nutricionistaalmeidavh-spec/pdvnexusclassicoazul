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
const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

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

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeImageType(value) {
  return String(value || "").split(";", 1)[0].trim().toLowerCase();
}

function safeMetadataFileName(value) {
  return String(value || "foto")
    .replace(/[\r\n\0]/g, "")
    .slice(0, 180) || "foto";
}

function capturePage(session) {
  const productLabel = session.productName || session.productCode || "Produto";
  return \`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Foto do produto</title>
  <style>body{font-family:system-ui,sans-serif;max-width:38rem;margin:2rem auto;padding:0 1rem}button,input{font-size:1rem}#status{margin-top:1rem}</style>
</head>
<body>
  <h1>Foto do produto</h1>
  <p>\${escapeHtml(productLabel)}</p>
  <input id="photo" type="file" accept="image/*" capture="environment">
  <div id="status" role="status">Escolha ou tire uma foto.</div>
  <script>
    const input = document.getElementById("photo");
    const status = document.getElementById("status");
    input.addEventListener("change", async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      status.textContent = "Enviando...";
      try {
        const response = await fetch(location.pathname + "/image", {
          method: "POST",
          headers: { "Content-Type": file.type, "X-File-Name": file.name },
          body: file
        });
        status.textContent = response.ok ? "Foto recebida. Você pode voltar ao PDV." : "Não foi possível enviar a foto.";
        if (response.ok) input.disabled = true;
      } catch {
        status.textContent = "Falha de rede. Confira se o celular continua na mesma Wi-Fi.";
      }
    });
  </script>
</body>
</html>\`;
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
  const tokens = new Map();
  let server = null;
  let serverPort = null;

  function refreshSession(session) {
    if (session.state === "waiting" && now() >= session.expiresAtMs) session.state = "expired";
    return session;
  }

  function findByToken(token) {
    const sessionId = tokens.get(String(token || ""));
    if (!sessionId) return null;
    const session = sessions.get(sessionId);
    return session ? refreshSession(session) : null;
  }

  function getSession(sessionId) {
    const session = sessions.get(String(sessionId || ""));
    if (!session) throw new Error("Sessão de captura não encontrada.");
    return refreshSession(session);
  }

  function writeText(response, status, body, contentType = "text/plain; charset=utf-8") {
    if (response.headersSent || response.writableEnded) return;
    response.writeHead(status, { "content-type": contentType, "cache-control": "no-store" });
    response.end(body);
  }

  function writeJson(response, status, payload) {
    writeText(response, status, JSON.stringify(payload), "application/json; charset=utf-8");
  }

  async function readLimitedBody(request, response, limit) {
    const declared = Number(request.headers["content-length"] || 0);
    if (Number.isFinite(declared) && declared > limit) {
      request.resume();
      writeJson(response, 413, { ok: false, code: "file-too-large" });
      return null;
    }

    const chunks = [];
    let total = 0;
    for await (const chunk of request) {
      total += chunk.length;
      if (total > limit) {
        writeJson(response, 413, { ok: false, code: "file-too-large" });
        return null;
      }
      chunks.push(chunk);
    }
    return Buffer.concat(chunks, total);
  }

  async function handleRequest(request, response) {
    const pathname = new URL(request.url || "/", "http://local.invalid").pathname;
    const match = pathname.match(/^\/capture\/([a-f0-9]{32,})(\/image)?\/?$/i);
    if (!match) {
      writeText(response, 404, "Not found");
      return;
    }

    const session = findByToken(match[1]);
    if (!session) {
      writeText(response, 404, "Not found");
      return;
    }

    const isImageEndpoint = Boolean(match[2]);
    if (session.state === "expired" || session.state === "cancelled") {
      request.resume();
      writeJson(response, 410, { ok: false, code: session.state });
      return;
    }

    if (!isImageEndpoint && request.method === "GET") {
      writeText(response, 200, capturePage(session), "text/html; charset=utf-8");
      return;
    }

    if (!isImageEndpoint || request.method !== "POST") {
      request.resume();
      writeText(response, 404, "Not found");
      return;
    }

    if (session.state === "received") {
      request.resume();
      writeJson(response, 409, { ok: false, code: "already-received" });
      return;
    }

    const type = normalizeImageType(request.headers["content-type"]);
    if (!ACCEPTED_IMAGE_TYPES.has(type)) {
      request.resume();
      writeJson(response, 415, { ok: false, code: "type-not-allowed" });
      return;
    }

    const data = await readLimitedBody(request, response, session.maxBytes);
    if (!data || response.writableEnded) return;

    try {
      const result = await saveImage({
        productCode: session.productCode,
        fileName: safeMetadataFileName(request.headers["x-file-name"]),
        type,
        data
      });
      session.state = "received";
      session.imageRef = result?.imageRef || "";
      session.imageUrl = result?.imageUrl || "";
      writeJson(response, 201, { ok: true });
    } catch {
      writeJson(response, 500, { ok: false, code: "save-failed" });
    }
  }

  async function ensureServer() {
    if (server?.listening && serverPort) return serverPort;
    server = http.createServer((request, response) => {
      void handleRequest(request, response).catch(() => {
        if (!response.writableEnded) writeJson(response, 500, { ok: false, code: "request-failed" });
      });
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
    tokens.set(token, sessionId);
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
