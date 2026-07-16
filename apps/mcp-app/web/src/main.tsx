import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { StarfetchApp } from "./app.js";
import "./styles.css";

const root = document.getElementById("root");
if (root === null) {
  throw new Error("Expected the Starfetch widget root element.");
}

createRoot(root).render(
  <StrictMode>
    <StarfetchApp />
  </StrictMode>,
);
