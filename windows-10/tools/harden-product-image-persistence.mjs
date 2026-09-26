import fs from "node:fs/promises";
import path from "node:path";

const file = path.join(process.cwd(), "windows-10/apps/pdv-demo/src/PdvDemoApp.tsx");
let source = (await fs.readFile(file, "utf8")).replace(/\r\n/g, "\n");

if (source.includes("pendingProductImageDeleteRefs")) {
  console.log("Safe product image cleanup is already applied.");
  process.exit(0);
}

function replaceOnce(needle, replacement, label) {
  const first = source.indexOf(needle);
  if (first < 0) throw new Error(`Missing replacement anchor: ${label}`);
  if (source.indexOf(needle, first + needle.length) >= 0) throw new Error(`Ambiguous replacement anchor: ${label}`);
  source = source.slice(0, first) + replacement + source.slice(first + needle.length);
}

replaceOnce(
  '  const [editingProductOriginalImageRef, setEditingProductOriginalImageRef] = useState("");\n  const [customerDraft, setCustomerDraft]',
  '  const [editingProductOriginalImageRef, setEditingProductOriginalImageRef] = useState("");\n  const pendingProductImageDeleteRefs = useRef(new Set<string>());\n  const [customerDraft, setCustomerDraft]',
  "pending image cleanup ref"
);

replaceOnce(
  '  useEffect(() => {\n    if (!desktopStoreBridge || persistenceState !== "ready") return;\n    const snapshot = buildPdvSnapshotJson();\n    void desktopStoreBridge.save(PDV_STORE_KEY, snapshot).catch((error) => { setDesktopStoreStatus(error instanceof Error ? error.message : "Falha ao salvar SQLite desktop."); setPersistenceState("error"); });\n  }, [persistenceState, catalogProducts, registeredCustomers, completedSales, cashSession, paymentOptions, scaleBrand, barcodeMode, requestCommand, selectedPort, baudRate, manualProductCode, inventoryMovements, cashClosings, receiptPrinterConfig, lastReceiptText, users, currentOperatorId, auditLogs, cancelledSales, terminalConfig, tefConfig, tefTransactions, autoBackupConfig, autoBackups, storeSettings, promotionGroups]);',
  '  useEffect(() => {\n    if (!desktopStoreBridge || persistenceState !== "ready") return;\n    const snapshot = buildPdvSnapshotJson();\n    const referencedImageRefs = new Set(catalogProducts.map((product) => product.imageRef).filter((value): value is string => Boolean(value)));\n    void desktopStoreBridge.save(PDV_STORE_KEY, snapshot).then(async () => {\n      if (!desktopProductImageBridge || pendingProductImageDeleteRefs.current.size === 0) return;\n      for (const imageRef of [...pendingProductImageDeleteRefs.current]) {\n        if (referencedImageRefs.has(imageRef)) continue;\n        try { await desktopProductImageBridge.remove(imageRef); pendingProductImageDeleteRefs.current.delete(imageRef); } catch { /* keep queued for the next successful persistence cycle */ }\n      }\n    }).catch((error) => { setDesktopStoreStatus(error instanceof Error ? error.message : "Falha ao salvar SQLite desktop."); setPersistenceState("error"); });\n  }, [persistenceState, catalogProducts, registeredCustomers, completedSales, cashSession, paymentOptions, scaleBrand, barcodeMode, requestCommand, selectedPort, baudRate, manualProductCode, inventoryMovements, cashClosings, receiptPrinterConfig, lastReceiptText, users, currentOperatorId, auditLogs, cancelledSales, terminalConfig, tefConfig, tefTransactions, autoBackupConfig, autoBackups, storeSettings, promotionGroups, desktopProductImageBridge]);',
  "delete stale images only after persisted snapshot"
);

replaceOnce(
  '    if (existingProduct?.imageRef && existingProduct.imageRef !== product.imageRef && desktopProductImageBridge) void desktopProductImageBridge.remove(existingProduct.imageRef).catch(() => false);',
  '    if (existingProduct?.imageRef && existingProduct.imageRef !== product.imageRef) pendingProductImageDeleteRefs.current.add(existingProduct.imageRef);',
  "queue replaced image"
);

replaceOnce(
  'setCatalogProducts((current) => current.filter((item) => item.productCode !== product.productCode)); if (product.imageRef && desktopProductImageBridge) void desktopProductImageBridge.remove(product.imageRef).catch(() => false); setStockProductCode',
  'setCatalogProducts((current) => current.filter((item) => item.productCode !== product.productCode)); if (product.imageRef) pendingProductImageDeleteRefs.current.add(product.imageRef); setStockProductCode',
  "queue deleted product image"
);

await fs.writeFile(file, source, "utf8");
console.log("Safe product image persistence cleanup applied.");
