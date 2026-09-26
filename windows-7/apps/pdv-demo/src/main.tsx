import React from "react";
import ReactDOM from "react-dom/client";
import { BatchPhysicalTrackingDecor } from "./BatchPhysicalTrackingDecor";
import { ClassicBlueChrome } from "./ClassicBlueChrome";
import { LabelBatchTools } from "./LabelBatchTools";
import { PdvDemoApp } from "./PdvDemoApp";
import { PdvOpsDecor } from "./PdvOpsDecor";
import { ProductBatchFefoSync } from "./ProductBatchFefoSync";
import { SaleObservationDecor } from "./SaleObservationDecor";
import "./pdv-classic-blue.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <div className="pdv-density-root" data-cashier-layout="classic-blue">
      <ClassicBlueChrome />
      <SaleObservationDecor />
      <BatchPhysicalTrackingDecor />
      <ProductBatchFefoSync />
      <LabelBatchTools />
      <PdvOpsDecor />
      <PdvDemoApp />
    </div>
  </React.StrictMode>
);
