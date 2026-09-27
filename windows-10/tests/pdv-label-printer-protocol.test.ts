import assert from "node:assert/strict";
import test from "node:test";
import { buildProductLabelPreview, createInternalBarcodeFromProductCode } from "../apps/pdv-demo/src/productLabels.js";
import { buildRawLabelCommand } from "../apps/pdv-demo/src/labelPrinting.js";

test("RAW envia EAN-13 sem o digito verificador para ZPL e TSPL", () => {
  const barcode = createInternalBarcodeFromProductCode("123");
  const product = {
    productCode: "123",
    productName: "Produto EAN13",
    barcode,
    unitPrice: 9.9,
    barcodeType: "internal" as const
  };
  const preview = buildProductLabelPreview(product, {
    productCode: product.productCode,
    copies: 1,
    sizePreset: "40x25",
    showPrice: true,
    showLot: false,
    showExpiry: false
  });
  const data = barcode.slice(0, 12);
  const zpl = buildRawLabelCommand({ product, preview }, "zpl");
  const tspl = buildRawLabelCommand({ product, preview }, "tspl");

  assert.match(zpl, new RegExp(`\\^FD${data}\\^FS`));
  assert.doesNotMatch(zpl, new RegExp(`\\^FD${barcode}\\^FS`));
  assert.match(tspl, new RegExp(`"${data}"`));
  assert.doesNotMatch(tspl, new RegExp(`"${barcode}"`));
});

test("RAW envia EAN-8 sem o digito verificador e usa a simbologia correta", () => {
  const barcode = "96385074";
  const product = {
    productCode: "EAN8",
    productName: "Produto EAN8",
    barcode,
    unitPrice: 4.5,
    barcodeType: "gtin" as const
  };
  const preview = buildProductLabelPreview(product, {
    productCode: product.productCode,
    copies: 1,
    sizePreset: "40x25",
    showPrice: false,
    showLot: false,
    showExpiry: false
  });
  const data = barcode.slice(0, 7);
  const zpl = buildRawLabelCommand({ product, preview }, "zpl");
  const tspl = buildRawLabelCommand({ product, preview }, "tspl");

  assert.match(zpl, /\^B8N/);
  assert.match(zpl, new RegExp(`\\^FD${data}\\^FS`));
  assert.match(tspl, /"EAN8"/);
  assert.match(tspl, new RegExp(`"${data}"`));
});
