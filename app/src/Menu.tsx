import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
 *
 * O menu vai para o `body` com posição fixa: dentro do cartão ele ficava
 * recortado pelo `overflow: hidden` do cartão e escondido atrás do seguinte.
 * Abre para baixo, alinhado à direita do botão; sem espaço embaixo, abre para
 * cima, e nunca sai da janela pela esquerda.
 */
export default function Menu({
  itens,
  rotulo = "Mais ações",
}: {
  itens: ItemMenu[];
  rotulo?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const ancora = useRef<HTMLSpanElement>(null);
  const caixa = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!aberto) {
      setPos(null);
      return;
    }
    const b = ancora.current?.getBoundingClientRect();
    const m = caixa.current?.getBoundingClientRect();
    if (!b || !m) return;
    const margem = 8;
    const abaixo = b.bottom + 4;
    const top =
      abaixo + m.height > window.innerHeight - margem && b.top - 4 - m.height > margem
        ? b.top - 4 - m.height
        : abaixo;
    const left = Math.max(margem, Math.min(b.right - m.width, window.innerWidth - margem - m.width));
    setPos({ top, left });
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      const alvo = e.target as Node;
      if (!ancora.current?.contains(alvo) && !caixa.current?.contains(alvo)) setAberto(false);
    };
    // Posição fixa não acompanha a rolagem: rolar ou redimensionar fecha.
    const fechar = () => setAberto(false);
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setAberto(false);
      }
    };
    document.addEventListener("mousedown", fora);
    window.addEventListener("keydown", tecla, true);
    window.addEventListener("scroll", fechar, true);
    window.addEventListener("resize", fechar);
    return () => {
      document.removeEventListener("mousedown", fora);
      window.removeEventListener("keydown", tecla, true);
      window.removeEventListener("scroll", fechar, true);
      window.removeEventListener("resize", fechar);
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
      {aberto &&
        createPortal(
        <div
          className="menu"
          role="menu"
          ref={caixa}
          // Evento de portal sobe pela árvore do React, não do DOM: sem isto o
          // clique no menu chegaria ao cartão (arrastar, abrir, selecionar).
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          style={pos ? { top: pos.top, left: pos.left } : { visibility: "hidden", top: 0, left: 0 }}
        >
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
        </div>,
          document.body
        )}
    </span>
  );
}
