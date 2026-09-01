//! Janela de curso (P1, P2, P3).
//!
//! A janela que carrega conteúdo remoto NÃO recebe capability nenhuma — só a
//! janela `main` está listada em `capabilities/default.json`. A página da
//! Hotmart ou da T2 não tem `invoke`, não alcança comando nativo e não vê o
//! estado do app. O único código do app que roda lá dentro é o overlay de
//! diagnóstico abaixo, que só lê e desenha.

use tauri::{WebviewUrl, WebviewWindowBuilder};

/// Sonda de DRM injetada antes do carregamento da página.
///
/// Responde a pergunta que decide D-001: o motor embarcado consegue tocar
/// conteúdo protegido? A sonda faz duas coisas — testa se o CDM Widevine
/// existe, e intercepta o pedido real do player para saber se aquele curso
/// específico usa DRM (na Hotmart isso varia por produtor, ver D-004).
const DIAG_SCRIPT: &str = r#"
(function () {
  if (window.__estudosDiag) return;
  window.__estudosDiag = true;

  var linhas = [];
  var caixa = null;

  function log(txt) {
    linhas.push(new Date().toLocaleTimeString() + '  ' + txt);
    desenhar();
  }

  function desenhar() {
    if (!caixa || !document.body) return;
    caixa.querySelector('[data-corpo]').textContent = linhas.join('\n');
  }

  // --- 1. o CDM existe neste motor? ---
  var config = [{
    initDataTypes: ['cenc'],
    videoCapabilities: [{ contentType: 'video/mp4;codecs="avc1.42E01E"' }]
  }];

  var pedir = null;
  try {
    pedir = navigator.requestMediaKeySystemAccess &&
            navigator.requestMediaKeySystemAccess.bind(navigator);
  } catch (e) { /* ignora */ }

  if (!pedir) {
    log('EME ausente: navigator.requestMediaKeySystemAccess nao existe');
  } else {
    ['com.widevine.alpha', 'com.microsoft.playready', 'org.w3.clearkey'].forEach(function (ks) {
      pedir(ks, config).then(
        function () { log('CDM disponivel: ' + ks); },
        function (err) { log('CDM indisponivel: ' + ks + ' (' + err.name + ')'); }
      );
    });

    // --- 2. este curso pede DRM? ---
    navigator.requestMediaKeySystemAccess = function (ks, cfg) {
      log('>>> A PAGINA PEDIU DRM: ' + ks);
      return pedir(ks, cfg);
    };
  }

  // --- 3. o video efetivamente toca? ---
  var vistos = new WeakSet();
  function vigiarVideos() {
    var vs = document.querySelectorAll('video');
    for (var i = 0; i < vs.length; i++) {
      var v = vs[i];
      if (vistos.has(v)) continue;
      vistos.add(v);
      log('<video> encontrado (' + vs.length + ' na pagina)');
      v.addEventListener('playing', function () { log('video: tocando'); });
      v.addEventListener('error', function (e) {
        var err = e.target.error;
        log('video: ERRO code=' + (err ? err.code : '?') + ' ' + (err ? err.message : ''));
      });
      v.addEventListener('encrypted', function () { log('video: fluxo criptografado (DRM ativo)'); });
    }
  }

  function montar() {
    if (!document.body) return;

    caixa = document.createElement('div');
    caixa.setAttribute('style', [
      'position:fixed', 'right:12px', 'bottom:12px', 'z-index:2147483647',
      'width:380px', 'max-height:40vh', 'overflow:auto',
      'background:rgba(17,17,20,.94)', 'color:#e6e6e6',
      'font:11px/1.5 ui-monospace,Consolas,monospace',
      'border:1px solid #444', 'border-radius:8px', 'padding:8px 10px',
      'white-space:pre-wrap', 'box-shadow:0 4px 24px rgba(0,0,0,.5)'
    ].join(';'));

    var topo = document.createElement('div');
    topo.setAttribute('style', 'display:flex;justify-content:space-between;margin-bottom:6px;color:#9ad');
    topo.innerHTML = '<b>diagnostico do spike</b>';

    var fechar = document.createElement('button');
    fechar.textContent = 'x';
    fechar.setAttribute('style', 'background:none;border:0;color:#9ad;cursor:pointer;font:inherit');
    fechar.onclick = function () { caixa.remove(); caixa = null; };
    topo.appendChild(fechar);

    var corpo = document.createElement('div');
    corpo.setAttribute('data-corpo', '');

    caixa.appendChild(topo);
    caixa.appendChild(corpo);
    document.body.appendChild(caixa);

    log('url: ' + location.href);
    desenhar();

    vigiarVideos();
    new MutationObserver(vigiarVideos).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', montar);
  } else {
    montar();
  }
})();
"#;

#[tauri::command]
pub fn abrir_curso(app: tauri::AppHandle, url: String, titulo: String) -> Result<(), String> {
    let parsed = tauri::Url::parse(&url).map_err(|e| format!("URL inválida: {e}"))?;

    // Só http(s). Bloqueia file:, javascript:, data: e esquemas customizados
    // antes de chegarem ao motor (§8 do plano).
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err(format!("esquema não permitido: {}", parsed.scheme()));
    }

    // Rótulo estável por URL: reabrir o mesmo curso foca a janela existente em
    // vez de empilhar cópias.
    let label = format!(
        "curso-{}",
        parsed.host_str().unwrap_or("x").replace('.', "-")
    );

    if let Some(existente) = tauri::Manager::get_webview_window(&app, &label) {
        let _ = existente.set_focus();
        return Ok(());
    }

    WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(parsed))
        .title(titulo)
        .inner_size(1280.0, 820.0)
        .initialization_script(DIAG_SCRIPT)
        .build()
        .map_err(|e| format!("falha ao abrir janela: {e}"))?;

    Ok(())
}

/// Modo navegador dedicado (§3.9): abre no navegador padrão do sistema, usando
/// o login que já existe lá. Não copia cookie nem credencial de lugar nenhum.
#[tauri::command]
pub fn abrir_no_navegador(app: tauri::AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let parsed = tauri::Url::parse(&url).map_err(|e| format!("URL inválida: {e}"))?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err(format!("esquema não permitido: {}", parsed.scheme()));
    }
    app.opener()
        .open_url(parsed.as_str(), None::<&str>)
        .map_err(|e| format!("falha ao abrir navegador: {e}"))
}
