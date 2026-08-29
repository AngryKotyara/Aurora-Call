const BACK_ICON =
  '<svg class="aurora-nav-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>';

function polishChatNavigation() {
  const topbar = document.querySelector("#chat-layer .chat-list-view .chat-topbar");
  const back = topbar?.querySelector("[data-chat-close]");
  if (!topbar || !back || back.dataset.mainMenuBack === "true") return;

  back.dataset.mainMenuBack = "true";
  back.type = "button";
  back.innerHTML = BACK_ICON;
  back.setAttribute("aria-label", "Назад в основное меню");
  back.title = "Назад в основное меню";

  // The existing handler already closes the chat layer and returns to the main UI.
  // Move that control to the conventional leading position instead of showing an X.
  topbar.prepend(back);
}

const observer = new MutationObserver(polishChatNavigation);
observer.observe(document.documentElement, { childList: true, subtree: true });
polishChatNavigation();
