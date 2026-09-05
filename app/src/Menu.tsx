import { ReactNode, useEffect, useRef, useState } from "react";
import * as I from "./icones";

export type ItemMenu = {
  rotulo: string;
  icone?: ReactNode;
  onClick: () => void;
  perigo?: boolean;
  desativado?: boolean;
};

/**
 * Três pontos no lugar de uma fileira de ícones. A linha mostra o que é; o
 * que se pode fazer com ela fica a um clique, e não disputa a atenção com o
 * conteúdo.
 */
export default function Menu({
  itens,
  rotulo = "Mais ações",
}: {
  itens: ItemMenu[];
  rotulo?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const ancora = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (!ancora.current?.contains(e.target as Node)) setAberto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setAberto(false);
      }
    };
    document.addEventListener("mousedown", fora);
    window.addEventListener("keydown", tecla, true);
    return () => {
      document.removeEventListener("mousedown", fora);
      window.removeEventListener("keydown", tecla, true);
    };
  }, [aberto]);

  return (
    <span className="menu-anc" ref={ancora}>
      <button
        type="button"
        className="btn btn-fantasma btn-icone"
        aria-label={rotulo}
        aria-haspopup="menu"
        aria-expanded={aberto}
        title={rotulo}
        onClick={(e) => {
          e.stopPropagation();
          setAberto((v) => !v);
        }}
      >
        <I.Reticencias />
      </button>
      {aberto && (
        <div className="menu" role="menu">
          {itens.map((it) => (
            <button
              key={it.rotulo}
              type="button"
              role="menuitem"
              className={`menu-item${it.perigo ? " perigo" : ""}`}
              disabled={it.desativado}
              onClick={(e) => {
                e.stopPropagation();
                setAberto(false);
                it.onClick();
              }}
            >
              {it.icone}
              {it.rotulo}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
