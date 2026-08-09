import { escapeHtml } from "./utils.js";

function ensureStyles() {
  if (document.querySelector("#aurora-call-picker-styles")) return;
  const style = document.createElement("style");
  style.id = "aurora-call-picker-styles";
  style.textContent = `
    .call-picker-layer{position:fixed;inset:0;z-index:1600;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.62);backdrop-filter:blur(10px);padding:16px}
    .call-picker{width:min(100%,520px);max-height:min(76vh,680px);display:flex;flex-direction:column;overflow:hidden;border:1px solid rgba(255,255,255,.1);border-radius:28px;background:#11141c;color:#fff;box-shadow:0 28px 90px rgba(0,0,0,.55)}
    .call-picker-head{display:flex;align-items:center;gap:12px;padding:20px 18px 14px;border-bottom:1px solid rgba(255,255,255,.07)}
    .call-picker-head div{flex:1}.call-picker-head h2{margin:2px 0 0;font-size:23px}.call-picker-head span{font-size:12px;color:#929bad}
    .call-picker-close{width:40px;height:40px;border:0;border-radius:50%;display:grid;place-items:center;background:#20242d;color:#fff}.call-picker-close svg{width:20px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round}
    .call-picker-list{overflow:auto;padding:8px 10px calc(10px + env(safe-area-inset-bottom))}
    .call-picker-person{width:100%;display:flex;align-items:center;gap:13px;padding:12px;border:0;border-radius:18px;background:transparent;color:#fff;text-align:left}
    .call-picker-person:active{background:rgba(255,255,255,.07)}
    .call-picker-avatar{width:48px;height:48px;flex:0 0 48px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(145deg,#6578ff,#9a62ff);font-weight:850}
    .call-picker-person strong{display:block;font-size:16px}.call-picker-person small{display:block;margin-top:3px;color:#8f98aa;font-size:12px}
    .call-picker-action{margin-left:auto;width:42px;height:42px;border-radius:50%;display:grid;place-items:center;background:rgba(112,92,255,.16);color:#a89cff}
    .call-picker-action svg{width:21px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
    .call-picker-empty{padding:42px 24px;text-align:center;color:#929bad}
    @media(min-width:700px){.call-picker-layer{align-items:center}}
  `;
  document.head.append(style);
}

function modeIcon(mode) {
  return mode === "video"
    ? '<svg viewBox="0 0 24 24"><rect x="3" y="6.5" width="13" height="11" rx="3"/><path d="m16 10 4-2.25v8.5L16 14"/></svg>'
    : '<svg viewBox="0 0 24 24"><path d="M7.2 3.5 4.8 5.9c-.7.7-.7 1.8-.2 2.7 2.5 4.5 6.3 8.3 10.8 10.8.9.5 2 .5 2.7-.2l2.4-2.4-4.2-3.1-2.2 2.2c-2.5-1.4-4.6-3.5-6-6l2.2-2.2z"/></svg>';
}

export function pickCallContact(friends, mode) {
  ensureStyles();
  return new Promise((resolve) => {
    document.querySelector("#call-picker-layer")?.remove();
    const label = mode === "video" ? "Видеозвонок" : "Аудиозвонок";
    const rows = friends.length
      ? friends.map((friend) => {
          const id = escapeHtml(friend.id);
          const name = escapeHtml(friend.username || friend.name || "Друг");
          const initial = escapeHtml((friend.username || friend.name || "?")[0]?.toUpperCase() || "?");
          return `<button class="call-picker-person" data-call-picker-id="${id}" data-call-picker-name="${name}"><span class="call-picker-avatar">${initial}</span><span><strong>${name}</strong><small>Нажмите, чтобы позвонить</small></span><span class="call-picker-action">${modeIcon(mode)}</span></button>`;
        }).join("")
      : '<div class="call-picker-empty">Сначала добавьте друга, чтобы начать звонок.</div>';

    document.body.insertAdjacentHTML("beforeend", `<div id="call-picker-layer" class="call-picker-layer" role="dialog" aria-modal="true" aria-label="Выбор контакта"><section class="call-picker"><header class="call-picker-head"><div><span>${label}</span><h2>Кому позвонить?</h2></div><button class="call-picker-close" aria-label="Закрыть"><svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></svg></button></header><div class="call-picker-list">${rows}</div></section></div>`);
    const layer = document.querySelector("#call-picker-layer");
    let finished = false;
    const finish = (friend) => {
      if (finished) return;
      finished = true;
      layer?.remove();
      resolve(friend);
    };
    layer.querySelector(".call-picker-close").addEventListener("click", () => finish(null));
    layer.addEventListener("click", (event) => { if (event.target === layer) finish(null); });
    layer.querySelectorAll("[data-call-picker-id]").forEach((button) => button.addEventListener("click", () => finish({ id: button.dataset.callPickerId, name: button.dataset.callPickerName })));
  });
}
