import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import Mini from "./Mini";

// A interface aberta no navegador (`npm run dev`) não tem `invoke`, e aí toda
// tela aparece vazia — impossível avaliar layout ou densidade. O mock instala
// um backend falso ANTES do primeiro render. Nunca entra no app instalado:
// `import.meta.env.DEV` some no build, e dentro do Tauri a checagem falha.
if (import.meta.env.DEV && !("__TAURI_INTERNALS__" in window)) {
  await import("./mock-dev");
}

/**
 * As duas janelas partilham o mesmo pacote e se distinguem pelo rótulo. Um
 * segundo `index.html` duplicaria a configuração do Vite e o carregamento do
 * React para ganhar nada.
 */
async function rotuloDaJanela(): Promise<string> {
  // No navegador o rótulo não existe. `?mini` permite trabalhar na janela
  // compacta sem recompilar o Rust a cada ajuste de estilo.
  if (import.meta.env.DEV && location.search.includes("mini")) return "mini";
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    return getCurrentWindow().label;
  } catch {
    return "main";
  }
}

const rotulo = await rotuloDaJanela();
const raiz = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);

if (rotulo === "mini") {
  document.documentElement.dataset.tema =
    localStorage.getItem("tema") ?? "escuro";
  document.body.style.background = "transparent";
  raiz.render(
    <React.StrictMode>
      <Mini />
    </React.StrictMode>,
  );
} else {
  raiz.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
