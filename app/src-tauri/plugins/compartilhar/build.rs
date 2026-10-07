// Sem comandos: a tela do Android só copia o arquivo para a pasta de dados, e
// quem lê de lá é o próprio app (`imagens::compartilhados_pendentes`).
const COMMANDS: &[&str] = &[];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();
}
