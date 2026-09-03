# Empacotamento

## O Tauri não faz cross-compile

O webview é do sistema: WebView2 no Windows, WebKitGTK no Linux. Cada um exige o
linker e as bibliotecas de desenvolvimento daquele sistema, e não existe alvo do
Rust que resolva isso — `rustup target add` monta o binário, não o webview.

Então: **uma máquina por sistema**, ou o CI, que é a mesma coisa com máquinas
emprestadas.

## Windows

```
npm run tauri build --prefix app
```

Sai em `app/src-tauri/target/release/`:

| arquivo | o que é |
|---|---|
| `estudos.exe` | executável avulso, não precisa instalar |
| `bundle/msi/Estudos_<versão>_x64_en-US.msi` | instalador MSI |
| `bundle/nsis/Estudos_<versão>_x64-setup.exe` | instalador NSIS |

O WiX e o NSIS são baixados pelo próprio Tauri na primeira execução. Nada a
instalar antes além do Rust com a cadeia MSVC e do Node.

## Linux

Rodar **na máquina Linux**, com as bibliotecas de desenvolvimento presentes:

```
sudo apt install libwebkit2gtk-4.1-dev libayatana-appindicator3-dev \
  librsvg2-dev libxdo-dev libssl-dev build-essential patchelf file
npm ci --prefix app
npm run tauri build --prefix app
```

Sai `.deb`, `.rpm` e `.AppImage` em `app/src-tauri/target/release/bundle/`.

Em Fedora e derivados os nomes mudam: `webkit2gtk4.1-devel`,
`libayatana-appindicator-gtk3-devel`, `librsvg2-devel`, `libxdo-devel`,
`openssl-devel`.

### O que muda de comportamento no Linux

Três coisas dependem do ambiente e **não** são cobertas por compilar com
sucesso. Estão na lista de não verificado de `04-pendencias.md`:

- **Bandeja do sistema.** Precisa de `libayatana-appindicator3` em tempo de
  execução. No GNOME moderno ainda depende de uma extensão de ícones de
  bandeja; sem ela o app sobe normalmente e o ícone simplesmente não aparece.
- **Cofre de credenciais.** O `keyring` usa o Secret Service — na prática,
  `gnome-keyring` ou o KWallet, destravado. Sem ele o token de renovação do
  Supabase não tem onde ficar, e o app pede login a cada abertura. É de
  propósito: o token nunca vai para o banco (D-025).
- **Notificações.** Vão pelo `notify-send`/D-Bus. Ambiente sem daemon de
  notificação engole o aviso de fim do Pomodoro.

## CI

`.github/workflows/build.yml` monta os dois sistemas na mesma execução, em tag
`v*` ou à mão pelo `workflow_dispatch`.

Em tag, publica um **rascunho** de release, e não uma pública: ninguém quer
descobrir um instalador quebrado depois de ele já estar no ar. Revise, baixe,
teste e só então publique.

Os testes do Rust rodam antes do empacotamento. Compilar não é o mesmo que estar
certo, e um instalador gerado a partir de código quebrado é pior que nenhum
instalador.

## O que ainda falta da Fase 6

- **Assinatura.** Sem certificado, o Windows mostra o aviso do SmartScreen na
  primeira execução e o AppImage não tem procedência verificável. Comprar
  certificado de code signing é decisão de custo, não técnica.
- **Atualização automática e rollback.** O `tauri-plugin-updater` precisa de um
  par de chaves e de um endereço servindo o manifesto. Faz sentido depois de
  existir release público, não antes.
