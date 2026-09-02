const $ = (id) => document.getElementById(id);

let cfg = { token: "", porta: 47823 };
let cursos = [];
let tick = null;

function dur(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const dois = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}h ${dois(m)}m ${dois(r)}s` : `${m}m ${dois(r)}s`;
}

function aviso(texto, classe = "") {
  const el = $("msg");
  el.textContent = texto;
  el.className = classe;
}

// Toda chamada leva o token num cabeçalho. Isso não é só autenticação: um
// cabeçalho fora da lista "simples" força preflight CORS, e é o preflight que
// impede um site qualquer de disparar estas rotas pelo navegador do usuário.
async function api(rota, opcoes = {}) {
  const r = await fetch(`http://127.0.0.1:${cfg.porta}${rota}`, {
    ...opcoes,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json",
      ...(opcoes.headers || {}),
    },
  });
  if (r.status === 401) throw new Error("token recusado pelo app");
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(corpo.erro || `app respondeu ${r.status}`);
  return corpo;
}

async function paginaAtual() {
  const [aba] = await chrome.tabs.query({ active: true, currentWindow: true });
  return aba ?? null;
}

function pintarCursos(selecionado) {
  const sel = $("curso");
  sel.innerHTML = "";
  const vazio = document.createElement("option");
  vazio.value = "";
  vazio.textContent = cursos.length ? "— sem curso —" : "— nenhum curso salvo —";
  sel.appendChild(vazio);
  for (const c of cursos) {
    const o = document.createElement("option");
    o.value = c.id;
    o.textContent = c.titulo;
    sel.appendChild(o);
  }
  if (selecionado) sel.value = selecionado;
}

function pintarTimer(timer) {
  const rodando = !!timer;
  $("rodando").hidden = !rodando;
  $("parado").hidden = rodando;
  if (rodando) {
    $("relogio").textContent = dur(timer.wall_ms);
    $("descAtual").textContent = timer.descricao || "sem descrição";
  }
}

async function atualizar() {
  const estado = await api("/estado");
  cursos = estado.cursos || [];
  const sel = $("curso").value;
  pintarCursos(sel);
  pintarTimer(estado.timer);
  return estado;
}

async function iniciar() {
  cfg = await chrome.storage.local.get({ token: "", porta: 47823 });

  if (!cfg.token) {
    $("carregando").hidden = true;
    $("parear").hidden = false;
    return;
  }

  try {
    const estado = await atualizar();
    $("carregando").hidden = true;
    $("conteudo").hidden = false;

    const aba = await paginaAtual();
    if (aba?.url) {
      $("url").textContent = aba.url;
      // Sugere o título da aba como nome do curso — quase sempre é o nome da
      // aula, e corrigir um campo preenchido é mais rápido que digitar do zero.
      $("titulo").value = (aba.title || "").slice(0, 80);
    }

    // O relógio precisa andar sozinho enquanto o popup está aberto; sem isto
    // ele fica congelado no instante da abertura.
    if (estado.timer) {
      tick = setInterval(() => atualizar().catch(() => {}), 1000);
    }
  } catch (e) {
    $("carregando").hidden = true;
    $("parear").hidden = false;
    aviso(String(e.message || e), "erro");
  }
}

$("abrirOpcoes").addEventListener("click", () => chrome.runtime.openOptionsPage());

$("iniciar").addEventListener("click", async () => {
  try {
    await api("/timer/iniciar", {
      method: "POST",
      body: JSON.stringify({
        descricao: $("descricao").value,
        curso_id: $("curso").value || null,
      }),
    });
    await atualizar();
    aviso("cronômetro iniciado", "ok");
    if (!tick) tick = setInterval(() => atualizar().catch(() => {}), 1000);
  } catch (e) {
    aviso(String(e.message || e), "erro");
  }
});

$("parar").addEventListener("click", async () => {
  try {
    const r = await api("/timer/parar", { method: "POST" });
    if (tick) { clearInterval(tick); tick = null; }
    await atualizar();
    aviso(`registrado: ${dur(r.wall_ms)}`, "ok");
  } catch (e) {
    aviso(String(e.message || e), "erro");
  }
});

$("salvar").addEventListener("click", async () => {
  try {
    const aba = await paginaAtual();
    const r = await api("/cursos", {
      method: "POST",
      body: JSON.stringify({ titulo: $("titulo").value, url: aba?.url || null }),
    });
    await atualizar();
    pintarCursos(r.id);
    aviso("curso salvo no app", "ok");
  } catch (e) {
    aviso(String(e.message || e), "erro");
  }
});

$("atualizar").addEventListener("click", async () => {
  try {
    const id = $("curso").value;
    if (!id) return aviso("escolha um curso na lista acima", "erro");
    const aba = await paginaAtual();
    await api("/cursos/rota", {
      method: "POST",
      body: JSON.stringify({ curso_id: id, url: aba?.url || "" }),
    });
    aviso("rota atualizada — o app volta direto para cá", "ok");
  } catch (e) {
    aviso(String(e.message || e), "erro");
  }
});

iniciar();
