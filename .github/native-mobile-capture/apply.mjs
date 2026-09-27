import fs from "node:fs";

function replaceOrFail(source, before, after, label) {
  if (!source.includes(before)) throw new Error(`${label} anchor not found`);
  return source.replace(before, after);
}

const appPath = "windows-10/apps/pdv-demo/src/PdvDemoApp.tsx";
let app = fs.readFileSync(appPath, "utf8");

app = replaceOrFail(
  app,
  `  const [productImagePreviewUrl, setProductImagePreviewUrl] = useState("");\n  const [editingProductOriginalImageRef, setEditingProductOriginalImageRef] = useState("");`,
  `  const [productImagePreviewUrl, setProductImagePreviewUrl] = useState("");\n  const [cashierProductImageUrl, setCashierProductImageUrl] = useState("");\n  const [editingProductOriginalImageRef, setEditingProductOriginalImageRef] = useState("");`,
  "cashier image state"
);

app = replaceOrFail(
  app,
  `  const netTotal = roundCurrency(grossTotal - discountValue);\n  const paymentView = resolvePaymentView(netTotal, sale?.payments ?? [], activeCustomer);`,
  `  const netTotal = roundCurrency(grossTotal - discountValue);\n  const activeCashierSaleItem = (sale?.items ?? []).slice(-1)[0];\n  const activeCashierProduct = activeCashierSaleItem ? catalogProducts.find((product) => product.productCode === activeCashierSaleItem.productCode) : undefined;\n  const paymentView = resolvePaymentView(netTotal, sale?.payments ?? [], activeCustomer);`,
  "active cashier product"
);

app = replaceOrFail(
  app,
  `  const cashStatus = cashSession && !cashSession.closedAt ? "CAIXA ABERTO" : "CAIXA FECHADO";\n`,
  `  const cashStatus = cashSession && !cashSession.closedAt ? "CAIXA ABERTO" : "CAIXA FECHADO";\n\n  useEffect(() => {\n    let active = true;\n    const imageRef = activeCashierProduct?.imageRef;\n    if (!desktopProductImageBridge || !imageRef) {\n      setCashierProductImageUrl("");\n      return () => { active = false; };\n    }\n    setCashierProductImageUrl("");\n    void desktopProductImageBridge.url(imageRef)\n      .then((url) => { if (active) setCashierProductImageUrl(url || ""); })\n      .catch(() => { if (active) setCashierProductImageUrl(""); });\n    return () => { active = false; };\n  }, [activeCashierProduct?.imageRef, desktopProductImageBridge]);\n`,
  "cashier image effect"
);

app = replaceOrFail(
  app,
  `            <div className="classic-blue-product-preview">\n              <h3>{(sale?.items ?? []).slice(-1)[0]?.productName ?? "Produto"}</h3>\n              <div className="classic-blue-product-placeholder">{((sale?.items ?? []).slice(-1)[0]?.productName ?? "PDV").slice(0, 2).toUpperCase()}</div>\n              <small>{(sale?.items ?? []).slice(-1)[0] ? \`Último item: \${(sale?.items ?? []).slice(-1)[0].productCode}\` : "Aguardando leitura de produto"}</small>\n            </div>`,
  `            <div className="classic-blue-product-preview" data-classic-blue="product-image">\n              <h3>{activeCashierSaleItem?.productName ?? "Produto"}</h3>\n              {cashierProductImageUrl ? <img src={cashierProductImageUrl} alt={\`Foto de \${activeCashierSaleItem?.productName ?? "produto"}\`} onError={() => setCashierProductImageUrl("")} style={{ width: "100%", height: 148, objectFit: "contain", background: "#fff", border: "1px solid #8b9ab0" }} /> : <div className="classic-blue-product-placeholder">Sem foto</div>}\n              <small>{activeCashierSaleItem ? \`Último item: \${activeCashierSaleItem.productCode}\` : "Aguardando leitura de produto"}</small>\n            </div>`,
  "cashier product preview"
);

fs.writeFileSync(appPath, app, "utf8");
