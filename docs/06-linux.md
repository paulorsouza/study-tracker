# Linux, do zero

Guia para montar e testar o app numa máquina Linux limpa. `05-empacotamento.md`
explica **por que** o Linux não sai da máquina Windows; este aqui é o passo a
passo de quem está sentado na máquina Linux.

## 1. Ferramentas

```bash
# Rust — a cadeia estável basta, não há nada de nightly no projeto
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"

# Node 22. Distribuição costuma trazer versão velha; o nvm evita a discussão
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source "$HOME/.nvm/nvm.sh" && nvm install 22

git --version   # e o git, que o app usa para sincronizar o vault
```

## 2. Bibliotecas do sistema

**Debian, Ubuntu, Mint, Pop!\_OS:**

```bash
sudo apt update
sudo apt install -y libwebkit2gtk-4.1-dev libayatana-appindicator3-dev \
  librsvg2-dev libxdo-dev libssl-dev build-essential patchelf file \
  pkg-config curl wget
```

**Fedora, RHEL, Nobara:**

```bash
sudo dnf install -y webkit2gtk4.1-devel libayatana-appindicator-gtk3-devel \
  librsvg2-devel libxdo-devel openssl-devel patchelf file \
  @development-tools
```

**Arch, Manjaro, EndeavourOS:**

```bash
sudo pacman -S --needed webkit2gtk-4.1 libayatana-appindicator librsvg xdotool \
  openssl patchelf file base-devel
```

O que cada uma faz, porque a falta de uma delas dá erro difícil de ler:

| biblioteca | para quê | se faltar |
|---|---|---|
| `webkit2gtk-4.1` | o webview, onde a interface roda | não compila |
| `libayatana-appindicator3` | bandeja do sistema | compila e **sobe sem ícone** |
| `librsvg2` | ícones vetoriais do sistema | ícone quebrado |
| `libxdo` | plugin de janela | não compila |
| `patchelf` | exigido pelo AppImage | falha só no empacotamento |

## 3. Montar

```bash
git clone https://github.com/paulorsouza/study-tracker.git
cd study-tracker/app
npm ci
cd src-tauri && cargo test --lib && cd ..
npm run tauri build
```

A primeira compilação leva alguns minutos — são cerca de trezentas caixas do
Rust. Saem em `app/src-tauri/target/release/bundle/`:

- `deb/Estudos_<versão>_amd64.deb`
- `rpm/Estudos-<versão>-1.x86_64.rpm`
- `appimage/Estudos_<versão>_amd64.AppImage`

Para desenvolver em vez de empacotar: `npm run tauri dev`.

## 4. Instalar e rodar

```bash
sudo dpkg -i src-tauri/target/release/bundle/deb/Estudos_*.deb   # ou dnf/pacman
estudos
```

Ou, sem instalar:

```bash
chmod +x src-tauri/target/release/bundle/appimage/Estudos_*.AppImage
./src-tauri/target/release/bundle/appimage/Estudos_*.AppImage
```

O banco nasce em `~/.local/share/com.prs.estudos/estudos.sqlite3`. Primeira
abertura aplica todas as migrações e semeia as categorias.

## 5. O que só se descobre rodando

Compilar não prova nenhuma destas. São as que estão em `04-pendencias.md`,
seção "Não verificado":

### Bandeja do sistema

O ícone deve aparecer na área de notificação. Clique esquerdo traz a janela;
direito abre o menu com as atividades recentes.

No **GNOME** não aparece sem extensão — instale *AppIndicator and KStatusNotifierItem
Support*. Isso não é defeito do app; o GNOME removeu a bandeja em 2017 e a
extensão é o caminho oficial. No KDE, Cinnamon e XFCE funciona direto.

### Cofre de credenciais

O token de renovação do Supabase vai para o Secret Service, nunca para o banco
(D-025). Precisa de `gnome-keyring` ou KWallet instalado **e destravado**.

```bash
sudo apt install gnome-keyring   # se o ambiente não tiver
```

Sem ele, entrar na conta funciona mas a sessão se perde a cada abertura. O
sintoma é esse; a causa é o cofre, não o login.

### Notificações

O fim do foco do Pomodoro avisa por D-Bus. Ambiente sem daemon de notificação
engole o aviso — teste com a janela **minimizada**, que é o caso real.

### Janela sem decoração

A barra de título é do app (D-028). Confirme que dá para redimensionar
arrastando as bordas e que maximizar e restaurar funcionam no seu compositor.
Wayland e X11 se comportam diferente aqui.

### Ponte HTTP e extensão do Chrome

A ponte escuta em `127.0.0.1:47823`. Confirme que a extensão pareia e que o
cronômetro começa a partir do navegador.

```bash
curl -s localhost:47823/cursos            # deve dar 401 sem token
```

## 6. Sincronizar com a máquina Windows

O ponto do §7: as duas máquinas convergirem. Em **Configurações →
Sincronização**, use a mesma URL e a mesma chave `anon` do projeto Supabase, e
entre com a mesma conta.

Rode o SQL de `Configurações → Sincronização → Ver SQL` no editor do Supabase
**antes** — ele é idempotente e já inclui a política de `delete`, que faltava
até a versão 0.0.1.

Depois: lance tempo aqui, sincronize, sincronize no Windows e confira que
chegou. E o contrário. Conflito não é erro — é a área de recuperação
funcionando, e o Painel avisa no topo.
