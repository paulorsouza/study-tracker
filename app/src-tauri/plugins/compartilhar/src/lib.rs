//! "Compartilhar → Estudos" no Android (D-047, F4).
//!
//! O plugin existe para levar ao projeto Android uma tela a mais,
//! `CompartilharActivity`, declarada no manifesto da biblioteca: `gen/android`
//! é gerado e fica fora do repositório (`docs/07-android.md`), então o
//! `intent-filter` não pode morar lá. A tela copia as imagens recebidas para
//! `<dados do app>/compartilhados/` e abre o app; a interface pergunta por elas
//! ao voltar ao primeiro plano.

use tauri::{
    plugin::{Builder, TauriPlugin},
    Runtime,
};

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("compartilhar")
        .setup(|_app, _api| {
            #[cfg(target_os = "android")]
            _api.register_android_plugin("app.estudos.compartilhar", "CompartilharPlugin")?;
            Ok(())
        })
        .build()
}
