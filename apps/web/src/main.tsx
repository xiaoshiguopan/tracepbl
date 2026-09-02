import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import "./workbench.css";
import "./workbench-form.css";
import "./question-workspace.css";
import "./source-discovery.css";
import "./evidence-map.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("找不到应用挂载节点。请重新加载页面。");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
