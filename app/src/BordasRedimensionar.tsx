import { CSSProperties, useEffect, useState } from "react";
import type { Window } from "@tauri-apps/api/window";

/** O tipo da direção não é exportado pela API; sai da assinatura do método. */
type ResizeDirection = Parameters<Window["startResizeDragging"]>[0];

const ZONAS: { dir: ResizeDirection; estilo: CSSProperties }[] = [
  { dir: "North", estilo: { top: 0, left: 10, right: 10, height: 5, cursor: "ns-resize" } },
  { dir: "South", estilo: { bottom: 0, left: 10, right: 10, height: 5, cursor: "ns-resize" } },
  { dir: "West", estilo: { left: 0, top: 10, bottom: 10, width: 5, cursor: "ew-resize" } },
  { dir: "East", estilo: { right: 0, top: 10, bottom: 10, width: 5, cursor: "ew-resize" } },
  { dir: "NorthWest", estilo: { top: 0, left: 0, width: 10, height: 10, cursor: "nwse-resize" } },
  { dir: "NorthEast", estilo: { top: 0, right: 0, width: 10, height: 10, cursor: "nesw-resize" } },
  { dir: "SouthWest", estilo: { bottom: 0, left: 0, width: 10, height: 10, cursor: "nesw-resize" } },
  { dir: "SouthEast", estilo: { bottom: 0, right: 0, width: 10, height: 10, cursor: "nwse-resize" } },
];

/**
 * Bordas de redimensionar para a janela sem decoração (D-028).
 *
 * No Wayland o compositor não dá borda a uma janela que dispensou a
 * decoração, e sem isto ela só muda de tamanho por atalho do sistema. Faixas
 * invisíveis de 5px nas bordas e 10px nos cantos pedem o redimensionamento ao
 * Tauri. Somem com a janela maximizada, quando não há o que redimensionar.
 */
export default function BordasRedimensionar() {
  const [ativo, setAtivo] = useState(false);

  useEffect(() => {
    let vivo = true;
    let soltar: (() => void) | undefined;
    (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const j = getCurrentWindow();
        const atualizar = async () => {
          if (vivo) setAtivo(!(await j.isMaximized()));
        };
        await atualizar();
        soltar = await j.onResized(atualizar);
        if (!vivo) soltar();
      } catch {
        /* fora do Tauri não há janela para redimensionar */
      }
    })();
    return () => {
      vivo = false;
      soltar?.();
    };
  }, []);

  if (!ativo) return null;

  const iniciar = async (dir: ResizeDirection) => {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().startResizeDragging(dir);
    } catch {
      /* ignora fora do Tauri */
    }
  };

  return (
    <>
      {ZONAS.map((z) => (
        <div
          key={z.dir}
          className="borda-redim"
          style={z.estilo}
          onMouseDown={(e) => {
            if (e.button === 0) iniciar(z.dir);
          }}
          aria-hidden
        />
      ))}
    </>
  );
}
