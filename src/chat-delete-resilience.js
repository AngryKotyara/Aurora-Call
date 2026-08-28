let lastPressedBubble = null;
let localMenu = null;
let localBackdrop = null;

function closeLocalMenu() {
  localMenu?.remove();
  localBackdrop?.remove();
  localMenu = null;
  localBackdrop = null;
}

function removeBubbleImmediately(bubble) {
  if (!bubble?.isConnected) return;
  bubble.classList.add("chat-delete-immediate");
  window.setTimeout(() => bubble.remove(), 120);
}

// Existing server-backed messages: remove from UI immediately when Delete is chosen.
// The original chat.js handler still sends the backend request in the background.
document.addEventListener(
  "pointerdown",
  (event) => {
    const bubble = event.target.closest?.("#chat-layer .chat-bubble");
    if (bubble) lastPressedBubble = bubble;
  },
  true,
);

document.addEventListener(
  "click",
  (event) => {
    const deleteButton = event.target.closest?.("[data-message-delete]");
    if (!deleteButton || !lastPressedBubble) return;
    removeBubbleImmediately(lastPressedBubble);
    lastPressedBubble = null;
  },
  true,
);

function openFailedMessageMenu(bubble) {
  if (!bubble?.isConnected) return;
  closeLocalMenu();
  const rect = bubble.getBoundingClientRect();
  const width = 142;
  const left = Math.max(
    10,
    Math.min(window.innerWidth - width - 10, rect.right - width),
  );
  const top = Math.min(window.innerHeight - 62, rect.bottom + 7);

  localBackdrop = document.createElement("div");
  localBackdrop.className =
    "chat-message-menu-backdrop chat-local-delete-backdrop";
  localBackdrop.addEventListener("click", closeLocalMenu);

  localMenu = document.createElement("div");
  localMenu.className = "chat-message-menu chat-local-delete-menu";
  localMenu.style.left = `${left}px`;
  localMenu.style.top = `${top}px`;
  localMenu.innerHTML = `
    <button type="button" class="danger" data-local-failed-delete>
      <svg class="aurora-nav-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5M14 11v5"/>
      </svg>
      <span>Удалить</span>
    </button>`;

  localMenu
    .querySelector("[data-local-failed-delete]")
    .addEventListener("click", () => {
      closeLocalMenu();
      removeBubbleImmediately(bubble);
    });

  document.body.append(localBackdrop, localMenu);
}

function installFailedBubble(bubble) {
  if (!bubble || bubble.dataset.localDeleteReady === "true") return;
  bubble.dataset.localDeleteReady = "true";
  bubble.dataset.messageOwn = "true";
  let timer = null;
  let startX = 0;
  let startY = 0;

  const cancel = () => {
    if (timer) window.clearTimeout(timer);
    timer = null;
  };

  bubble.addEventListener("pointerdown", (event) => {
    startX = event.clientX;
    startY = event.clientY;
    timer = window.setTimeout(() => {
      navigator.vibrate?.(15);
      openFailedMessageMenu(bubble);
    }, 420);
  });
  bubble.addEventListener("pointermove", (event) => {
    if (Math.hypot(event.clientX - startX, event.clientY - startY) > 8)
      cancel();
  });
  bubble.addEventListener("pointerup", cancel);
  bubble.addEventListener("pointercancel", cancel);
  bubble.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    openFailedMessageMenu(bubble);
  });
}

function scanFailedMessages(root = document) {
  root
    .querySelectorAll?.(
      "#chat-layer .chat-bubble.is-failed, #chat-layer .chat-upload-bubble.is-failed",
    )
    .forEach(installFailedBubble);
}

scanFailedMessages();
new MutationObserver(() => scanFailedMessages()).observe(document.body, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ["class"],
});
