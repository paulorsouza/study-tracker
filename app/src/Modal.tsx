import { ReactNode, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import * as I from "./icones";

/**
 * Formulário por cima da tela, não no meio dela. Esc e o clique no fundo
 * fecham; o foco vai para o primeiro campo ao abrir.
 *
 * Portal para o `body`: dentro de um cartão com `overflow` o modal ficaria
 * recortado, e a barra lateral tem `overflow: hidden`.
 */
export default function Modal({
  titulo,
  aberto,
  onFechar,
  children,
  pe,
  larga,
}: {
  titulo: string;
  aberto: boolean;
  onFechar: () => void;
  children: ReactNode;
  /** Botões do rodapé. */
  pe?: ReactNode;
  larga?: boolean;
}) {
  const caixa = useRef<HTMLDivElement>(null);
  // Referência estável: `onFechar` costuma ser uma arrow nova a cada render,
  // e refazer o efeito a cada render roubaria o foco de quem está digitando.
  const fechar = useRef(onFechar);
  fechar.current = onFechar;

  useEffect(() => {
    if (!aberto) return;
    const ouvir = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        fechar.current();
      }
    };
    // Captura: chega antes do ouvinte de atalhos do App, que também escuta a
    // janela inteira.
    window.addEventListener("keydown", ouvir, true);
    caixa.current?.querySelector<HTMLElement>("input, select, textarea")?.focus();
    return () => window.removeEventListener("keydown", ouvir, true);
  }, [aberto]);

  if (!aberto) return null;

  return createPortal(
    <div
      className="modal-fundo"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) fechar.current();
      }}
    >
      <div
        className={`modal${larga ? " modal-larga" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        ref={caixa}
      >
        <div className="modal-cab">
          <h2>{titulo}</h2>
          <button className="btn btn-fantasma btn-icone" onClick={onFechar} aria-label="Fechar">
            <I.Fechar />
          </button>
        </div>
        <div className="modal-corpo">{children}</div>
        {pe && <div className="modal-pe">{pe}</div>}
      </div>
    </div>,
    document.body
  );
}
