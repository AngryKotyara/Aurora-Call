function svg(path) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;
}

const icons = {
  home: svg('<path d="M3.5 10.5 12 3l8.5 7.5"/><path d="M5.5 9.5V21h13V9.5M9.5 21v-6h5v6"/>'),
  history: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3.3 2"/>'),
  friends: svg('<circle cx="12" cy="8" r="3.2"/><path d="M5.5 20c.7-4 3-6 6.5-6s5.8 2 6.5 6"/>'),
  settings: svg('<circle cx="12" cy="12" r="3"/><path d="M19 13.6v-3.2l-2-.6a7 7 0 0 0-.7-1.7l1-1.8-2.3-2.3-1.8 1a7 7 0 0 0-1.7-.7L10.9 2H7.7l-.6 2.1a7 7 0 0 0-1.7.7l-1.8-1L1.3 6.1l1 1.8a7 7 0 0 0-.7 1.7L0 10.2v3.2l2 .6a7 7 0 0 0 .7 1.7l-1 1.8L4 19.8l1.8-1a7 7 0 0 0 1.7.7l.6 2.1h3.2l.6-2.1a7 7 0 0 0 1.7-.7l1.8 1 2.3-2.3-1-1.8a7 7 0 0 0 .7-1.7z" transform="translate(2 0) scale(.83)"/>'),
  chat: svg('<path d="M4 5.5A3.5 3.5 0 0 1 7.5 2h9A3.5 3.5 0 0 1 20 5.5v6a3.5 3.5 0 0 1-3.5 3.5H10l-5 4v-4.6A3.5 3.5 0 0 1 4 12z"/>'),
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

function polish() {
  ensureStyles();
  const nav = document.querySelector(".nav");
  if (!nav) return;
  nav.querySelector('[data-nav="home"]')?.replaceChildren(makeIcon("home"));
  nav.querySelector('[data-nav="history"]')?.replaceChildren(makeIcon("history"));
  nav.querySelector('[data-nav="friends"]')?.replaceChildren(makeIcon("friends"));
  nav.querySelector('[data-nav="settings"]')?.replaceChildren(makeIcon("settings"));
  const chat = nav.querySelector("[data-chat-open]");
  if (chat && !chat.querySelector("svg")) chat.insertAdjacentHTML("afterbegin", icons.chat);
}

function makeIcon(name) {
  const template = document.createElement("template");
  template.innerHTML = icons[name].trim();
  return template.content.firstElementChild;
}

export function installNavPolish() {
  polish();
  const observer = new MutationObserver(polish);
  observer.observe(document.getElementById("root"), { childList: true, subtree: true });
  document.addEventListener("aurora-chat-nav-ready", polish);
}
