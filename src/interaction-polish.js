import { state } from "./state.js";

let activeBubble = null;
let excludedTargetTimer = null;

function positionMenu(menu) {
  const bubble = activeBubble;
  if (!menu || !bubble?.isConnected) return;
  const rect = bubble.getBoundingClientRect();
  const width = menu.offsetWidth || 170;
  const height = menu.offsetHeight || 52;
  const gap = 8;
  let top = rect.bottom + gap;
  if (top + height > window.innerHeight - 12) top = rect.top - height - gap;
  const left = Math.max(12, Math.min(window.innerWidth - width - 12, rect.right - width));
  menu.style.top = `${Math.max(12, top)}px`;
  menu.style.left = `${left}px`;
  menu.style.transformOrigin = top >= rect.bottom ? "top right" : "bottom right";
}

function rememberBubble(event) {
  const bubble = event.target.closest?.("#chat-layer .chat-bubble[data-message-own=true]");
  if (!bubble) return;
  activeBubble = bubble;

  clearTimeout(excludedTargetTimer);
  if (event.target.closest("video,a,button")) {
    const x = event.clientX;
    const y = event.clientY;
    excludedTargetTimer = window.setTimeout(() => {
      if (!bubble.isConnected) return;
      navigator.vibrate?.(14);
      bubble.dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
      }));
    }, 420);
  }
}

function cancelExcludedLongPress() {
  clearTimeout(excludedTargetTimer);
  excludedTargetTimer = null;
}

document.addEventListener("pointerdown", rememberBubble, { capture: true, passive: true });
document.addEventListener("pointerup", cancelExcludedLongPress, { capture: true, passive: true });
document.addEventListener("pointercancel", cancelExcludedLongPress, { capture: true, passive: true });
document.addEventListener("pointermove", (event) => {
  if (!excludedTargetTimer || !activeBubble) return;
  const rect = activeBubble.getBoundingClientRect();
  if (event.clientX < rect.left - 10 || event.clientX > rect.right + 10 || event.clientY < rect.top - 10 || event.clientY > rect.bottom + 10) cancelExcludedLongPress();
}, { capture: true, passive: true });

const observer = new MutationObserver(() => {
  const menu = document.querySelector(".chat-message-menu");
  if (menu) requestAnimationFrame(() => positionMenu(menu));
});
observer.observe(document.documentElement, { childList: true, subtree: true });

window.addEventListener("resize", () => positionMenu(document.querySelector(".chat-message-menu")), { passive: true });

// Make destructive actions feel immediate while the existing RPC still performs the secure delete.
document.addEventListener("click", (event) => {
  const deleteButton = event.target.closest?.("[data-message-delete]");
  if (!deleteButton || !activeBubble) return;
  const bubble = activeBubble;
  requestAnimationFrame(() => {
    bubble.style.transition = "opacity .14s ease, transform .14s ease, max-height .18s ease, margin .18s ease, padding .18s ease";
    bubble.style.opacity = "0";
    bubble.style.transform = "scale(.96)";
    window.setTimeout(() => {
      if (bubble.isConnected) bubble.style.display = "none";
    }, 150);
  });
}, { capture: true });

// Remove the historic 300 ms tap delay on mobile browsers and signal fast-touch intent.
document.documentElement.style.touchAction = "manipulation";
document.body.style.touchAction = "manipulation";

// Warm the session object once so taps do not repeatedly parse it in hot paths.
void state.session;
