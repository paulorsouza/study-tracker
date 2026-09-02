/** Ícones inline: sem fonte externa, sem requisição, sem CSP relaxada. */

type P = { size?: number };

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  focusable: false,
});

export const Relogio = ({ size = 17 }: P) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

export const Livro = ({ size = 17 }: P) => (
  <svg {...base(size)}>
    <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" />
    <path d="M4 19a2 2 0 0 1 2-2h13" />
  </svg>
);

export const Calendario = ({ size = 17 }: P) => (
  <svg {...base(size)}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </svg>
);

export const Engrenagem = ({ size = 17 }: P) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
  </svg>
);

export const Play = ({ size = 16 }: P) => (
  <svg {...base(size)} fill="currentColor" stroke="none">
    <path d="M8 5.5v13l11-6.5z" />
  </svg>
);

export const Parar = ({ size = 16 }: P) => (
  <svg {...base(size)} fill="currentColor" stroke="none">
    <rect x="7" y="7" width="10" height="10" rx="2" />
  </svg>
);

export const Lapis = ({ size = 15 }: P) => (
  <svg {...base(size)}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
  </svg>
);

export const Lixeira = ({ size = 15 }: P) => (
  <svg {...base(size)}>
    <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
  </svg>
);

export const Estrela = ({ size = 15, cheia = false }: P & { cheia?: boolean }) => (
  <svg {...base(size)} fill={cheia ? "currentColor" : "none"}>
    <path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.7l5.9-.8z" />
  </svg>
);

export const Externo = ({ size = 15 }: P) => (
  <svg {...base(size)}>
    <path d="M15 3h6v6M10 14 21 3M19 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6" />
  </svg>
);

export const Seta = ({ size = 16, dir = "esq" }: P & { dir?: "esq" | "dir" }) => (
  <svg {...base(size)} style={{ transform: dir === "dir" ? "rotate(180deg)" : undefined }}>
    <path d="M15 5l-7 7 7 7" />
  </svg>
);

export const Alerta = ({ size = 18 }: P) => (
  <svg {...base(size)}>
    <path d="M12 3.5 22 20H2z" />
    <path d="M12 10v4M12 17.2v.1" />
  </svg>
);

export const Sol = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);

export const Lua = ({ size = 16 }: P) => (
  <svg {...base(size)}>
    <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
  </svg>
);

export const Mais = ({ size = 15 }: P) => (
  <svg {...base(size)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const Lista = ({ size = 17 }: P) => (
  <svg {...base(size)}>
    <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />
  </svg>
);

export const Painel = ({ size = 17 }: P) => (
  <svg {...base(size)}>
    <path d="M4 20V10M10 20V4M16 20v-7M21 20H3" />
  </svg>
);

export const Alvo = ({ size = 17 }: P) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" />
  </svg>
);

export const Nota = ({ size = 17 }: P) => (
  <svg {...base(size)}>
    <path d="M5 4a1 1 0 0 1 1-1h8l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z" />
    <path d="M14 3v5h5M8.5 13h7M8.5 17h5" />
  </svg>
);

export const Alfinete = ({ size = 15, preso = true }: P & { preso?: boolean }) => (
  <svg {...base(size)} fill={preso ? "currentColor" : "none"}>
    <path d="M9 3h6l-1 6 3 3v2H7v-2l3-3z" />
    <path d="M12 14v7" fill="none" />
  </svg>
);

export const Expandir = ({ size = 15 }: P) => (
  <svg {...base(size)}>
    <path d="M4 10V4h6M20 14v6h-6M4 4l7 7M20 20l-7-7" />
  </svg>
);

export const Fechar = ({ size = 15 }: P) => (
  <svg {...base(size)}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export const Janelinha = ({ size = 17 }: P) => (
  <svg {...base(size)}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3 9h18" />
    <rect x="6" y="12" width="7" height="4" rx="1" />
  </svg>
);
