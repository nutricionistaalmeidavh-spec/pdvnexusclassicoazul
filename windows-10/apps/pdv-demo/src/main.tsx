import React from "react";
import ReactDOM from "react-dom/client";
import { BatchPhysicalTrackingDecor } from "./BatchPhysicalTrackingDecor";
import { CashierReferenceDecor } from "./CashierReferenceDecor";
import { ClassicBlueChrome } from "./ClassicBlueChrome";
import { CustomerPresentationDecor } from "./CustomerPresentationDecor";
import { LabelBatchTools } from "./LabelBatchTools";
import { LabelPrinterSettings } from "./LabelPrinterSettings";
import { PdvDemoApp } from "./PdvDemoApp";
import { PdvOpsDecor } from "./PdvOpsDecor";
import { ProductBatchFefoSync } from "./ProductBatchFefoSync";
import { SaleObservationDecor } from "./SaleObservationDecor";
import "./pdv-dense-v2.css";
import "./pdv-dense-v2-grid.css";
import "./pdv-cashier-v3.css";
import "./pdv-e55.css";
import "./pdv-observation-layout-fix.css";
import "./pdv-cashier-legibility-fix.css";
import "./pdv-classic-blue.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <div className="pdv-density-root" data-cashier-layout="classic-blue">
      <ClassicBlueChrome />
      <CashierReferenceDecor />
      <CustomerPresentationDecor />
      <SaleObservationDecor />
      <BatchPhysicalTrackingDecor />
      <ProductBatchFefoSync />
      <LabelBatchTools />
      <LabelPrinterSettings />
      <PdvOpsDecor />
      <PdvDemoApp />
    </div>
  </React.StrictMode>
);
