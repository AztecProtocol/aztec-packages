import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

process.env = Object.keys(import.meta.env).reduce((acc, key) => {
  acc[key.replace("VITE_", "")] = import.meta.env[key];
  return acc;
}, {});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
