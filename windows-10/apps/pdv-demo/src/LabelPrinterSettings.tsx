import { useEffect, useMemo, useState } from "react";
import {
  listProductLabelPrinters,
  loadProductLabelPrinterConfig,
  printProductLabels,
  saveProductLabelPrinterConfig,
  type ProductLabelPrinterConfig,
  type ProductLabelPrinterInfo,
  type ProductLabelPrinterProtocol
} from "./labelPrinting";
import { buildProductLabelPreview, createInternalBarcodeFromProductCode, type LabelCatalogProduct } from "./productLabels";

const TEST_PRODUCT: LabelCatalogProduct = {
  productCode: "TESTE-ETIQUETA",
  productName: "PDV Nexus - Teste",
  barcode: createInternalBarcodeFromProductCode("TESTE-ETIQUETA"),
  unitPrice: 9.9,
  barcodeType: "internal"
};

export function LabelPrinterSettings() {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<ProductLabelPrinterConfig>(() => loadProductLabelPrinterConfig());
  const [printers, setPrinters] = useState<ProductLabelPrinterInfo[]>([]);
  const [loadingPrinters, setLoadingPrinters] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState("");

  const testPreview = useMemo(() => buildProductLabelPreview(TEST_PRODUCT, {
    productCode: TEST_PRODUCT.productCode,
    copies: 1,
    sizePreset: "40x25",
    showPrice: true,
    showLot: false,
    showExpiry: false
  }), []);

  useEffect(() => {
    if (!open) return;
    void refreshPrinters();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  async function refreshPrinters() {
    setLoadingPrinters(true);
    try {
      const next = await listProductLabelPrinters();
      setPrinters(next);
      if (!next.length) setMessage("Nenhuma impressora foi listada pela ponte desktop. O modo Windows continua disponível pelo diálogo de impressão.");
    } finally {
      setLoadingPrinters(false);
    }
  }

  function updateConfig(next: ProductLabelPrinterConfig) {
    const saved = saveProductLabelPrinterConfig(next);
    setConfig(saved);
    setMessage("Configuração da etiquetadora salva neste computador.");
  }

  function changeProtocol(protocol: ProductLabelPrinterProtocol) {
    updateConfig({ protocol, printerName: protocol === "windows" ? "" : config.printerName });
  }

  async function testPrinter() {
    setTesting(true);
    setMessage("");
    try {
      const result = await printProductLabels({ product: TEST_PRODUCT, preview: testPreview }, config);
      setMessage(result.mode === "raw"
        ? `Etiqueta de teste enviada diretamente para ${result.printerName} via ${String(result.protocol).toUpperCase()}.`
        : "Etiqueta de teste aberta no diálogo de impressão do Windows.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível testar a etiquetadora.");
    } finally {
      setTesting(false);
    }
  }

  const directMode = config.protocol !== "windows";

  return (
    <>
      <button className="pdv-label-tools-trigger" style={{ right: 245 }} type="button" onClick={() => setOpen(true)}>Etiquetadora</button>
      {open ? (
        <div className="pdv-label-tools-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setOpen(false); }}>
          <section className="pdv-label-tools-dialog" style={{ width: "min(720px, 94vw)" }} role="dialog" aria-modal="true" aria-label="Configuração da etiquetadora">
            <header className="pdv-label-tools-header">
              <div><strong>Etiquetadora</strong><span>Driver do Windows por padrão; envio RAW ZPL/TSPL como opção local para equipamentos compatíveis.</span></div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Fechar">×</button>
            </header>

            {message ? <p className="pdv-label-tools-status" role="status">{message}</p> : null}

            <div style={{ padding: 20 }}>
              <div className="pdv-label-tools-panel">
                <div className="pdv-label-tools-panel-title"><div><strong>Modo de impressão</strong><span>A configuração é local e não depende de serviço externo.</span></div></div>
                <div className="pdv-label-tools-grid">
                  <label>Protocolo<select value={config.protocol} onChange={(event) => changeProtocol(event.target.value as ProductLabelPrinterProtocol)}><option value="windows">Windows / diálogo de impressão</option><option value="zpl">ZPL direto</option><option value="tspl">TSPL direto</option></select></label>
                  {directMode ? <label>Impressora instalada<input list="pdv-nexus-label-printers" value={config.printerName} onChange={(event) => updateConfig({ ...config, printerName: event.target.value })} placeholder="Nome exato no Windows" /><datalist id="pdv-nexus-label-printers">{printers.map((printer) => <option key={printer.name} value={printer.name}>{printer.isDefault ? "Padrão" : "Instalada"}</option>)}</datalist></label> : <label>Destino<input value="Escolher no diálogo do Windows" readOnly /></label>}
                </div>

                <div className="pdv-label-tools-actions" style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button type="button" disabled={loadingPrinters} onClick={() => void refreshPrinters()}>{loadingPrinters ? "Atualizando..." : "Atualizar impressoras"}</button>
                  <button className="pdv-label-tools-primary" style={{ marginTop: 0 }} type="button" disabled={testing || (directMode && !config.printerName.trim())} onClick={() => void testPrinter()}>{testing ? "Testando..." : "Testar 1 etiqueta"}</button>
                </div>

                <small className="pdv-label-tools-help">Use ZPL ou TSPL somente quando a etiquetadora declarar suporte ao protocolo. Para qualquer impressora instalada por driver, mantenha “Windows / diálogo de impressão”.</small>
                {directMode ? <small className="pdv-label-tools-help">O modo RAW desta versão está calibrado para 203 dpi e envia o comando diretamente ao spooler local. Em impressoras 300/600 dpi, use o modo Windows/driver.</small> : null}
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
