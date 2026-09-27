import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import {
  createPdvProductMobileCaptureService,
  resolvePrivateIpv4
} from "../apps/nexus-desktop/pdv-product-mobile-capture.mjs";

function localhostUrl(advertisedUrl, suffix = "") {
  const parsed = new URL(advertisedUrl);
  return `http://127.0.0.1:${parsed.port}${parsed.pathname}${suffix}`;
}

function request({ url, method = "GET", headers = {}, chunks = [] }) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method, headers }, (res) => {
      const body = [];
      res.on("data", (chunk) => body.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(body).toString("utf8") }));
    });
    req.on("error", reject);
    for (const chunk of chunks) req.write(chunk);
    req.end();
  });
}

test("resolvePrivateIpv4 selects RFC1918 IPv4 and ignores loopback/public addresses", () => {
  assert.equal(resolvePrivateIpv4({
    Loopback: [{ family: "IPv4", address: "127.0.0.1", internal: true }],
    Public: [{ family: "IPv4", address: "203.0.113.8", internal: false }],
    Lan: [{ family: "IPv4", address: "192.168.1.20", internal: false }]
  }), "192.168.1.20");
  assert.equal(resolvePrivateIpv4({
    Lan: [{ family: 4, address: "172.20.10.4", internal: false }]
  }), "172.20.10.4");
  assert.equal(resolvePrivateIpv4({
    Public: [{ family: "IPv4", address: "8.8.8.8", internal: false }]
  }), null);
});

test("mobile capture session is random, expires after five minutes and can be cancelled", async () => {
  let now = Date.parse("2026-09-26T20:00:00-03:00");
  const service = createPdvProductMobileCaptureService({
    saveImage: async () => ({ imageRef: "products/00123/mobile.jpg" }),
    sessionTtlMs: 5 * 60 * 1000,
    maxBytes: 5 * 1024 * 1024,
    hostResolver: () => "192.168.1.20",
    now: () => now
  });

  try {
    const first = await service.start("00123", "Produto Teste");
    assert.match(first.sessionId, /^[a-f0-9]{24,}$/i);
    assert.match(first.url, /^http:\/\/192\.168\.1\.20:\d+\/capture\/[a-f0-9]{32,}$/i);
    assert.match(first.qrDataUrl, /^data:image\//);
    assert.equal(first.expiresAt, new Date(now + 5 * 60 * 1000).toISOString());
    assert.deepEqual(await service.status(first.sessionId), { state: "waiting" });

    const second = await service.start("00999", "Outro Produto");
    assert.notEqual(second.sessionId, first.sessionId);
    assert.equal(await service.cancel(second.sessionId), true);
    assert.deepEqual(await service.status(second.sessionId), { state: "cancelled" });

    now += 5 * 60 * 1000 + 1;
    assert.deepEqual(await service.status(first.sessionId), { state: "expired" });
  } finally {
    await service.close();
  }
});

test("start fails cleanly when no private LAN IPv4 is available", async () => {
  const service = createPdvProductMobileCaptureService({
    saveImage: async () => ({ imageRef: "unused" }),
    hostResolver: () => null
  });

  await assert.rejects(
    () => service.start("00123", "Produto Teste"),
    /rede local|IPv4 privado/i
  );
  await assert.rejects(() => service.status("missing"), /sessão|session/i);
  await service.close();
});

test("GET capture page is local-only HTML with rear camera input and unknown endpoints return 404", async () => {
  const service = createPdvProductMobileCaptureService({
    saveImage: async () => ({ imageRef: "unused" }),
    hostResolver: () => "192.168.1.20"
  });
  try {
    const session = await service.start("00123", "Produto <Teste>");
    const page = await request({ url: localhostUrl(session.url) });
    assert.equal(page.status, 200);
    assert.match(page.headers["content-type"] || "", /text\/html/);
    assert.match(page.body, /type="file"/);
    assert.match(page.body, /accept="image\/\*"/);
    assert.match(page.body, /capture="environment"/);
    assert.match(page.body, /Produto &lt;Teste&gt;/);
    assert.doesNotMatch(page.body, /cliente|venda|configura/i);

    const parsed = new URL(session.url);
    const missing = await request({ url: `http://127.0.0.1:${parsed.port}/anything-else` });
    assert.equal(missing.status, 404);
  } finally {
    await service.close();
  }
});

test("valid JPEG upload is accepted once and exposes only imageRef/imageUrl through status", async () => {
  const saves = [];
  const service = createPdvProductMobileCaptureService({
    saveImage: async (input) => {
      saves.push(input);
      return { imageRef: "products/00123/mobile.jpg", imageUrl: "file:///safe/mobile.jpg", fileName: "foto.jpg" };
    },
    hostResolver: () => "192.168.1.20"
  });
  try {
    const session = await service.start("00123", "Produto Teste");
    const payload = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 1, 2, 3]);
    const uploaded = await request({
      url: localhostUrl(session.url, "/image"),
      method: "POST",
      headers: { "content-type": "image/jpeg", "x-file-name": "../../foto.jpg", "content-length": String(payload.length) },
      chunks: [payload]
    });
    assert.equal(uploaded.status, 201);
    assert.equal(saves.length, 1);
    assert.equal(saves[0].productCode, "00123");
    assert.equal(saves[0].type, "image/jpeg");
    assert.equal(Buffer.compare(saves[0].data, payload), 0);
    assert.deepEqual(await service.status(session.sessionId), {
      state: "received",
      imageRef: "products/00123/mobile.jpg",
      imageUrl: "file:///safe/mobile.jpg"
    });
    assert.doesNotMatch(uploaded.body, /file:\/\/|[A-Z]:\\/i);

    const reused = await request({
      url: localhostUrl(session.url, "/image"), method: "POST",
      headers: { "content-type": "image/jpeg" }, chunks: [payload]
    });
    assert.equal(reused.status, 409);
    assert.equal(saves.length, 1);
  } finally {
    await service.close();
  }
});

test("upload rejects invalid MIME, oversized Content-Length and oversized chunked bodies", async () => {
  let saves = 0;
  const service = createPdvProductMobileCaptureService({
    saveImage: async () => { saves += 1; return { imageRef: "unexpected" }; },
    hostResolver: () => "192.168.1.20",
    maxBytes: 32
  });
  try {
    const invalidMime = await service.start("00123", "Produto Teste");
    const invalid = await request({
      url: localhostUrl(invalidMime.url, "/image"), method: "POST",
      headers: { "content-type": "image/gif" }, chunks: [Buffer.from("GIF89a")]
    });
    assert.equal(invalid.status, 415);

    const oversizedLength = await service.start("00124", "Produto 2");
    const tooLong = await request({
      url: localhostUrl(oversizedLength.url, "/image"), method: "POST",
      headers: { "content-type": "image/png", "content-length": "33" },
      chunks: [Buffer.alloc(33, 1)]
    });
    assert.equal(tooLong.status, 413);

    const oversizedChunked = await service.start("00125", "Produto 3");
    const chunked = await request({
      url: localhostUrl(oversizedChunked.url, "/image"), method: "POST",
      headers: { "content-type": "image/webp" },
      chunks: [Buffer.alloc(20, 1), Buffer.alloc(20, 2)]
    });
    assert.equal(chunked.status, 413);
    assert.equal(saves, 0);
  } finally {
    await service.close();
  }
});

test("expired and cancelled tokens return 410 and persistence failures do not publish a partial image", async () => {
  let now = 1_000;
  let failSave = true;
  const service = createPdvProductMobileCaptureService({
    saveImage: async () => {
      if (failSave) throw new Error("disk full C:\\secret\\absolute");
      return { imageRef: "products/ok.jpg" };
    },
    hostResolver: () => "192.168.1.20",
    sessionTtlMs: 100,
    now: () => now
  });
  try {
    const expired = await service.start("00123", "Produto");
    now += 101;
    const expiredPost = await request({
      url: localhostUrl(expired.url, "/image"), method: "POST",
      headers: { "content-type": "image/jpeg" }, chunks: [Buffer.from([1])]
    });
    assert.equal(expiredPost.status, 410);

    const cancelled = await service.start("00124", "Produto");
    await service.cancel(cancelled.sessionId);
    const cancelledPost = await request({
      url: localhostUrl(cancelled.url, "/image"), method: "POST",
      headers: { "content-type": "image/jpeg" }, chunks: [Buffer.from([1])]
    });
    assert.equal(cancelledPost.status, 410);

    const failing = await service.start("00125", "Produto");
    const failed = await request({
      url: localhostUrl(failing.url, "/image"), method: "POST",
      headers: { "content-type": "image/jpeg" }, chunks: [Buffer.from([1])]
    });
    assert.equal(failed.status, 500);
    assert.doesNotMatch(failed.body, /C:\\secret|disk full/i);
    assert.deepEqual(await service.status(failing.sessionId), { state: "waiting" });
    failSave = false;
  } finally {
    await service.close();
  }
});

// GREEN checkpoint for the HTTP/session security contract.
