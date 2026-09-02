const $ = (id) => document.getElementById(id);

chrome.storage.local.get(["token", "porta"]).then((c) => {
  if (c.token) $("token").value = c.token;
  if (c.porta) $("porta").value = c.porta;
});

$("salvar").addEventListener("click", async () => {
  const token = $("token").value.trim();
  const porta = Number($("porta").value) || 47823;
  await chrome.storage.local.set({ token, porta });

  const msg = $("msg");
  msg.textContent = "testando…";
  try {
    const r = await fetch(`http://127.0.0.1:${porta}/estado`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (r.status === 401) {
      msg.textContent = "Token recusado pelo app.";
      msg.style.color = "#c92a2a";
    } else if (!r.ok) {
      msg.textContent = `O app respondeu ${r.status}.`;
      msg.style.color = "#c92a2a";
    } else {
      const d = await r.json();
      msg.textContent = `Pareado. ${d.cursos.length} curso(s) no app.`;
      msg.style.color = "#2b8a3e";
    }
  } catch {
    msg.textContent = "Não achei o app. Ele está aberto?";
    msg.style.color = "#c92a2a";
  }
});
