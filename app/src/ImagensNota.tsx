import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import * as I from "./icones";

/**
 * Imagens da nota (D-047): o desenho feito no tablet entra pela galeria, pela
 * área de transferência ou arrastado para a nota.
 *
 * A redução acontece aqui, no canvas, e não no Rust: o navegador já sabe ler
 * qualquer formato que a galeria entregue, e assim o arquivo que cruza a ponte
 * já é o pequeno.
 */

/** Lado maior da imagem guardada. Traço de caneta continua nítido em 2400px. */
const LADO_MAX = 2400;
/** Lado maior da miniatura: o cartão tem ~300px, o dobro cobre tela HiDPI. */
const LADO_MINI = 640;

export type ImagemNova = {
  imagem: string;
  mini: string;
  largura: number;
  altura: number;
};

/** Imagem na tela do editor: a que já existe tem `id`, a nova tem `nova`. */
export type ItemImagem = {
  chave: string;
  id?: string;
  mini: string | null;
  presente: boolean;
  nova?: ImagemNova;
};

type ImagemSalva = {
  id: string;
  largura: number;
  altura: number;
  bytes: number;
  mini: string | null;
  presente: boolean;
};

function carregar(arquivo: Blob): Promise<HTMLImageElement> {
  return new Promise((ok, falha) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      ok(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      falha(new Error("não consegui abrir a imagem"));
    };
    img.src = url;
  });
}

/**
 * Fundo branco antes de desenhar: desenho exportado com fundo transparente
 * ficaria preto sobre preto no tema escuro.
 */
function desenhar(img: HTMLImageElement, lado: number, tipo: string) {
  const escala = Math.min(1, lado / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * escala));
  const h = Math.max(1, Math.round(img.naturalHeight * escala));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, w, h);
  return { url: canvas.toDataURL(tipo, 0.9), w, h };
}

/**
 * WebP quando o motor sabe gerar. O WebKitGTK do Linux não sabe (devolve PNG
 * para `image/webp`); aí fica o menor entre PNG e JPEG — PNG ganha no traço
 * sobre fundo branco, JPEG na foto, onde o PNG passa de 8 MB. Imagem e
 * miniatura saem no mesmo formato.
 */
export async function reduzir(arquivo: Blob): Promise<ImagemNova> {
  const img = await carregar(arquivo);
  let cheia = desenhar(img, LADO_MAX, "image/webp");
  let tipo = "image/webp";
  if (!cheia.url.startsWith("data:image/webp")) {
    const png = cheia; // o que voltou já é PNG
    const jpeg = desenhar(img, LADO_MAX, "image/jpeg");
    [cheia, tipo] = jpeg.url.length < png.url.length ? [jpeg, "image/jpeg"] : [png, "image/png"];
  }
  const mini = desenhar(img, LADO_MINI, tipo);
  return { imagem: cheia.url, mini: mini.url, largura: cheia.w, altura: cheia.h };
}

export const ehImagem = (f: File) => f.type.startsWith("image/");

export async function imagensDe(arquivos: Iterable<File>): Promise<ItemImagem[]> {
  const itens: ItemImagem[] = [];
  for (const f of arquivos) {
    if (!ehImagem(f)) continue;
    const nova = await reduzir(f);
    itens.push({ chave: crypto.randomUUID(), mini: nova.mini, presente: true, nova });
  }
  return itens;
}

export function imagensSalvas(notaId: string): Promise<ItemImagem[]> {
  return invoke<ImagemSalva[]>("nota_imagens", { notaId }).then((l) =>
    l.map((i) => ({ chave: i.id, id: i.id, mini: i.mini, presente: i.presente }))
  );
}

/**
 * Grava as novas e exclui as removidas, depois que a nota já tem id. Avisa a
 * cada uma que entrou: se a terceira falhar, salvar de novo não duplica as
 * duas primeiras.
 */
export async function gravarImagens(
  notaId: string,
  itens: ItemImagem[],
  removidas: string[],
  onGravada: (chave: string, id: string) => void,
  onExcluida: (id: string) => void
) {
  for (const id of removidas) {
    await invoke("nota_imagem_excluir", { id });
    onExcluida(id);
  }
  for (const i of itens) {
    if (!i.nova) continue;
    const id = await invoke<string>("nota_imagem_adicionar", {
      notaId,
      imagem: i.nova.imagem,
      mini: i.nova.mini,
      largura: i.nova.largura,
      altura: i.nova.altura,
    });
    onGravada(i.chave, id);
  }
}

export function Galeria({
  itens,
  onRemover,
  onErro,
}: {
  itens: ItemImagem[];
  onRemover: (chave: string) => void;
  onErro: (e: string | null) => void;
}) {
  const [aberta, setAberta] = useState<ItemImagem | null>(null);
  if (itens.length === 0) return null;
  return (
    <>
      <div className="nota-imagens">
        {itens.map((i) => (
          <div key={i.chave} className="nota-imagem">
            <button
              className="nota-imagem-abrir"
              onClick={() => i.presente && setAberta(i)}
              aria-label="Abrir imagem"
              disabled={!i.presente}
            >
              {i.mini ? <img src={i.mini} alt="" /> : <I.Imagem size={22} />}
            </button>
            <button
              className="nota-imagem-tirar"
              onClick={() => onRemover(i.chave)}
              aria-label="Remover imagem"
            >
              <I.Fechar size={13} />
            </button>
          </div>
        ))}
      </div>
      {aberta && <TelaCheia item={aberta} onFechar={() => setAberta(null)} onErro={onErro} />}
    </>
  );
}

function TelaCheia({
  item,
  onFechar,
  onErro,
}: {
  item: ItemImagem;
  onFechar: () => void;
  onErro: (e: string | null) => void;
}) {
  const [src, setSrc] = useState<string | null>(item.nova?.imagem ?? null);
  // Referências estáveis: os callbacks chegam como arrows novas a cada render,
  // e refazer o efeito buscaria a imagem inteira de novo.
  const fechar = useRef(onFechar);
  fechar.current = onFechar;
  const erro = useRef(onErro);
  erro.current = onErro;

  useEffect(() => {
    if (item.nova || !item.id) return;
    invoke<string>("nota_imagem", { id: item.id })
      .then(setSrc)
      .catch((e) => {
        erro.current(String(e));
        fechar.current();
      });
  }, [item]);

  useEffect(() => {
    const ouvir = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        fechar.current();
      }
    };
    window.addEventListener("keydown", ouvir, true);
    return () => window.removeEventListener("keydown", ouvir, true);
  }, []);

  return createPortal(
    <div className="tela-cheia" onClick={onFechar} role="dialog" aria-modal="true" aria-label="Imagem">
      {src && <img src={src} alt="" />}
      <button className="btn btn-fantasma btn-icone tela-cheia-fechar" aria-label="Fechar">
        <I.Fechar />
      </button>
    </div>,
    document.body
  );
}
