// Tiny non-blocking prompt with buttons, used by "ask" mode (Foundry notifications have no buttons).

let host = null;

function ensureHost() {
  if (host?.isConnected) return host;
  host = document.createElement("div");
  host.className = "tbaf-prompts";
  document.body.appendChild(host);
  return host;
}

/**
 * @param {string} message plain text
 * @param {Array<{label:string, icon?:string, action:()=>void, primary?:boolean}>} buttons
 * @param {number} timeout ms before it dismisses itself (0 = never)
 */
export function showPrompt(message, buttons, timeout = 20000) {
  const box = document.createElement("div");
  box.className = "tbaf-prompt";
  const p = document.createElement("p");
  p.textContent = message;
  box.appendChild(p);
  const row = document.createElement("div");
  row.className = "tbaf-prompt-buttons";
  const close = () => box.remove();
  for (const b of buttons) {
    const btn = document.createElement("button");
    btn.type = "button";
    if (b.primary) btn.classList.add("tbaf-primary");
    btn.innerHTML = b.icon ? `<i class="fas ${b.icon}"></i> ` : "";
    btn.append(document.createTextNode(b.label));
    btn.addEventListener("click", () => { close(); b.action?.(); });
    row.appendChild(btn);
  }
  box.appendChild(row);
  ensureHost().appendChild(box);
  if (timeout) setTimeout(close, timeout);
  return close;
}
