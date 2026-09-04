# `app/`

O aplicativo Tauri 2 — React + TypeScript na interface, Rust no `src-tauri/`.

```bash
npm install
npm run tauri dev     # app
npm run dev           # só a interface, no navegador, com o backend simulado
```

O `npm run dev` sobe a interface sem o Rust: `src/mock-dev.ts` instala um
`invoke` falso antes do primeiro render, para dar para avaliar layout e
densidade no navegador. Ele **não** entra no app instalado. E não substitui
teste de verdade — um mock que acompanha a interface e não o backend faz a
interface conversar consigo mesma.

Testes do Rust:

```bash
cd src-tauri && cargo test --lib
```

O resto está em `../docs/`: `05-empacotamento.md` para gerar instaladores,
`06-linux.md` e `07-android.md` para as outras plataformas, e
`01-decisoes.md` para entender por que as coisas são como são.
