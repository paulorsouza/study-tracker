import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// A interface aberta no navegador (`npm run dev`) não tem `invoke`, e aí toda
// tela aparece vazia — impossível avaliar layout ou densidade. O mock instala
// um backend falso ANTES do primeiro render. Nunca entra no app instalado:
// `import.meta.env.DEV` some no build, e dentro do Tauri a checagem falha.
if (import.meta.env.DEV && !("__TAURI_INTERNALS__" in window)) {
  await import("./mock-dev");
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
