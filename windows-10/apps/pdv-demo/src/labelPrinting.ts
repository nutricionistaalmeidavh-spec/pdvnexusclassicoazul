import {
  buildProductBarcodeRenderModel,
  normalizeProductBatchStore,
  type LabelCatalogProduct,
  type ProductBatch,
  type ProductLabelPreview,
  type ProductBarcodeRenderModel
} from "./productLabels";
import { createProductBatchTrackingBarcode } from "./batchPhysicalTracking";

export type ProductLabelPrintPayload = {
  product: LabelCatalogProduct;
  preview: ProductLabelPreview;
  batch?: ProductBatch;
};

export type ProductLabelPrinterProtocol = "windows" | "zpl" | "tspl";

export type ProductLabelPrinterConfig = {
  protocol: ProductLabelPrinterProtocol;
  printerName: string;
};

export type ProductLabelPrinterInfo = {
  name: string;
  isDefault?: boolean;
};

export type ProductLabelPrintResult = {
  success: boolean;
  copies: number;
  trackingBarcode?: string;
  mode: "windows" | "raw";
  printerName?: string;
  protocol?: "zpl" | "tspl";
};

type DesktopLabelPrintingBridge = {
  printers?: () => Promise<ProductLabelPrinterInfo[]>;
  rawLabel?: (options: { printerName: string; data: string; jobName?: string }) => Promise<{ success: boolean; failureReason?: string }>;
};

const PRODUCT_LABEL_BATCH_STORE_KEY = "nexus-core:pdv-label-batches:v1";
const PRODUCT_LABEL_PRINTER_CONFIG_KEY = "nexus-core:pdv-label-printer-config:v1";
const DEFAULT_PRINTER_CONFIG: ProductLabelPrinterConfig = { protocol: "windows", printerName: "" };
const RAW_PRINTER_DPI = 203;

export function normalizeProductLabelPrinterConfig(value: unknown): ProductLabelPrinterConfig {
  if (!value || typeof value !== "object") return { ...DEFAULT_PRINTER_CONFIG };
  const input = value as Partial<ProductLabelPrinterConfig>;
  const protocol: ProductLabelPrinterProtocol = input.protocol === "zpl" || input.protocol === "tspl" ? input.protocol : "windows";
  if (protocol === "windows") return { protocol, printerName: "" };
  return { protocol, printerName: typeof input.printerName === "string" ? input.printerName.trim() : "" };
}

export function loadProductLabelPrinterConfig(): ProductLabelPrinterConfig {
  if (typeof window === "undefined") return { ...DEFAULT_PRINTER_CONFIG };
  try {
    const raw = window.localStorage.getItem(PRODUCT_LABEL_PRINTER_CONFIG_KEY);
    return raw ? normalizeProductLabelPrinterConfig(JSON.parse(raw)) : { ...DEFAULT_PRINTER_CONFIG };
  } catch {
    return { ...DEFAULT_PRINTER_CONFIG };
  }
}

export function saveProductLabelPrinterConfig(value: ProductLabelPrinterConfig): ProductLabelPrinterConfig {
  const normalized = normalizeProductLabelPrinterConfig(value);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(PRODUCT_LABEL_PRINTER_CONFIG_KEY, JSON.stringify(normalized));
    } catch {
      // Configuração continua válida nesta sessão mesmo sem persistência local.
    }
  }
  return normalized;
}

export async function listProductLabelPrinters(): Promise<ProductLabelPrinterInfo[]> {
  const bridge = getDesktopLabelPrintingBridge();
  if (!bridge?.printers) return [];
  try {
    const printers = await bridge.printers();
    return Array.isArray(printers)
      ? printers
        .filter((printer) => printer && typeof printer.name === "string" && printer.name.trim())
        .map((printer) => ({ name: printer.name.trim(), isDefault: Boolean(printer.isDefault) }))
        .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name, "pt-BR"))
      : [];
  } catch {
    return [];
  }
}

export function buildProductBarcodeSvgMarkup(model: ProductBarcodeRenderModel) {
  const quietZone = 10;
  const totalWidth = model.moduleCount + quietZone * 2;
  const bars = model.bars
    .map((bar) => `<rect x="${bar.x + quietZone}" y="0" width="${bar.width}" height="62"/>`)
    .join("");
  return `<svg class="pdv-label-barcode" viewBox="0 0 ${totalWidth} 78" role="img" aria-label="Código de barras ${escapeHtml(model.humanReadable)}" preserveAspectRatio="none"><g fill="#000">${bars}</g><text x="${totalWidth / 2}" y="75" text-anchor="middle" font-family="Arial, sans-serif" font-size="9" fill="#000">${escapeHtml(model.humanReadable)}</text></svg>`;
}

export function buildProductLabelPrintHtml(payload: ProductLabelPrintPayload) {
  const { preview } = payload;
  const barcode = buildPayloadBarcodeModel(payload);
  const barcodeSvg = buildProductBarcodeSvgMarkup(barcode);
  const copies = clampCopies(preview.copies);
  const label = buildSingleLabelMarkup(preview, barcodeSvg, Boolean(payload.batch));
  const pages = Array.from({ length: copies }, () => `<section class="label-page">${label}</section>`).join("");
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<title>Etiquetas PDV Nexus</title>
<style>
@page { size: ${preview.widthMm}mm ${preview.heightMm}mm; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; color: #000; font-family: Arial, sans-serif; }
.label-page { width: ${preview.widthMm}mm; height: ${preview.heightMm}mm; page-break-after: always; break-after: page; padding: 1.6mm; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; }
.label-page:last-child { page-break-after: auto; break-after: auto; }
.product-name { font-size: 9pt; line-height: 1.05; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pdv-label-barcode { width: 100%; height: min(12mm, 48%); display: block; }
.label-meta { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 0.8mm 2mm; font-size: 7.5pt; line-height: 1; }
.label-meta strong { font-size: 9pt; }
.tracking-note { font-size: 5.8pt; line-height: 1; text-align: center; font-weight: 700; }
</style>
</head>
<body>${pages}</body>
</html>`;
}

export function buildRawLabelCommand(payload: ProductLabelPrintPayload, protocol: "zpl" | "tspl") {
  const barcode = buildPayloadBarcodeModel(payload);
  return protocol === "zpl" ? buildZplLabel(payload, barcode) : buildTsplLabel(payload, barcode);
}

export async function printProductLabels(payload: ProductLabelPrintPayload, config = loadProductLabelPrinterConfig()): Promise<ProductLabelPrintResult> {
  if (typeof document === "undefined") throw new Error("A impressão de etiquetas requer a interface desktop.");
  const effectiveBatch = payload.batch ?? resolveBatchFromBrowserStore(payload.product.productCode, payload.preview.lotText);
  const effectivePayload = { ...payload, batch: effectiveBatch };
  const normalizedConfig = normalizeProductLabelPrinterConfig(config);
  const bridge = getDesktopLabelPrintingBridge();

  if (normalizedConfig.protocol !== "windows" && normalizedConfig.printerName && bridge?.rawLabel) {
    const result = await bridge.rawLabel({
      printerName: normalizedConfig.printerName,
      data: buildRawLabelCommand(effectivePayload, normalizedConfig.protocol),
      jobName: `PDV Nexus - ${payload.product.productName}`
    });
    if (!result?.success) throw new Error(result?.failureReason || "A etiquetadora não aceitou o trabalho de impressão.");
    return {
      success: true,
      copies: clampCopies(payload.preview.copies),
      trackingBarcode: effectiveBatch ? createProductBatchTrackingBarcode(effectiveBatch.id) : undefined,
      mode: "raw",
      printerName: normalizedConfig.printerName,
      protocol: normalizedConfig.protocol
    };
  }

  await printUsingBrowserDialog(effectivePayload);
  return {
    success: true,
    copies: clampCopies(payload.preview.copies),
    trackingBarcode: effectiveBatch ? createProductBatchTrackingBarcode(effectiveBatch.id) : undefined,
    mode: "windows"
  };
}

function buildPayloadBarcodeModel(payload: ProductLabelPrintPayload) {
  return payload.batch
    ? buildProductBarcodeRenderModel({
      productCode: payload.product.productCode,
      barcode: createProductBatchTrackingBarcode(payload.batch.id),
      barcodeType: "manual"
    })
    : buildProductBarcodeRenderModel(payload.product);
}

function buildZplLabel(payload: ProductLabelPrintPayload, barcode: ProductBarcodeRenderModel) {
  const { preview } = payload;
  const widthDots = mmToDots(preview.widthMm);
  const heightDots = mmToDots(preview.heightMm);
  const barcodeHeight = Math.max(42, Math.min(72, heightDots - 105));
  const meta = buildRawMetaText(preview);
  const barcodeCommand = barcode.symbology === "ean13"
    ? `^BY2,2,${barcodeHeight}^BEN,${barcodeHeight},Y,N^FD${escapeZpl(barcode.humanReadable)}^FS`
    : `^BY2,2,${barcodeHeight}^BCN,${barcodeHeight},Y,N,N^FD${escapeZpl(barcode.humanReadable)}^FS`;
  return [
    "^XA",
    `^PW${widthDots}`,
    `^LL${heightDots}`,
    "^CI28",
    `^FO12,8^A0N,24,24^FD${escapeZpl(payload.preview.productName)}^FS`,
    `^FO16,40${barcodeCommand}`,
    meta ? `^FO12,${Math.max(118, heightDots - 30)}^A0N,19,19^FD${escapeZpl(meta)}^FS` : "",
    payload.batch ? `^FO12,${Math.max(138, heightDots - 12)}^A0N,13,13^FDRASTREIO FISICO DO LOTE^FS` : "",
    `^PQ${clampCopies(preview.copies)}`,
    "^XZ"
  ].filter(Boolean).join("\n");
}

function buildTsplLabel(payload: ProductLabelPrintPayload, barcode: ProductBarcodeRenderModel) {
  const { preview } = payload;
  const heightDots = mmToDots(preview.heightMm);
  const barcodeHeight = Math.max(42, Math.min(72, heightDots - 105));
  const meta = buildRawMetaText(preview);
  const barcodeType = barcode.symbology === "ean13" ? "EAN13" : "128";
  return [
    `SIZE ${formatMm(preview.widthMm)} mm,${formatMm(preview.heightMm)} mm`,
    "GAP 2 mm,0 mm",
    "DIRECTION 1",
    "CLS",
    `TEXT 12,8,"0",0,1,1,"${escapeTspl(preview.productName)}"`,
    `BARCODE 16,42,"${barcodeType}",${barcodeHeight},1,0,2,2,"${escapeTspl(barcode.humanReadable)}"`,
    meta ? `TEXT 12,${Math.max(118, heightDots - 28)},"0",0,1,1,"${escapeTspl(meta)}"` : "",
    payload.batch ? `TEXT 12,${Math.max(138, heightDots - 12)},"0",0,1,1,"RASTREIO FISICO DO LOTE"` : "",
    `PRINT ${clampCopies(preview.copies)},1`
  ].filter(Boolean).join("\r\n");
}

async function printUsingBrowserDialog(payload: ProductLabelPrintPayload) {
  const html = buildProductLabelPrintHtml(payload);
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "1px";
  iframe.style.height = "1px";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";
  document.body.appendChild(iframe);

  try {
    const frameDocument = iframe.contentDocument;
    const frameWindow = iframe.contentWindow;
    if (!frameDocument || !frameWindow) throw new Error("Não foi possível abrir a impressão de etiquetas.");
    frameDocument.open();
    frameDocument.write(html);
    frameDocument.close();
    await new Promise<void>((resolve) => setTimeout(resolve, 80));
    frameWindow.focus();
    frameWindow.print();
  } finally {
    setTimeout(() => iframe.remove(), 1500);
  }
}

function getDesktopLabelPrintingBridge(): DesktopLabelPrintingBridge | undefined {
  if (typeof window === "undefined") return undefined;
  const desktop = window as Window & { nexusDesktop?: { printing?: DesktopLabelPrintingBridge } };
  return desktop.nexusDesktop?.printing;
}

function resolveBatchFromBrowserStore(productCode: string, lotNumber?: string) {
  if (typeof window === "undefined" || !lotNumber) return undefined;
  try {
    const raw = window.localStorage.getItem(PRODUCT_LABEL_BATCH_STORE_KEY);
    if (!raw) return undefined;
    const store = normalizeProductBatchStore(JSON.parse(raw));
    return store.batches.find((batch) => batch.productCode === productCode && batch.lotNumber === lotNumber);
  } catch {
    return undefined;
  }
}

function buildSingleLabelMarkup(preview: ProductLabelPreview, barcodeSvg: string, physicallyTracked: boolean) {
  const meta: string[] = [];
  if (preview.priceText) meta.push(`<strong>${escapeHtml(preview.priceText)}</strong>`);
  if (preview.lotText) meta.push(`<span>Lote: ${escapeHtml(preview.lotText)}</span>`);
  if (preview.expiryText) meta.push(`<span>Val.: ${escapeHtml(preview.expiryText)}</span>`);
  return `<div class="product-name">${escapeHtml(preview.productName)}</div>${barcodeSvg}${physicallyTracked ? `<div class="tracking-note">RASTREIO FÍSICO DO LOTE</div>` : ""}<div class="label-meta">${meta.join("")}</div>`;
}

function buildRawMetaText(preview: ProductLabelPreview) {
  return [preview.priceText, preview.lotText ? `Lote ${preview.lotText}` : "", preview.expiryText ? `Val ${preview.expiryText}` : ""]
    .filter(Boolean)
    .join(" | ");
}

function clampCopies(value: number) {
  return Math.max(1, Math.min(999, Math.floor(value || 1)));
}

function mmToDots(value: number) {
  return Math.max(1, Math.round((Number(value) || 1) * RAW_PRINTER_DPI / 25.4));
}

function formatMm(value: number) {
  return Number.isInteger(value) ? String(value) : Number(value).toFixed(1).replace(/\.0$/, "");
}

function asciiPrinterText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeZpl(value: unknown) {
  return asciiPrinterText(value).replace(/[\^~]/g, " ");
}

function escapeTspl(value: unknown) {
  return asciiPrinterText(value).replace(/["\\]/g, "'");
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
