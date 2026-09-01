//! Janela de curso (P1, P2, P3).
//!
//! A janela que carrega conteúdo remoto NÃO recebe capability nenhuma — só a
//! janela `main` está listada em `capabilities/default.json`. A página da
//! Hotmart ou da T2 não tem `invoke`, não alcança comando nativo e não vê o
//! estado do app. O único código do app que roda lá dentro é o overlay de
//! diagnóstico abaixo, que só lê e desenha.
//!
//! Como a página remota não tem canal de volta por decisão de segurança, o
//! controle da janela mora do lado de cá: a janela principal lista as janelas
//! de curso abertas e consegue fechá-las e tirá-las de tela cheia. Sem isso,
//! um site que entra em tela cheia e engole as decorações deixa a janela sem
//! saída — que foi exatamente o que aconteceu no primeiro teste.

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

const PREFIXO: &str = "curso-";

/// Sonda de DRM injetada antes do carregamento da página.
///
/// Só responde a metade específica da pergunta: *este curso* pede DRM? A outra
/// metade — *este motor* tem CDM? — é medida na janela principal, que é página
/// nossa e não depende da CSP de terceiro.
///
/// Todo o estilo aqui é aplicado por CSSOM (`el.style.x = y`) e nunca por
/// atributo `style=`. A diferença importa: `style-src` sem `unsafe-inline`
/// bloqueia o atributo, mas não alcança o CSSOM. Com `setAttribute('style')`
/// o painel virava texto solto no rodapé de qualquer página com CSP estrita.
const DIAG_SCRIPT: &str = r#"
(function () {
  if (window.__estudosDiag) return;
  window.__estudosDiag = true;

  var linhas = [];
  var corpo = null;

  function log(txt) {
    linhas.push(new Date().toLocaleTimeString() + '  ' + txt);
    if (corpo) corpo.textContent = linhas.join('\n');
  }

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
    log('EME ausente neste contexto');
  } else {
    // Intercepta o pedido real do player: e o que diz se ESTE curso usa DRM.
    navigator.requestMediaKeySystemAccess = function (ks, cfg) {
      log('>>> A PAGINA PEDIU DRM: ' + ks);
      return pedir(ks, cfg);
    };
  }

  var vistos = new WeakSet();
  function vigiarVideos() {
    var vs = document.querySelectorAll('video');
    for (var i = 0; i < vs.length; i++) {
      var v = vs[i];
      if (vistos.has(v)) continue;
      vistos.add(v);
      log('<video> encontrado (' + vs.length + ' na pagina)');
      v.addEventListener('playing', function () { log('video: tocando'); });
      v.addEventListener('encrypted', function () { log('video: fluxo criptografado (DRM ativo)'); });
      v.addEventListener('error', function (e) {
        var err = e.target.error;
        log('video: ERRO code=' + (err ? err.code : '?') + ' ' + (err ? err.message : ''));
      });
    }
  }

  function estilo(el, props) {
    for (var k in props) { try { el.style[k] = props[k]; } catch (e) {} }
  }

  function montar() {
    if (!document.body) return;

    var caixa = document.createElement('div');
    estilo(caixa, {
      position: 'fixed', right: '12px', bottom: '12px', zIndex: '2147483647',
      width: '380px', maxHeight: '40vh', overflow: 'auto',
      background: 'rgba(17,17,20,.94)', color: '#e6e6e6',
      font: '11px/1.5 ui-monospace,Consolas,monospace',
      border: '1px solid #444', borderRadius: '8px', padding: '8px 10px',
      whiteSpace: 'pre-wrap', boxShadow: '0 4px 24px rgba(0,0,0,.5)'
    });

    var topo = document.createElement('div');
    estilo(topo, { display: 'flex', justifyContent: 'space-between', marginBottom: '6px', color: '#9ad' });

    var titulo = document.createElement('b');
    titulo.textContent = 'diagnostico do spike';

    var fechar = document.createElement('button');
    fechar.textContent = 'x';
    estilo(fechar, { background: 'none', border: '0', color: '#9ad', cursor: 'pointer', font: 'inherit' });
    fechar.onclick = function () { caixa.remove(); };

    topo.appendChild(titulo);
    topo.appendChild(fechar);

    corpo = document.createElement('div');
    caixa.appendChild(topo);
    caixa.appendChild(corpo);
    document.body.appendChild(caixa);

    log('url: ' + location.href);
    vigiarVideos();
    try {
      new MutationObserver(vigiarVideos).observe(document.body, { childList: true, subtree: true });
    } catch (e) { /* ignora */ }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', montar);
  } else {
    montar();
  }
})();
"#;

/// Só esquema, host e caminho — nunca a query string.
///
/// Isto não é economia de log: numa URL de fluxo OAuth a query carrega o
/// `code`, o `state` e o `session_state`, e é com esse `code` que se troca por
/// um token de sessão. §8 do plano proíbe token em log justamente por isso.
/// A primeira versão da instrumentação registrou a cadeia inteira de login da
/// Hotmart em texto puro — o tipo de vazamento que nasce de código de
/// diagnóstico, não de código de produção.
fn url_curta(u: &str) -> String {
    match tauri::Url::parse(u) {
        Ok(p) => format!(
            "{}://{}{}",
            p.scheme(),
            p.host_str().unwrap_or("?"),
            p.path()
        ),
        Err(_) => "<url ilegível>".into(),
    }
}

fn validar(url: &str) -> Result<tauri::Url, String> {
    let parsed = tauri::Url::parse(url).map_err(|e| format!("URL inválida: {e}"))?;
    // Só http(s). Bloqueia file:, javascript:, data: e esquemas customizados
    // antes de chegarem ao motor (§8 do plano).
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err(format!("esquema não permitido: {}", parsed.scheme()));
    }
    Ok(parsed)
}

/// `async` aqui não é enfeite. Tauri roda comando síncrono na thread principal,
/// e `build()` bloqueia esperando essa mesma thread — deadlock: a janela nasce,
/// nunca pinta e nunca processa o fechamento. Declarar o comando como async faz
/// o Tauri executá-lo no runtime assíncrono, e aí `build()` consegue esperar a
/// thread principal de fora dela. Vale para todo comando que cria ou destrói
/// janela.
#[tauri::command]
pub async fn abrir_curso(
    app: tauri::AppHandle,
    url: String,
    titulo: String,
) -> Result<String, String> {
    let parsed = validar(&url)?;

    // Rótulo estável por host: reabrir a mesma plataforma foca a janela
    // existente em vez de empilhar cópias.
    let label = format!(
        "{PREFIXO}{}",
        parsed.host_str().unwrap_or("x").replace('.', "-")
    );

    if let Some(existente) = app.get_webview_window(&label) {
        let _ = existente.unminimize();
        let _ = existente.set_focus();
        return Ok(label);
    }

    eprintln!("[curso] abrindo {label} -> {}", url_curta(parsed.as_str()));

    WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(parsed))
        .title(titulo)
        .inner_size(1280.0, 820.0)
        .decorations(true)
        .closable(true)
        .focused(true)
        .initialization_script(DIAG_SCRIPT)
        // Instrumentação: sem isto, "abriu em branco" é indistinguível de
        // "navegou e a página não renderizou". O log do dev mostra a diferença.
        .on_page_load(|janela, payload| {
            eprintln!(
                "[curso] {} {:?} {}",
                janela.label(),
                payload.event(),
                url_curta(&payload.url().to_string())
            );
        })
        .build()
        .map_err(|e| format!("falha ao abrir janela: {e}"))?;

    eprintln!("[curso] janela {label} construída");
    Ok(label)
}

/// Janelas de curso abertas agora. A principal usa isto para oferecer o
/// controle que a página remota não pode ter.
#[tauri::command]
pub fn janelas_curso(app: tauri::AppHandle) -> Vec<String> {
    let mut labels: Vec<String> = app
        .webview_windows()
        .into_keys()
        .filter(|l| l.starts_with(PREFIXO))
        .collect();
    labels.sort();
    labels
}

#[tauri::command]
pub async fn fechar_curso(app: tauri::AppHandle, label: String) -> Result<(), String> {
    // O rótulo vem da interface; conferir o prefixo impede que um bug de tela
    // feche a janela principal.
    if !label.starts_with(PREFIXO) {
        return Err(format!("rótulo fora do escopo de curso: {label}"));
    }
    let janela = app
        .get_webview_window(&label)
        .ok_or_else(|| format!("janela não encontrada: {label}"))?;

    // Sair da tela cheia antes de fechar: uma janela que o site deixou em
    // tela cheia pode ignorar o fechamento em alguns gerenciadores de janela.
    let _ = janela.set_fullscreen(false);
    janela.close().map_err(|e| format!("falha ao fechar: {e}"))
}

/// §3.9 do plano: recuperar os controles quando o site entra em tela cheia por
/// conta própria e engole as decorações da janela.
#[tauri::command]
pub async fn sair_tela_cheia(app: tauri::AppHandle, label: String) -> Result<(), String> {
    if !label.starts_with(PREFIXO) {
        return Err(format!("rótulo fora do escopo de curso: {label}"));
    }
    let janela = app
        .get_webview_window(&label)
        .ok_or_else(|| format!("janela não encontrada: {label}"))?;
    janela
        .set_fullscreen(false)
        .map_err(|e| format!("falha ao sair de tela cheia: {e}"))?;
    let _ = janela.set_focus();
    Ok(())
}

/// Modo navegador dedicado (§3.9): abre no navegador padrão do sistema, usando
/// o login que já existe lá. Não copia cookie nem credencial de lugar nenhum.
#[tauri::command]
pub fn abrir_no_navegador(app: tauri::AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let parsed = validar(&url)?;
    app.opener()
        .open_url(parsed.as_str(), None::<&str>)
        .map_err(|e| format!("falha ao abrir navegador: {e}"))
}
