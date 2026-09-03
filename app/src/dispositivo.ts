import { useEffect, useState } from "react";

/**
 * Largura a partir da qual a barra lateral cabe.
 *
 * O corte é por **largura**, não por sistema operacional. Um tablet Android
 * deitado tem espaço de sobra para a lateral, e uma janela estreita no desktop
 * sofre do mesmo aperto que um celular — tratar os dois pela mesma regra dá
 * um layout só para manter, em vez de dois que divergem.
 */
export const LARGURA_LATERAL = 760;

/** `true` quando a tela é estreita demais para a barra lateral. */
export function useCompacto(): boolean {
  const [compacto, setCompacto] = useState(
    () => typeof window !== "undefined" && window.innerWidth < LARGURA_LATERAL
  );

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${LARGURA_LATERAL - 1}px)`);
    const ouvir = (e: MediaQueryListEvent | MediaQueryList) => setCompacto(e.matches);
    ouvir(mq);
    mq.addEventListener("change", ouvir);
    return () => mq.removeEventListener("change", ouvir);
  }, []);

  return compacto;
}

/**
 * Se estamos rodando num celular ou tablet, e não numa janela estreita.
 *
 * Separado de `useCompacto` de propósito: largura decide **layout**, sistema
 * decide **quais recursos existem**. Encolher a janela no Windows não deveria
 * esconder o Obsidian, e um tablet largo não deveria mostrar a bandeja do
 * sistema — que lá não existe.
 */
export const ehMovel = /android/i.test(
  typeof navigator === "undefined" ? "" : navigator.userAgent
);
