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

Passo a passo completo, incluindo instalar o Rust e o Node numa máquina limpa,
está em **`06-linux.md`**. O resumo:

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

## Android

Fica em **`07-android.md`**, porque quase nada se aproveita daqui: outra cadeia
de ferramentas (SDK, NDK, JDK), outro formato, e um APK de release que sai **sem
assinatura** e por isso não instala. O CI também não o monta — é passo à mão.

## O que saiu na primeira montagem (v0.0.1)

| sistema | arquivo | tamanho |
|---|---|---|
| Windows | `estudos.exe` | 20 MB |
| Windows | `Estudos_0.0.1_x64_en-US.msi` | 7,2 MB |
| Windows | `Estudos_0.0.1_x64-setup.exe` | 5,1 MB |
| Linux | `Estudos_0.0.1_amd64.AppImage` | 83 MB |
| Linux | `Estudos_0.0.1_amd64.deb` | 9,2 MB |
| Linux | `Estudos-0.0.1-1.x86_64.rpm` | 9,2 MB |

O `.deb` declara as dependências certas, e a que mais importa está lá:

```
Depends: libayatana-appindicator3-1, libwebkit2gtk-4.1-0, libgtk-3-0
```

`libayatana-appindicator3-1` é a bandeja. Se ela sumisse da lista, o app
instalaria e subiria sem ícone nenhum — e ninguém saberia por quê.

## CI

`.github/workflows/build.yml` monta Windows e Linux na mesma execução, em tag
`v*` ou à mão pelo `workflow_dispatch`. O Android fica de fora: exige SDK, NDK e
uma chave de assinatura, e a de depuração não teria sentido num servidor.

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
