import "@fontsource-variable/atkinson-hyperlegible-next";
import "@fontsource-variable/source-serif-4";
import "@kitsa/eligibility-ui/styles.css";
import "./app.css";
import { createEligibilityLabClient } from "@kitsa/eligibility-lab-client";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App client={createEligibilityLabClient()} />
    </StrictMode>,
  );
}
