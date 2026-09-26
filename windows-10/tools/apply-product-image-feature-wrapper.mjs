import fs from "node:fs/promises";
import path from "node:path";

const nativeFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (url.includes("/modules/artisys-upload/src/index.mjs")) {
    const source = await fs.readFile(path.join(process.cwd(), "windows-10/apps/nexus-desktop/artisys-upload.mjs"), "utf8");
    return new Response(source, { status: 200, headers: { "content-type": "text/javascript" } });
  }
  if (url.includes("/modules/artisys-files/src/index.mjs")) {
    const source = await fs.readFile(path.join(process.cwd(), "windows-10/apps/nexus-desktop/artisys-files.mjs"), "utf8");
    return new Response(source, { status: 200, headers: { "content-type": "text/javascript" } });
  }
  return nativeFetch(input, init);
};

await import("./apply-product-image-feature.mjs");
