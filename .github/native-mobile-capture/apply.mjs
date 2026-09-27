import fs from "node:fs";

function replaceOrFail(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`${label} anchor not found`);
  return source.replace(before, after);
}

function replaceBetween(source, startMarker, endMarker, replacement, label) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error(`${label} range not found`);
  return source.slice(0, start) + replacement + source.slice(end);
}

const mainPath = "windows-10/apps/nexus-desktop/main.cjs";
let main = fs.readFileSync(mainPath, "utf8");
main = replaceOrFail(
  main,
  "let pdvProductImageModulesPromise = null;\nconst openSerialPorts = new Map();",
  "let pdvProductImageModulesPromise = null;\nlet pdvProductMobileCaptureServicePromise = null;\nconst openSerialPorts = new Map();",
  "main mobile service state"
);
main = replaceOrFail(
  main,
  `function loadPdvProductImageModules() {\n  if (!pdvProductImageModulesPromise) {\n    pdvProductImageModulesPromise = Promise.all([\n      import(pathToFileURL(path.join(__dirname, "artisys-upload.mjs")).href),\n      import(pathToFileURL(path.join(__dirname, "artisys-files.mjs")).href)\n    ]).then(([upload, files]) => ({ upload, files }));\n  }\n  return pdvProductImageModulesPromise;\n}\n`,
  `function loadPdvProductImageModules() {\n  if (!pdvProductImageModulesPromise) {\n    pdvProductImageModulesPromise = Promise.all([\n      import(pathToFileURL(path.join(__dirname, "artisys-upload.mjs")).href),\n      import(pathToFileURL(path.join(__dirname, "artisys-files.mjs")).href)\n    ]).then(([upload, files]) => ({ upload, files }));\n  }\n  return pdvProductImageModulesPromise;\n}\n\nfunction getPdvProductMobileCaptureService() {\n  if (!pdvProductMobileCaptureServicePromise) {\n    pdvProductMobileCaptureServicePromise = import(pathToFileURL(path.join(__dirname, "pdv-product-mobile-capture.mjs")).href)\n      .then(({ createPdvProductMobileCaptureService }) => createPdvProductMobileCaptureService({ saveImage: persistPdvProductImage }));\n  }\n  return pdvProductMobileCaptureServicePromise;\n}\n`,
  "main loader"
);
const replacementImageFlow = `async function persistPdvProductImage({ productCode, fileName, type, data }) {\n  const payload = Buffer.isBuffer(data) ? data : Buffer.from(data || []);\n  const safeFileName = path.basename(String(fileName || "foto"));\n  const { upload, files } = await loadPdvProductImageModules();\n  const validation = upload.validateUploadBatch([{ name: safeFileName, size: payload.length, type: String(type || ""), lastModified: Date.now() }], {\n    maxFiles: 1,\n    maxFileSize: PDV_PRODUCT_IMAGE_MAX_BYTES,\n    accept: PDV_PRODUCT_IMAGE_TYPES\n  });\n  if (validation.rejected.length) {\n    const reasons = validation.rejected[0].reasons.join(", ");\n    throw new Error(\`Foto recusada (\${reasons}). Use JPG, PNG ou WebP com até 5 MB.\`);\n  }\n\n  const extensionByType = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };\n  const extension = extensionByType[String(type || "")] || ".bin";\n  const workspace = await files.createWorkspace(getPdvProductImageDir());\n  const uniqueName = \`\${Date.now()}-\${Math.random().toString(36).slice(2, 10)}\${extension}\`;\n  const imageRef = path.posix.join("products", safeProductImageFolder(productCode), uniqueName);\n  await workspace.writeFile(imageRef, payload);\n  const absolute = files.resolveInsideRoot(workspace.root, imageRef);\n  return { imageRef, imageUrl: pathToFileURL(absolute).href, fileName: safeFileName };\n}\n\nasync function selectPdvProductImage(productCode) {\n  const result = mainWindowRef\n    ? await dialog.showOpenDialog(mainWindowRef, { properties: ["openFile"], filters: [{ name: "Imagens", extensions: ["jpg", "jpeg", "png", "webp"] }] })\n    : await dialog.showOpenDialog({ properties: ["openFile"], filters: [{ name: "Imagens", extensions: ["jpg", "jpeg", "png", "webp"] }] });\n  if (result.canceled || !result.filePaths[0]) return { canceled: true };\n\n  const selectedPath = result.filePaths[0];\n  const persisted = await persistPdvProductImage({\n    productCode,\n    fileName: path.basename(selectedPath),\n    type: resolveProductImageMime(selectedPath),\n    data: fs.readFileSync(selectedPath)\n  });\n  return { canceled: false, ...persisted };\n}\n\n`;
main = replaceBetween(main, "async function selectPdvProductImage(productCode) {", "async function resolvePdvProductImageUrl(imageRef) {", replacementImageFlow, "main image flow");
main = replaceOrFail(
  main,
  `ipcMain.handle("nexus-pdv-product-image:select", (_event, productCode) => selectPdvProductImage(productCode));\nipcMain.handle("nexus-pdv-product-image:url", (_event, imageRef) => resolvePdvProductImageUrl(imageRef));\nipcMain.handle("nexus-pdv-product-image:remove", (_event, imageRef) => removePdvProductImage(imageRef));\n`,
  `ipcMain.handle("nexus-pdv-product-image:select", (_event, productCode) => selectPdvProductImage(productCode));\nipcMain.handle("nexus-pdv-product-image:url", (_event, imageRef) => resolvePdvProductImageUrl(imageRef));\nipcMain.handle("nexus-pdv-product-image:remove", (_event, imageRef) => removePdvProductImage(imageRef));\nipcMain.handle("nexus-pdv-mobile-capture:start", async (_event, productCode, productName) => (await getPdvProductMobileCaptureService()).start(productCode, productName));\nipcMain.handle("nexus-pdv-mobile-capture:status", async (_event, sessionId) => (await getPdvProductMobileCaptureService()).status(sessionId));\nipcMain.handle("nexus-pdv-mobile-capture:cancel", async (_event, sessionId) => (await getPdvProductMobileCaptureService()).cancel(sessionId));\n`,
  "main IPC"
);
main = replaceOrFail(
  main,
  `  if (pdvSyncServerRef) {\n    pdvSyncServerRef.close();`,
  `  if (pdvProductMobileCaptureServicePromise) {\n    void pdvProductMobileCaptureServicePromise.then((service) => service.close()).catch(() => {});\n    pdvProductMobileCaptureServicePromise = null;\n  }\n  if (pdvSyncServerRef) {\n    pdvSyncServerRef.close();`,
  "main shutdown"
);
fs.writeFileSync(mainPath, main, "utf8");

const preloadPath = "windows-10/apps/nexus-desktop/preload.cjs";
let preload = fs.readFileSync(preloadPath, "utf8");
preload = replaceOrFail(
  preload,
  `  pdvProductImage: {\n    select: (productCode) => ipcRenderer.invoke("nexus-pdv-product-image:select", productCode),\n    url: (imageRef) => ipcRenderer.invoke("nexus-pdv-product-image:url", imageRef),\n    remove: (imageRef) => ipcRenderer.invoke("nexus-pdv-product-image:remove", imageRef)\n  },\n`,
  `  pdvProductImage: {\n    select: (productCode) => ipcRenderer.invoke("nexus-pdv-product-image:select", productCode),\n    url: (imageRef) => ipcRenderer.invoke("nexus-pdv-product-image:url", imageRef),\n    remove: (imageRef) => ipcRenderer.invoke("nexus-pdv-product-image:remove", imageRef)\n  },\n  pdvMobileCapture: {\n    start: (productCode, productName) => ipcRenderer.invoke("nexus-pdv-mobile-capture:start", productCode, productName),\n    status: (sessionId) => ipcRenderer.invoke("nexus-pdv-mobile-capture:status", sessionId),\n    cancel: (sessionId) => ipcRenderer.invoke("nexus-pdv-mobile-capture:cancel", sessionId)\n  },\n`,
  "preload bridge"
);
fs.writeFileSync(preloadPath, preload, "utf8");

const runtimePath = "windows-10/packages/desktop-runtime/src/index.ts";
let runtime = fs.readFileSync(runtimePath, "utf8");
runtime = replaceOrFail(
  runtime,
  `export interface DesktopPdvProductImageBridge {\n  select(productCode: string): Promise<DesktopPdvProductImageResult>;\n  url(imageRef: string): Promise<string>;\n  remove(imageRef: string): Promise<boolean>;\n}\n`,
  `export interface DesktopPdvProductImageBridge {\n  select(productCode: string): Promise<DesktopPdvProductImageResult>;\n  url(imageRef: string): Promise<string>;\n  remove(imageRef: string): Promise<boolean>;\n}\n\nexport interface DesktopPdvMobileCaptureSession {\n  sessionId: string;\n  url: string;\n  qrDataUrl: string;\n  expiresAt: string;\n}\n\nexport interface DesktopPdvMobileCaptureStatus {\n  state: "waiting" | "received" | "expired" | "cancelled";\n  imageRef?: string;\n  imageUrl?: string;\n}\n\nexport interface DesktopPdvMobileCaptureBridge {\n  start(productCode: string, productName?: string): Promise<DesktopPdvMobileCaptureSession>;\n  status(sessionId: string): Promise<DesktopPdvMobileCaptureStatus>;\n  cancel(sessionId: string): Promise<boolean>;\n}\n`,
  "runtime interfaces"
);
runtime = replaceOrFail(
  runtime,
  `      pdvProductImage?: DesktopPdvProductImageBridge;\n      printing?: DesktopPrintingBridge;`,
  `      pdvProductImage?: DesktopPdvProductImageBridge;\n      pdvMobileCapture?: DesktopPdvMobileCaptureBridge;\n      printing?: DesktopPrintingBridge;`,
  "runtime window bridge"
);
runtime = replaceOrFail(
  runtime,
  `export function getDesktopPdvProductImageBridge(): DesktopPdvProductImageBridge | undefined {\n  return window.nexusDesktop?.pdvProductImage;\n}\n`,
  `export function getDesktopPdvProductImageBridge(): DesktopPdvProductImageBridge | undefined {\n  return window.nexusDesktop?.pdvProductImage;\n}\n\nexport function getDesktopPdvMobileCaptureBridge(): DesktopPdvMobileCaptureBridge | undefined {\n  return window.nexusDesktop?.pdvMobileCapture;\n}\n`,
  "runtime getter"
);
fs.writeFileSync(runtimePath, runtime, "utf8");
