# Android

O app no celular e no tablet é um **companheiro de bolso**, não o desktop
espremido. Isso é decisão, não limitação de tempo: seis partes do produto
dependem de coisas que o Android não tem, e fingir que estão lá seria pior que
declarar a ausência.

## O que não vai, e por quê

| parte | por quê |
|---|---|
| bandeja do sistema | o Android não tem bandeja |
| modo compacto e janela do curso | são segundas janelas; lá há uma atividade só |
| sincronização do vault por git | roda o binário `git` num processo externo |
| ponte HTTP e extensão do Chrome | a extensão não existe no Android |
| servidor MCP | é processo de desktop, ligado ao Claude Desktop |
| exportação para o Obsidian | grava numa pasta escolhida, e o armazenamento do Android tem escopo |
| calendário | criar, mover e esticar bloco só existem por arrasto |
| atalhos de teclado | combinações que ninguém aperta num celular |
| dividir e unir lançamento | escolher o minuto do corte pede precisão que o dedo não tem |
| painel | resumo do que já passou não é o que se abre no ônibus |

Os seis primeiros **nem são compilados** — os módulos saem por `#[cfg(desktop)]`
e as caixas `tray-icon`, `keyring` e `tiny_http` são dependências só de
não-Android. O calendário existe no código, mas a aba some em tela estreita: uma
grade bonita e inerte é pior que ausência, porque parece que deveria funcionar.

## O cofre de credenciais

O `keyring` **não tem backend Android**. As saídas seriam guardar o token de
renovação no banco — exatamente o que D-025 proíbe, porque uma cópia do arquivo
levaria a sessão junto — ou escrever uma ponte para o Keystore.

Enquanto a ponte não existe, no Android o token fica **só em memória** e o app
pede login a cada abertura. Menos cômodo, e nunca menos seguro. Quando o
Keystore entrar, mudam três funções em `supabase.rs` e nada mais.

## Layout

O corte é por **largura**, não por sistema operacional, e são dois:

- **abaixo de 900px** a linha do lançamento vira três faixas. A barra lateral
  custa 224px, então um tablet em pé com 768px tem menos de 550px de conteúdo e
  sofre o mesmo aperto de um celular. Antes disso a descrição dividia espaço com
  caixa, cor, ícone, horário, duração e cinco botões — e sobrava com um
  caractere.
- **abaixo de 760px** a barra lateral vira barra de baixo, onde o polegar
  alcança, e o cronômetro vira uma faixa acima dela.

Tratar janela estreita no desktop e celular pela mesma regra dá um layout só
para manter, em vez de dois que divergem. O que depende de sistema — e não de
espaço — fica em `ehMovel`, separado de propósito.

## Montar

Uma vez, na máquina:

```bash
# JDK 17 ou mais novo, e o SDK com NDK
sdkmanager "platform-tools" "platforms;android-35" \
           "build-tools;35.0.0" "ndk;27.2.12479018"
rustup target add aarch64-linux-android armv7-linux-androideabi \
                  i686-linux-android x86_64-linux-android
```

Variáveis de ambiente, apontando para onde o SDK ficou:

```bash
export ANDROID_HOME="$HOME/Android/Sdk"          # no Windows: %LOCALAPPDATA%\Android\Sdk
export NDK_HOME="$ANDROID_HOME/ndk/27.2.12479018"
export JAVA_HOME=...
```

Depois:

```bash
npm run tauri android init          # só na primeira vez
npm run tauri android build -- --apk --target aarch64
```

`--target aarch64` cobre praticamente todo aparelho em uso hoje. Sem o
parâmetro, o Tauri monta as quatro arquiteturas e demora quatro vezes mais.

### O que sai, e qual dos dois instala

| build | tamanho | instala? |
|---|---|---|
| release, como sai | 23 MB (arm64) · 37 MB (arm64+arm32) | **não**, sem assinatura |
| depuração | 199 MB | sim |
| release assinado à mão | 37 MB | sim — é o que se entrega |

O de release sai **sem assinatura** e o Android recusa instalar. O de depuração
é assinado com a chave padrão e entra no aparelho, mas os 199 MB são o Rust sem
otimização.

O melhor dos dois é assinar o release à mão com a mesma chave de depuração:

```bash
BT="$ANDROID_HOME/build-tools/35.0.0"
BASE=app/src-tauri/gen/android/app/build/outputs/apk/universal/release
"$BT/zipalign" -p -f 4 "$BASE/app-universal-release-unsigned.apk" alinhado.apk
"$BT/apksigner" sign --ks ~/.android/debug.keystore   --ks-pass pass:android --key-pass pass:android   --ks-key-alias androiddebugkey --out Estudos-0.0.1-arm.apk alinhado.apk
```

`~/.android/debug.keystore` e a senha `android` são **convenção pública** do
Android SDK, criadas por qualquer build de depuração — não são segredo de
ninguém. Servem para instalar no próprio aparelho e não servem para loja.

Com `--target aarch64 --target armv7` o APK sai com as duas arquiteturas, 37 MB,
e cobre celular novo e tablet antigo no mesmo arquivo.

Para um APK pequeno e instalável é preciso uma chave sua:

```bash
keytool -genkey -v -keystore ~/estudos.jks \
        -keyalg RSA -keysize 2048 -validity 10000 -alias estudos
```

Depois, `app/src-tauri/gen/android/keystore.properties` apontando para ela. Esse
arquivo tem senha e **não entra no repositório** — nem ele nem o `.jks`. Como
`gen/` é gerado, isso é passo por máquina.

### Instalar no aparelho

```bash
adb install -r app/src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk
```

Ou copie o arquivo para o celular e abra, com "instalar de fontes desconhecidas"
liberado para o gerenciador de arquivos.

Para desenvolver com o aparelho ligado por USB, com recarga automática:

```bash
npm run tauri android dev
```

## `gen/android` entra no repositório?

**Não.** É projeto gerado, e `tauri android init` o recria a partir do
`tauri.conf.json`. Versioná-lo significaria manter dois lugares onde o nome do
app, o identificador e os ícones vivem — e eles divergiriam na primeira
alteração feita num só. Está no `.gitignore`.

A exceção seria configuração de assinatura, que ainda não existe.

## O que falta

- **Assinatura.** O APK sai assinado com a chave de depuração, que serve para
  instalar no próprio aparelho e não serve para distribuir.
- **Ponte para o Keystore**, para o login sobreviver ao fechamento.
- **Nada foi exercitado num aparelho.** Montar não é funcionar, e aqui a
  distinção é grande: o APK foi produzido e inspecionado — identificador,
  `MainActivity`, permissões de internet e de notificação, biblioteca nativa
  `arm64-v8a` — mas ninguém abriu o app. Se a interface embutida sobe, se a
  barra de baixo funciona no toque, se o banco nasce no diretório certo e se a
  sincronização fala com o Supabase: tudo em aberto. A lista está em
  `04-pendencias.md`.
