function svg(path, name) {
  return `<svg class="aurora-nav-icon aurora-polished-nav-icon" data-nav-icon="${name}" viewBox="0 0 24 24" aria-hidden="true" fill="none">${path}</svg>`;
}

const icons = {
  home: svg('<path d="M4 10.5 12 4l8 6.5"/><path d="M6.5 9.5V20h11V9.5"/><path d="M9.5 20v-6h5v6"/>', "home"),
  history: svg('<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/>', "history"),
  friends: svg('<circle cx="12" cy="8.5" r="3.25"/><path d="M5.5 20c.65-4 2.85-6 6.5-6s5.85 2 6.5 6"/>', "friends"),
  chat: svg('<path d="M5 5.5A3.5 3.5 0 0 1 8.5 2h7A3.5 3.5 0 0 1 19 5.5v6a3.5 3.5 0 0 1-3.5 3.5H10l-5 4v-4.8A3.45 3.45 0 0 1 4 11.75V5.5z"/>', "chat"),
  settings: '<span class="aurora-nav-icon aurora-settings-glyph" data-nav-icon="settings" aria-hidden="true">&#9881;&#xfe0e;</span>',
};

function ensureStyles() {
  let style = document.querySelector("#aurora-nav-polish");
  if (!style) {
    style = document.createElement("style");
    style.id = "aurora-nav-polish";
    document.head.append(style);
  }
  style.textContent = `
    .nav{
      position:fixed!important;z-index:90!important;left:50%!important;right:auto!important;
      bottom:max(12px,env(safe-area-inset-bottom))!important;
      display:grid!important;grid-template-columns:repeat(5,1fr)!important;
      align-items:center!important;justify-items:center!important;
      width:min(440px,calc(100% - 28px))!important;height:68px!important;
      padding:8px 10px!important;margin:0!important;gap:0!important;
      transform:translateX(-50%)!important;border:1px solid rgba(255,255,255,.07)!important;
      border-radius:24px!important;background:rgba(18,18,28,.94)!important;
      box-shadow:0 14px 40px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.04)!important;
      backdrop-filter:blur(22px) saturate(1.15)!important;-webkit-backdrop-filter:blur(22px) saturate(1.15)!important;
    }
    .nav button{
      display:grid!important;place-items:center!important;width:48px!important;height:48px!important;
      min-width:48px!important;min-height:48px!important;padding:0!important;margin:0!important;
      border:0!important;border-radius:15px!important;background:transparent!important;
      color:#8f909d!important;line-height:1!important;appearance:none!important;-webkit-appearance:none!important;
      transform:none!important;box-shadow:none!important;touch-action:manipulation!important;
    }
    .nav button.on{background:rgba(255,81,171,.08)!important;color:#ff51ab!important}
    .nav button:active{transform:scale(.94)!important}
    .nav svg.aurora-nav-icon{display:block!important;width:23px!important;height:23px!important;overflow:visible!important;fill:none!important;stroke:currentColor!important;stroke-width:1.75!important;stroke-linecap:round!important;stroke-linejoin:round!important;transform:none!important}
    .nav .aurora-settings-glyph{display:block!important;width:25px!important;height:25px!important;color:currentColor!important;font-family:Arial,"Helvetica Neue",sans-serif!important;font-size:27px!important;font-weight:400!important;font-style:normal!important;line-height:25px!important;text-align:center!important;letter-spacing:0!important;transform:none!important;-webkit-font-smoothing:antialiased!important}
    .nav [data-nav="home"]{order:1!important}.nav [data-nav="history"]{order:2!important}.nav [data-chat-open]{order:3!important}.nav [data-nav="friends"]{order:4!important}.nav [data-nav="settings"]{order:5!important}
    .nav [data-chat-open]{position:relative!important}
  `;
}

function makeIcon(name) {
  const template = document.createElement("template");
  template.innerHTML = icons[name].trim();
  return template.content.firstElementChild;
}

function replaceIcon(button, name) {
  if (!button) return;
  const badge = button.querySelector(".chat-nav-badge");
  button.replaceChildren(makeIcon(name));
  if (badge) button.append(badge);
}

function rebuildNavigation() {
  const nav = document.querySelector(".nav");
  if (!nav) return;
  ensureStyles();
  replaceIcon(nav.querySelector('[data-nav="home"]'), "home");
  replaceIcon(nav.querySelector('[data-nav="history"]'), "history");
  replaceIcon(nav.querySelector('[data-nav="friends"]'), "friends");
  replaceIcon(nav.querySelector('[data-nav="settings"]'), "settings");

  const chats = [...nav.querySelectorAll("[data-chat-open]")];
  if (chats.length) {
    chats.slice(1).forEach((button) => button.remove());
    replaceIcon(chats[0], "chat");
  }
}

let scheduled = false;
function scheduleRebuild() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    rebuildNavigation();
  });
}

export function installNavPolish() {
  rebuildNavigation();
  const root = document.getElementById("root");
  if (root) new MutationObserver(scheduleRebuild).observe(root, { childList:true, subtree:true });
  document.addEventListener("aurora-chat-nav-ready", scheduleRebuild);
}
