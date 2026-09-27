import fs from "node:fs";

const file = "windows-10/tests/pdv-product-mobile-capture.test.mjs";
const source = fs.readFileSync(file, "utf8");
const before = `      headers: { "content-type": "image/png", "content-length": "33" }\n    });`;
const after = `      headers: { "content-type": "image/png", "content-length": "33" },\n      chunks: [Buffer.alloc(33, 1)]\n    });`;
if (!source.includes(before)) throw new Error("oversized Content-Length test anchor not found");
fs.writeFileSync(file, source.replace(before, after), "utf8");
