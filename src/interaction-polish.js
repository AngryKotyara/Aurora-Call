import { state } from "./state.js";

let activeBubble = null;
let longPressTimer = null;
let startX = 0;
let startY = 0;

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

function cancelLongPress() {
  clearTimeout(longPressTimer);
  longPressTimer = null;
}

function beginLongPress(event) {
  const bubble = event.target.closest?.("#chat-layer .chat-bubble[data-message-own=true]");
  if (!bubble) return;

  // Prevent the older per-bubble pointer handler from starting a second timer.
  event.stopPropagation();
  activeBubble = bubble;
  startX = event.clientX;
  startY = event.clientY;
  cancelLongPress();

  longPressTimer = window.setTimeout(() => {
    if (!bubble.isConnected) return;
    navigator.vibrate?.(14);
    bubble.dispatchEvent(new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: startX,
      clientY: startY,
    }));
  }, 420);
}

document.addEventListener("pointerdown", beginLongPress, { capture: true });
document.addEventListener("pointerup", cancelLongPress, { capture: true, passive: true });
document.addEventListener("pointercancel", cancelLongPress, { capture: true, passive: true });
document.addEventListener("pointermove", (event) => {
  if (!longPressTimer) return;
  if (Math.hypot(event.clientX - startX, event.clientY - startY) > 9) cancelLongPress();
}, { capture: true, passive: true });

const observer = new MutationObserver(() => {
  const menu = document.querySelector(".chat-message-menu");
  if (menu) requestAnimationFrame(() => positionMenu(menu));
});
observer.observe(document.documentElement, { childList: true, subtree: true });

window.addEventListener("resize", () => positionMenu(document.querySelector(".chat-message-menu")), { passive: true });

// Make destructive actions feel immediate while the secure RPC completes in the background.
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

document.documentElement.style.touchAction = "manipulation";
document.body.style.touchAction = "manipulation";
void state.session;
