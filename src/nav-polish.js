function svg(path, name) {
  return `<svg class="aurora-polished-nav-icon" data-nav-icon="${name}" viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;
}

const icons = {
  home: svg('<path d="M3.5 10.5 12 3l8.5 7.5"/><path d="M5.5 9.5V21h13V9.5M9.5 21v-6h5v6"/>', "home"),
  history: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3.3 2"/>', "history"),
  friends: svg('<circle cx="12" cy="8" r="3.2"/><path d="M5.5 20c.7-4 3-6 6.5-6s5.8 2 6.5 6"/>', "friends"),
  settings: svg('<circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.1M12 19.1v2.1M21.2 12h-2.1M4.9 12H2.8M18.5 5.5 17 7M7 17l-1.5 1.5M18.5 18.5 17 17M7 7 5.5 5.5"/><circle cx="12" cy="12" r="6.1"/>', "settings"),
  chat: svg('<path d="M4 5.5A3.5 3.5 0 0 1 7.5 2h9A3.5 3.5 0 0 1 20 5.5v6a3.5 3.5 0 0 1-3.5 3.5H10l-5 4v-4.6A3.5 3.5 0 0 1 4 12z"/>', "chat"),
};

function ensureStyles() {
  if (document.querySelector("#aurora-nav-polish")) return;
  const style = document.createElement("style");
  style.id = "aurora-nav-polish";
  style.textContent = `
    .nav{display:grid!important;grid-template-columns:repeat(5,1fr)!important;align-items:center!important;justify-items:center!important;gap:0!important}
    .nav button{width:48px!important;height:48px!important;display:grid!important;place-items:center!important;padding:0!important;margin:0!important;line-height:1!important}
    .nav button svg{display:block!important;width:23px!important;height:23px!important;fill:none!important;stroke:currentColor!important;stroke-width:1.8!important;stroke-linecap:round!important;stroke-linejoin:round!important;overflow:visible!important}
    .nav [data-nav="home"]{order:1}.nav [data-nav="history"]{order:2}.nav [data-chat-open]{order:3}.nav [data-nav="friends"]{order:4}.nav [data-nav="settings"]{order:5}
    .nav [data-chat-open]{position:relative!important}
  `;
  document.head.append(style);
}

function makeIcon(name) {
  const template = document.createElement("template");
  template.innerHTML = icons[name].trim();
  return template.content.firstElementChild;
}

function setIcon(button, name) {
  if (!button) return;
  const icon = button.querySelector(`[data-nav-icon="${name}"]`);
  if (icon && button.querySelectorAll("svg").length === 1) return;
  button.replaceChildren(makeIcon(name));
}

function normalizeChatButton(nav) {
  const buttons = [...nav.querySelectorAll("[data-chat-open]")];
  if (!buttons.length) return;
  const primary = buttons[0];
  buttons.slice(1).forEach((button) => button.remove());
  const badge = primary.querySelector(".chat-nav-badge");
  primary.querySelectorAll("svg").forEach((icon) => icon.remove());
  primary.prepend(makeIcon("chat"));
  if (badge) primary.append(badge);
}

let polishing = false;
function polish() {
  if (polishing) return;
  const nav = document.querySelector(".nav");
  if (!nav) return;
  polishing = true;
  try {
    ensureStyles();
    setIcon(nav.querySelector('[data-nav="home"]'), "home");
    setIcon(nav.querySelector('[data-nav="history"]'), "history");
    setIcon(nav.querySelector('[data-nav="friends"]'), "friends");
    setIcon(nav.querySelector('[data-nav="settings"]'), "settings");
    normalizeChatButton(nav);
  } finally {
    polishing = false;
  }
}

export function installNavPolish() {
  polish();
  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      polish();
    });
  });
  const root = document.getElementById("root");
  if (root) observer.observe(root, { childList: true, subtree: true });
  document.addEventListener("aurora-chat-nav-ready", polish);
}
