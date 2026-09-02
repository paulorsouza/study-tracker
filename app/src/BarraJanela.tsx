import { useEffect, useState } from "react";
import * as I from "./icones";

/**
 * Barra de título própria.
 *
 * A decoração do sistema foi desligada para a janela combinar com o resto —
 * mas isso transfere responsabilidade: minimizar, maximizar e fechar passam a
 * ser nossos, e a área de arrasto também. Sem esses três botões, a janela
 * ficaria sem saída.
 */
export default function BarraJanela() {
  const [maximizada, setMaximizada] = useState(false);
  const [temApi, setTemApi] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const j = getCurrentWindow();
        if (!vivo) return;
        setTemApi(true);
        setMaximizada(await j.isMaximized());
        const un = await j.onResized(async () => {
          if (vivo) setMaximizada(await j.isMaximized());
        });
        return un;
      } catch {
        /* no navegador não há janela para controlar */
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  const comando = async (nome: "minimize" | "toggleMaximize" | "close") => {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow()[nome]();
    } catch {
      /* ignora fora do Tauri */
    }
  };

  return (
    <header className="janela-barra" data-tauri-drag-region>
      <div className="janela-marca" data-tauri-drag-region>
        <I.Relogio size={15} />
        <span data-tauri-drag-region>Estudos</span>
      </div>

      {temApi && (
        <div className="janela-controles">
          <button
            className="ctrl"
            onClick={() => comando("minimize")}
            aria-label="Minimizar"
            title="Minimizar"
          >
            <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden>
              <rect x="1" y="5" width="9" height="1" fill="currentColor" />
            </svg>
          </button>
          <button
            className="ctrl"
            onClick={() => comando("toggleMaximize")}
            aria-label={maximizada ? "Restaurar" : "Maximizar"}
            title={maximizada ? "Restaurar" : "Maximizar"}
          >
            <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden>
              {maximizada ? (
                <>
                  <rect x="1" y="3" width="7" height="7" fill="none" stroke="currentColor" />
                  <path d="M3 3V1h7v7H8" fill="none" stroke="currentColor" />
                </>
              ) : (
                <rect x="1" y="1" width="9" height="9" fill="none" stroke="currentColor" />
              )}
            </svg>
          </button>
          <button
            className="ctrl ctrl-fechar"
            onClick={() => comando("close")}
            aria-label="Fechar"
            title="Fechar"
          >
            <svg width="11" height="11" viewBox="0 0 11 11" aria-hidden>
              <path d="M1 1l9 9M10 1l-9 9" stroke="currentColor" fill="none" />
            </svg>
          </button>
        </div>
      )}
    </header>
  );
}
