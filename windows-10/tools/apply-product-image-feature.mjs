import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const w10 = path.join(root, "windows-10");

async function read(relative) {
  return (await fs.readFile(path.join(w10, relative), "utf8")).replace(/\r\n/g, "\n");
}

async function write(relative, content) {
  const target = path.join(w10, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, content, "utf8");
}

function replaceOnce(source, needle, replacement, label) {
  const first = source.indexOf(needle);
  if (first < 0) throw new Error(`Missing replacement anchor: ${label}`);
  if (source.indexOf(needle, first + needle.length) >= 0) throw new Error(`Ambiguous replacement anchor: ${label}`);
  return source.slice(0, first) + replacement + source.slice(first + needle.length);
}

async function vendorModule(remotePath, localName) {
  const sha = "9bca8b29f3a5875433b42d01ceb84e743dabba82";
  const url = `https://raw.githubusercontent.com/nutricionistaalmeidavh-spec/utilidades/${sha}/${remotePath}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to vendor ${remotePath}: ${response.status}`);
  const source = await response.text();
  const header = `// Vendored from nutricionistaalmeidavh-spec/utilidades@${sha}/${remotePath}\n// Core local/self-hosted: no paid service or runtime network dependency.\n`;
  await write(`apps/nexus-desktop/${localName}`, header + source.replace(/\r\n/g, "\n"));
}

await vendorModule("modules/artisys-upload/src/index.mjs", "artisys-upload.mjs");
await vendorModule("modules/artisys-files/src/index.mjs", "artisys-files.mjs");

{
  const file = "apps/nexus-desktop/electron-builder.cjs";
  let source = await read(file);
  source = replaceOnce(
    source,
    '    "pdv-product-identity.cjs",\n    "preload.cjs",',
    '    "pdv-product-identity.cjs",\n    "artisys-upload.mjs",\n    "artisys-files.mjs",\n    "preload.cjs",',
    "builder ships reusable image modules"
  );
  await write(file, source);
}

{
  const file = "apps/nexus-desktop/preload.cjs";
  let source = await read(file);
  source = replaceOnce(
    source,
    '  pdvBackup: {\n    list: () => ipcRenderer.invoke("nexus-pdv-backup:list"),\n    write: (options) => ipcRenderer.invoke("nexus-pdv-backup:write", options)\n  },\n  printing:',
    '  pdvBackup: {\n    list: () => ipcRenderer.invoke("nexus-pdv-backup:list"),\n    write: (options) => ipcRenderer.invoke("nexus-pdv-backup:write", options)\n  },\n  pdvProductImage: {\n    select: (productCode) => ipcRenderer.invoke("nexus-pdv-product-image:select", productCode),\n    url: (imageRef) => ipcRenderer.invoke("nexus-pdv-product-image:url", imageRef),\n    remove: (imageRef) => ipcRenderer.invoke("nexus-pdv-product-image:remove", imageRef)\n  },\n  printing:',
    "preload product image bridge"
  );
  await write(file, source);
}

{
  const file = "packages/desktop-runtime/src/index.ts";
  let source = await read(file);
  source = replaceOnce(
    source,
    'export interface DesktopPrintingBridge {\n  receipt(options: DesktopReceiptPrintOptions): Promise<{ success: boolean; failureReason: string }>;\n}\n',
    'export interface DesktopPrintingBridge {\n  receipt(options: DesktopReceiptPrintOptions): Promise<{ success: boolean; failureReason: string }>;\n}\n\nexport interface DesktopPdvProductImageResult {\n  canceled: boolean;\n  imageRef?: string;\n  imageUrl?: string;\n  fileName?: string;\n}\n\nexport interface DesktopPdvProductImageBridge {\n  select(productCode: string): Promise<DesktopPdvProductImageResult>;\n  url(imageRef: string): Promise<string>;\n  remove(imageRef: string): Promise<boolean>;\n}\n',
    "desktop image bridge type"
  );
  source = replaceOnce(
    source,
    '      pdvBackup?: DesktopPdvBackupBridge;\n      printing?: DesktopPrintingBridge;',
    '      pdvBackup?: DesktopPdvBackupBridge;\n      pdvProductImage?: DesktopPdvProductImageBridge;\n      printing?: DesktopPrintingBridge;',
    "window bridge image field"
  );
  source = replaceOnce(
    source,
    'export function getDesktopPdvBackupBridge(): DesktopPdvBackupBridge | undefined {\n  return window.nexusDesktop?.pdvBackup;\n}\n\nexport function getDesktopPrintingBridge()',
    'export function getDesktopPdvBackupBridge(): DesktopPdvBackupBridge | undefined {\n  return window.nexusDesktop?.pdvBackup;\n}\n\nexport function getDesktopPdvProductImageBridge(): DesktopPdvProductImageBridge | undefined {\n  return window.nexusDesktop?.pdvProductImage;\n}\n\nexport function getDesktopPrintingBridge()',
    "image bridge getter"
  );
  await write(file, source);
}

{
  const file = "apps/nexus-desktop/main.cjs";
  let source = await read(file);
  source = replaceOnce(
    source,
    'const { app, BrowserWindow, ipcMain, safeStorage, session } = require("electron");',
    'const { app, BrowserWindow, dialog, ipcMain, safeStorage, session } = require("electron");',
    "electron dialog import"
  );
  source = replaceOnce(
    source,
    'const path = require("node:path");\nconst { SerialPort }',
    'const path = require("node:path");\nconst { pathToFileURL } = require("node:url");\nconst { SerialPort }',
    "pathToFileURL import"
  );
  source = replaceOnce(
    source,
    'const PDV_BACKUP_DIR = "pdv-backups";\nconst APP_BACKUP_DIR = "app-backups";',
    'const PDV_BACKUP_DIR = "pdv-backups";\nconst PDV_PRODUCT_IMAGE_DIR = "pdv-product-images";\nconst PDV_PRODUCT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;\nconst PDV_PRODUCT_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];\nconst APP_BACKUP_DIR = "app-backups";\nlet pdvProductImageModulesPromise = null;',
    "product image constants"
  );
  source = replaceOnce(
    source,
    'function getPdvBackupDir() {\n  return path.join(app.getPath("userData"), PDV_BACKUP_DIR);\n}\n\nfunction getAppBackupDir(scope)',
    `function getPdvBackupDir() {\n  return path.join(app.getPath("userData"), PDV_BACKUP_DIR);\n}\n\nfunction getPdvProductImageDir() {\n  return path.join(app.getPath("userData"), PDV_PRODUCT_IMAGE_DIR);\n}\n\nfunction loadPdvProductImageModules() {\n  if (!pdvProductImageModulesPromise) {\n    pdvProductImageModulesPromise = Promise.all([\n      import(pathToFileURL(path.join(__dirname, "artisys-upload.mjs")).href),\n      import(pathToFileURL(path.join(__dirname, "artisys-files.mjs")).href)\n    ]).then(([upload, files]) => ({ upload, files }));\n  }\n  return pdvProductImageModulesPromise;\n}\n\nfunction resolveProductImageMime(filePath) {\n  const extension = path.extname(filePath).toLowerCase();\n  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";\n  if (extension === ".png") return "image/png";\n  if (extension === ".webp") return "image/webp";\n  return "application/octet-stream";\n}\n\nfunction safeProductImageFolder(productCode) {\n  return String(productCode || "novo-produto").replace(/[^a-z0-9_-]/gi, "-").replace(/^-+|-+$/g, "") || "novo-produto";\n}\n\nasync function selectPdvProductImage(productCode) {\n  const result = mainWindowRef\n    ? await dialog.showOpenDialog(mainWindowRef, { properties: ["openFile"], filters: [{ name: "Imagens", extensions: ["jpg", "jpeg", "png", "webp"] }] })\n    : await dialog.showOpenDialog({ properties: ["openFile"], filters: [{ name: "Imagens", extensions: ["jpg", "jpeg", "png", "webp"] }] });\n  if (result.canceled || !result.filePaths[0]) return { canceled: true };\n\n  const selectedPath = result.filePaths[0];\n  const stat = fs.statSync(selectedPath);\n  const type = resolveProductImageMime(selectedPath);\n  const { upload, files } = await loadPdvProductImageModules();\n  const validation = upload.validateUploadBatch([{ name: path.basename(selectedPath), size: stat.size, type, lastModified: stat.mtimeMs }], {\n    maxFiles: 1,\n    maxFileSize: PDV_PRODUCT_IMAGE_MAX_BYTES,\n    accept: PDV_PRODUCT_IMAGE_TYPES\n  });\n  if (validation.rejected.length) {\n    const reasons = validation.rejected[0].reasons.join(", ");\n    throw new Error(\`Foto recusada (\${reasons}). Use JPG, PNG ou WebP com até 5 MB.\`);\n  }\n\n  const workspace = await files.createWorkspace(getPdvProductImageDir());\n  const extension = path.extname(selectedPath).toLowerCase() === ".jpeg" ? ".jpg" : path.extname(selectedPath).toLowerCase();\n  const uniqueName = \`\${Date.now()}-\${Math.random().toString(36).slice(2, 10)}\${extension}\`;\n  const imageRef = path.posix.join("products", safeProductImageFolder(productCode), uniqueName);\n  await workspace.writeFile(imageRef, fs.readFileSync(selectedPath));\n  const absolute = files.resolveInsideRoot(workspace.root, imageRef);\n  return { canceled: false, imageRef, imageUrl: pathToFileURL(absolute).href, fileName: path.basename(selectedPath) };\n}\n\nasync function resolvePdvProductImageUrl(imageRef) {\n  if (!imageRef) return "";\n  const { files } = await loadPdvProductImageModules();\n  const workspace = await files.createWorkspace(getPdvProductImageDir());\n  const absolute = files.resolveInsideRoot(workspace.root, String(imageRef));\n  return fs.existsSync(absolute) ? pathToFileURL(absolute).href : "";\n}\n\nasync function removePdvProductImage(imageRef) {\n  if (!imageRef) return true;\n  const { files } = await loadPdvProductImageModules();\n  const workspace = await files.createWorkspace(getPdvProductImageDir());\n  const absolute = files.resolveInsideRoot(workspace.root, String(imageRef));\n  if (!fs.existsSync(absolute)) return true;\n  await workspace.remove(String(imageRef));\n  return true;\n}\n\nfunction getAppBackupDir(scope)`,
    "product image workspace functions"
  );
  source = replaceOnce(
    source,
    'ipcMain.handle("nexus-pdv-store:save", (_event, storeKey, snapshotJson) => {\n  return savePdvStoreSnapshot(storeKey, snapshotJson);\n});\n\nipcMain.handle("app-store:status"',
    'ipcMain.handle("nexus-pdv-store:save", (_event, storeKey, snapshotJson) => {\n  return savePdvStoreSnapshot(storeKey, snapshotJson);\n});\n\nipcMain.handle("nexus-pdv-product-image:select", (_event, productCode) => selectPdvProductImage(productCode));\nipcMain.handle("nexus-pdv-product-image:url", (_event, imageRef) => resolvePdvProductImageUrl(imageRef));\nipcMain.handle("nexus-pdv-product-image:remove", (_event, imageRef) => removePdvProductImage(imageRef));\n\nipcMain.handle("app-store:status"',
    "product image IPC"
  );
  await write(file, source);
}

{
  const file = "apps/pdv-demo/src/PdvDemoApp.tsx";
  let source = await read(file);
  source = replaceOnce(
    source,
    'import { getDesktopPdvBackupBridge, getDesktopPdvStoreBridge, getDesktopPdvSyncBridge, getDesktopPrintingBridge, getDesktopSerialBridge, type DesktopPdvBackupFile, type DesktopPdvSyncServerStatus, type SerialPortInfo } from "@nexus-core/desktop-runtime";',
    'import { getDesktopPdvBackupBridge, getDesktopPdvProductImageBridge, getDesktopPdvStoreBridge, getDesktopPdvSyncBridge, getDesktopPrintingBridge, getDesktopSerialBridge, type DesktopPdvBackupFile, type DesktopPdvSyncServerStatus, type SerialPortInfo } from "@nexus-core/desktop-runtime";',
    "pdv image bridge import"
  );
  source = replaceOnce(
    source,
    'type ProductDraft = { code: string; barcode: string; name: string; category: string; type: "unit" | "weight"; price: string; stock: string; minimumStock: string; quantityPriceRules: ProductComboDraft[]; productKind: CatalogProductKind; parentProductCode: string; variantLabel: string; promotionGroupId: string; };',
    'type ProductDraft = { code: string; barcode: string; name: string; category: string; type: "unit" | "weight"; price: string; stock: string; minimumStock: string; quantityPriceRules: ProductComboDraft[]; productKind: CatalogProductKind; parentProductCode: string; variantLabel: string; promotionGroupId: string; imageRef: string; };',
    "product draft imageRef"
  );
  source = replaceOnce(
    source,
    'type CatalogProduct = ScaleProductRecord & { barcode: string; unitLabel: string; stock: number; minStock: number; category: string; active?: boolean; quantityPriceRules?: QuantityPriceRule[]; productKind?: CatalogProductKind; parentProductCode?: string; variantLabel?: string; promotionGroupId?: string; };',
    'type CatalogProduct = ScaleProductRecord & { barcode: string; unitLabel: string; stock: number; minStock: number; category: string; active?: boolean; quantityPriceRules?: QuantityPriceRule[]; productKind?: CatalogProductKind; parentProductCode?: string; variantLabel?: string; promotionGroupId?: string; imageRef?: string; };',
    "catalog product imageRef"
  );
  source = replaceOnce(
    source,
    'return { code: "", barcode: "", name: "", category: "", type: "unit", price: "", stock: "", minimumStock: "", quantityPriceRules: [], productKind: "standard", parentProductCode: "", variantLabel: "", promotionGroupId: "" };',
    'return { code: "", barcode: "", name: "", category: "", type: "unit", price: "", stock: "", minimumStock: "", quantityPriceRules: [], productKind: "standard", parentProductCode: "", variantLabel: "", promotionGroupId: "", imageRef: "" };',
    "empty product imageRef"
  );
  source = replaceOnce(
    source,
    '  const [productDraft, setProductDraft] = useState<ProductDraft>(createEmptyProductDraft);\n  const [customerDraft, setCustomerDraft]',
    '  const [productDraft, setProductDraft] = useState<ProductDraft>(createEmptyProductDraft);\n  const [productImagePreviewUrl, setProductImagePreviewUrl] = useState("");\n  const [editingProductOriginalImageRef, setEditingProductOriginalImageRef] = useState("");\n  const [customerDraft, setCustomerDraft]',
    "product image state"
  );
  source = replaceOnce(
    source,
    '  const desktopPdvBackupBridge = getDesktopPdvBackupBridge();\n  const desktopPrintingBridge = getDesktopPrintingBridge();',
    '  const desktopPdvBackupBridge = getDesktopPdvBackupBridge();\n  const desktopProductImageBridge = getDesktopPdvProductImageBridge();\n  const desktopPrintingBridge = getDesktopPrintingBridge();',
    "product image bridge instance"
  );
  source = replaceOnce(
    source,
    '  const saveProduct = () => {',
    `  const selectProductImage = async () => {\n    if (!desktopProductImageBridge) return setLastEvent("Fotos de produto ficam disponíveis no app desktop Electron.");\n    try {\n      const result = await desktopProductImageBridge.select(productDraft.code.trim() || editingProductCode || "novo-produto");\n      if (result.canceled || !result.imageRef) return;\n      const previousDraftRef = productDraft.imageRef;\n      if (previousDraftRef && previousDraftRef !== editingProductOriginalImageRef && previousDraftRef !== result.imageRef) {\n        await desktopProductImageBridge.remove(previousDraftRef).catch(() => false);\n      }\n      setProductDraft((current) => ({ ...current, imageRef: result.imageRef ?? "" }));\n      setProductImagePreviewUrl(result.imageUrl ?? "");\n      setLastEvent(\`Foto \${result.fileName ?? "selecionada"} pronta para ser salva com o produto.\`);\n    } catch (error) {\n      setLastEvent(error instanceof Error ? error.message : "Não foi possível selecionar a foto do produto.");\n    }\n  };\n\n  const removeDraftProductImage = () => {\n    const imageRef = productDraft.imageRef;\n    if (imageRef && imageRef !== editingProductOriginalImageRef && desktopProductImageBridge) {\n      void desktopProductImageBridge.remove(imageRef).catch(() => false);\n    }\n    setProductDraft((current) => ({ ...current, imageRef: "" }));\n    setProductImagePreviewUrl("");\n  };\n\n  const saveProduct = () => {`,
    "product image handlers"
  );
  source = replaceOnce(
    source,
    'promotionGroupId: productKind === "standard" ? productDraft.promotionGroupId || undefined : undefined };',
    'promotionGroupId: productKind === "standard" ? productDraft.promotionGroupId || undefined : undefined, imageRef: productDraft.imageRef || undefined };',
    "persist imageRef on product"
  );
  source = replaceOnce(
    source,
    '    setProductDraft(createEmptyProductDraft()); setEditingProductCode(""); setProductFormOpen(false); setLastEvent(editingProductCode ? `${name} atualizado no catalogo.` : `${name} cadastrado no catalogo.`);',
    '    if (existingProduct?.imageRef && existingProduct.imageRef !== product.imageRef && desktopProductImageBridge) void desktopProductImageBridge.remove(existingProduct.imageRef).catch(() => false);\n    setProductDraft(createEmptyProductDraft()); setProductImagePreviewUrl(""); setEditingProductOriginalImageRef(""); setEditingProductCode(""); setProductFormOpen(false); setLastEvent(editingProductCode ? `${name} atualizado no catalogo.` : `${name} cadastrado no catalogo.`);',
    "safe old image cleanup on save"
  );
  source = replaceOnce(
    source,
    '  const editProduct = (product: CatalogProduct) => { setEditingProductCode(product.productCode); setProductFormOpen(true); setProductDraft({ code: product.productCode, barcode: product.barcode, name: product.productName, category: product.category, type: product.itemType, price: String(product.unitPrice), stock: String(product.stock), minimumStock: String(product.minStock), quantityPriceRules: (product.quantityPriceRules ?? []).map((rule) => ({ quantity: String(rule.quantity), bundlePrice: String(rule.bundlePrice) })), productKind: product.productKind ?? "standard", parentProductCode: product.parentProductCode ?? "", variantLabel: product.variantLabel ?? "", promotionGroupId: product.promotionGroupId ?? "" }); };\n  const cancelProductEdit = () => { setEditingProductCode(""); setProductFormOpen(false); setProductDraft(createEmptyProductDraft()); setLastEvent("Edição de produto cancelada."); };',
    '  const editProduct = (product: CatalogProduct) => { const imageRef = product.imageRef ?? ""; setEditingProductCode(product.productCode); setEditingProductOriginalImageRef(imageRef); setProductImagePreviewUrl(""); setProductFormOpen(true); setProductDraft({ code: product.productCode, barcode: product.barcode, name: product.productName, category: product.category, type: product.itemType, price: String(product.unitPrice), stock: String(product.stock), minimumStock: String(product.minStock), quantityPriceRules: (product.quantityPriceRules ?? []).map((rule) => ({ quantity: String(rule.quantity), bundlePrice: String(rule.bundlePrice) })), productKind: product.productKind ?? "standard", parentProductCode: product.parentProductCode ?? "", variantLabel: product.variantLabel ?? "", promotionGroupId: product.promotionGroupId ?? "", imageRef }); if (imageRef && desktopProductImageBridge) void desktopProductImageBridge.url(imageRef).then(setProductImagePreviewUrl).catch(() => setProductImagePreviewUrl("")); };\n  const cancelProductEdit = () => { if (productDraft.imageRef && productDraft.imageRef !== editingProductOriginalImageRef && desktopProductImageBridge) void desktopProductImageBridge.remove(productDraft.imageRef).catch(() => false); setEditingProductCode(""); setEditingProductOriginalImageRef(""); setProductImagePreviewUrl(""); setProductFormOpen(false); setProductDraft(createEmptyProductDraft()); setLastEvent("Edição de produto cancelada."); };',
    "edit and cancel image lifecycle"
  );
  source = replaceOnce(
    source,
    'setCatalogProducts((current) => current.filter((item) => item.productCode !== product.productCode)); setStockProductCode((current) => current === product.productCode ? "" : current); setLastEvent(`${product.productName} foi excluído do catálogo. As vendas e movimentações já registradas permanecem no histórico.`);',
    'setCatalogProducts((current) => current.filter((item) => item.productCode !== product.productCode)); if (product.imageRef && desktopProductImageBridge) void desktopProductImageBridge.remove(product.imageRef).catch(() => false); setStockProductCode((current) => current === product.productCode ? "" : current); setLastEvent(`${product.productName} foi excluído do catálogo. As vendas e movimentações já registradas permanecem no histórico.`);',
    "cleanup image on product delete"
  );
  source = replaceOnce(
    source,
    '        {productDraft.productKind === "variant" ? <div style={styles.infoBox}>A promoção por quantidade é herdada do produto principal e soma sabores/variações diferentes na mesma venda.</div>',
    `        <div style={styles.productImageEditor}><div style={styles.productImagePreview}>{productImagePreviewUrl ? <img src={productImagePreviewUrl} alt={\`Foto de \${productDraft.name || "produto"}\`} style={styles.productImagePreviewImage} /> : <div style={styles.productImagePlaceholder}>Sem foto</div>}</div><div style={styles.stack}><strong>Foto principal do produto</strong><span style={styles.comboHint}>JPG, PNG ou WebP · até 5 MB · 1 foto principal. O arquivo fica salvo localmente neste computador.</span><div style={styles.toolbar}><button type="button" onClick={() => void selectProductImage()} style={styles.secondaryButton}>Selecionar foto</button>{productDraft.imageRef ? <button type="button" onClick={removeDraftProductImage} style={styles.secondaryButton}>Remover foto</button> : null}</div></div></div>\n        {productDraft.productKind === "variant" ? <div style={styles.infoBox}>A promoção por quantidade é herdada do produto principal e soma sabores/variações diferentes na mesma venda.</div>`,
    "product image registration UI"
  );
  source = replaceOnce(
    source,
    'function parsePdvSnapshot(raw: string) { const value = JSON.parse(raw) as Partial<PdvStoreDefaults>; if (!value || typeof value !== "object") throw new Error("Snapshot do PDV invalido."); const catalogProducts = Array.isArray(value.catalogProducts) ? (value.catalogProducts as CatalogProduct[]).map((product) => ({ ...product, productKind: product.productKind ?? "standard", quantityPriceRules: product.itemType === "unit" ? normalizeQuantityPriceRules(product.quantityPriceRules) : [] })) : defaultPdvStore.catalogProducts;',
    'function parsePdvSnapshot(raw: string) { const value = JSON.parse(raw) as Partial<PdvStoreDefaults>; if (!value || typeof value !== "object") throw new Error("Snapshot do PDV invalido."); const catalogProducts = Array.isArray(value.catalogProducts) ? (value.catalogProducts as CatalogProduct[]).map((product) => ({ ...product, imageRef: typeof product.imageRef === "string" ? product.imageRef : undefined, productKind: product.productKind ?? "standard", quantityPriceRules: product.itemType === "unit" ? normalizeQuantityPriceRules(product.quantityPriceRules) : [] })) : defaultPdvStore.catalogProducts;',
    "backward compatible imageRef snapshot"
  );
  source = replaceOnce(
    source,
    'hiddenInput: { display: "none" }',
    'productImageEditor: { display: "grid", gridTemplateColumns: "140px minmax(0, 1fr)", gap: "14px", alignItems: "center", padding: "12px", borderRadius: "10px", border: "1px solid #cbd5e1", background: "#f8fafc" }, productImagePreview: { width: "140px", height: "110px", overflow: "hidden", display: "grid", placeItems: "center", borderRadius: "8px", border: "1px solid #cbd5e1", background: "#ffffff" }, productImagePreviewImage: { width: "100%", height: "100%", objectFit: "contain" }, productImagePlaceholder: { color: "#64748b", fontSize: "12px", fontWeight: 700 }, hiddenInput: { display: "none" }',
    "product image styles"
  );
  await write(file, source);
}

console.log("Product image registration feature applied.");
