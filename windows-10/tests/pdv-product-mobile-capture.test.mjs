import test from "node:test";
import assert from "node:assert/strict";
import {
  createPdvProductMobileCaptureService,
  resolvePrivateIpv4
} from "../apps/nexus-desktop/pdv-product-mobile-capture.mjs";

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
