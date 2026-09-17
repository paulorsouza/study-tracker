//! Cliente HTTP único do app.
//!
//! Existe por causa do Android. O reqwest, com rustls, verifica certificados
//! pelo verificador da plataforma — e no Android esse verificador fala com o
//! sistema por JNI e só funciona depois de uma inicialização feita do lado
//! Java, que o app não faz. Sem ela, **toda** chamada HTTPS falha no celular:
//! login, sincronização, modo família.
//!
//! No Android, então, o cliente confia só nas raízes do Mozilla embutidas no
//! binário (`webpki-root-certs`). É o mesmo conjunto que os navegadores usam,
//! e o Supabase é servido por certificado público comum. No desktop nada muda:
//! continua o verificador do sistema, que respeita certificado corporativo
//! instalado na máquina.
//!
//! Um cliente compartilhado também reaproveita conexões: com o tempo real, a
//! sincronização passa a rodar muitas vezes por hora, e abrir TLS do zero a
//! cada rodada seria custo à toa.

use std::sync::OnceLock;
use std::time::Duration;

/// Sem tempo limite total de propósito: o mesmo cliente carrega o WebSocket do
/// tempo real, que vive horas. Quem precisa de limite o põe no pedido.
pub fn cliente() -> reqwest::Client {
    static C: OnceLock<reqwest::Client> = OnceLock::new();
    C.get_or_init(|| {
        let b = reqwest::Client::builder().connect_timeout(Duration::from_secs(10));
        #[cfg(target_os = "android")]
        let b = b.tls_certs_only(raizes());
        b.build().unwrap_or_else(|_| reqwest::Client::new())
    })
    .clone()
}

/// Cliente do WebSocket do tempo real. Separado porque o handshake exige
/// HTTP/1.1, e o cliente comum negocia HTTP/2 com o Supabase quando pode —
/// aí a troca de protocolo falha sem explicação útil.
pub fn cliente_ws() -> reqwest::Client {
    static C: OnceLock<reqwest::Client> = OnceLock::new();
    C.get_or_init(|| {
        let b = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(10))
            .http1_only();
        #[cfg(target_os = "android")]
        let b = b.tls_certs_only(raizes());
        b.build().unwrap_or_else(|_| reqwest::Client::new())
    })
    .clone()
}

pub fn cliente_bloqueante(limite: Duration) -> Result<reqwest::blocking::Client, String> {
    let b = reqwest::blocking::Client::builder().timeout(limite);
    #[cfg(target_os = "android")]
    let b = b.tls_certs_only(raizes());
    b.build().map_err(|e| e.to_string())
}

#[cfg(target_os = "android")]
fn raizes() -> Vec<reqwest::Certificate> {
    webpki_root_certs::TLS_SERVER_ROOT_CERTS
        .iter()
        .filter_map(|c| reqwest::Certificate::from_der(c.as_ref()).ok())
        .collect()
}
