import { rpc } from "./api.js";
import { setAppBadgeCount } from "./app-badge.js";
import {
  clearMediaCache,
  hydrateMedia,
  removeCachedMedia,
} from "./chat/media.js";
import { sendMedia } from "./chat/upload.js";
import { icon, threadRow, renderMessageMarkup } from "./chat/markup.js";
import { installChatEdgeSwipe } from "./chat-edge-swipe.js";
import { chatPollDelay } from "./polling-policy.js";
import { state } from "./state.js";
import { escapeHtml, showToast } from "./utils.js";

export { mediaMarkup } from "./chat/markup.js";

let openedFriend = null;
let pollTimer = null;
let observer = null;
let initialized = false;
let badgeRefreshInFlight = false;
let threadFetchInFlight = null;
let cachedThreads = [];
let cachedThreadToken = "";
let hasThreadCache = false;
let lastConversationSignature = "";
let editingMessage = null;
let currentMessages = new Map();
let olderMessages = [];
let hasOlderMessages = false;
let sessionGeneration = 0;

function addMessageButton(container, friend) {
  if (!container || container.querySelector("[data-message-friend]")) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "message-friend";
  button.dataset.messageFriend = friend.id;
  button.setAttribute("aria-label", `Написать ${friend.name}`);
  button.title = `Написать ${friend.name}`;
  button.innerHTML = `${icon("chat")}<span>Сообщение</span>`;
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    void openChat(friend);
  });
  const firstCallButton = container.querySelector("[data-call]");
  const deleteButton = container.querySelector("[data-delete-friend]");
  container.insertBefore(button, firstCallButton || deleteButton || null);
}

function ensureFriendMessageActions() {
  document.querySelectorAll(".card[data-select]").forEach((card) =>
    addMessageButton(card, {
      id: card.dataset.select,
      name: card.dataset.name,
    }),
  );
  document.querySelectorAll(".friend-row").forEach((row) => {
    const deleteButton = row.querySelector("[data-delete-friend]");
    if (deleteButton)
      addMessageButton(row, {
        id: deleteButton.dataset.deleteFriend,
        name: deleteButton.dataset.name,
      });
  });
}

function normalizeNavigation(nav) {
  const labels = {
    home: "Главная",
    history: "История",
    friends: "Друзья",
    settings: "Настройки",
  };
  nav.querySelectorAll("[data-nav]").forEach((button) => {
    const key = button.dataset.nav;
    if (!labels[key]) return;
    if (!button.querySelector(".aurora-nav-icon")) button.innerHTML = icon(key);
    button.setAttribute("aria-label", labels[key]);
    button.title = labels[key];
  });
  let chatButton = nav.querySelector("[data-chat-open]");
  if (!chatButton) {
    chatButton = document.createElement("button");
    chatButton.type = "button";
    chatButton.dataset.chatOpen = "";
    chatButton.setAttribute("aria-label", "Чаты");
    chatButton.title = "Чаты";
    chatButton.innerHTML = `${icon("chat")}<span class="chat-nav-badge" hidden></span>`;
    chatButton.addEventListener("click", () => openChat());
  }
  const navButtons = [...nav.querySelectorAll("[data-nav]")];
  const third = navButtons[2] || null;
  if (
    chatButton.parentElement !== nav ||
    chatButton.nextElementSibling !== third
  )
    nav.insertBefore(chatButton, third);
}

function ensureShell() {
  const nav = document.querySelector(".nav");
  if (nav) normalizeNavigation(nav);
  if (!document.querySelector("#chat-layer"))
    document.body.insertAdjacentHTML(
      "beforeend",
      '<div id="chat-layer" class="chat-layer" hidden></div>',
    );
  ensureFriendMessageActions();
}

async function getThreads({ allowCache = false } = {}) {
  const token = state.session?.user_id ? `${state.session.user_id}:${sessionGeneration}` : "";
  if (!token) {
    cachedThreads = [];
    cachedThreadToken = "";
    hasThreadCache = false;
    return [];
  }
  if (token !== cachedThreadToken) {
    cachedThreads = [];
    cachedThreadToken = token;
    hasThreadCache = false;
  }
  if (allowCache && hasThreadCache) return cachedThreads;
  if (threadFetchInFlight?.token === token) return threadFetchInFlight.promise;
  const pending = { token, promise: null };
  pending.promise = rpc("list_chat_threads", { p_token: state.session.token })
    .then((threads) => {
      if (`${state.session?.user_id}:${sessionGeneration}` !== token || cachedThreadToken !== token)
        return [];
      cachedThreads = Array.isArray(threads) ? threads : [];
      hasThreadCache = true;
      return cachedThreads;
    })
    .catch(() => (hasThreadCache ? cachedThreads : []))
    .finally(() => {
      if (threadFetchInFlight === pending) threadFetchInFlight = null;
    });
  threadFetchInFlight = pending;
  return pending.promise;
}

function conversationSignature(thread) {
  return thread
    ? `${thread.friend_id}:${thread.last_at}:${thread.last_message || ""}`
    : "";
}

async function openChat(friend = null) {
  ensureShell();
  const layer = document.querySelector("#chat-layer");
  layer.hidden = false;
  document.body.classList.add("chat-active");
  if (friend) {
    if (friend.id !== openedFriend?.id) {
      olderMessages = [];
      hasOlderMessages = false;
      lastConversationSignature = conversationSignature(
        cachedThreads.find((thread) => thread.friend_id === friend.id),
      );
    }
    openedFriend = friend;
  }
  scheduleBadgeRefresh();
  openedFriend ? await renderConversation() : await renderThreads();
}
function closeChat() {
  openedFriend = null;
  lastConversationSignature = "";
  editingMessage = null;
  closeMessageMenu();
  const layer = document.querySelector("#chat-layer");
  if (layer) layer.hidden = true;
  document.body.classList.remove("chat-active");
  clearMediaCache();
  scheduleBadgeRefresh();
}

async function renderThreads() {
  const layer = document.querySelector("#chat-layer");
  if (!layer) return;
  const threads = await getThreads({ allowCache: true });
  layer.innerHTML = `<section class="chat-shell chat-list-view"><header class="chat-topbar"><div><span class="chat-kicker">Aurora Call</span><h1>Чаты</h1></div><button class="chat-icon-btn" data-chat-close aria-label="Закрыть">${icon("close")}</button></header><div class="chat-search-wrap"><input class="chat-search" type="search" placeholder="Поиск" aria-label="Поиск по чатам"></div><div class="chat-thread-list">${threads.length ? threads.map(threadRow).join("") : '<div class="chat-empty"><span>💬</span><b>Сообщений пока нет</b><p>Откройте друга и нажмите «Сообщение».</p></div>'}</div></section>`;
  layer.querySelector("[data-chat-close]").onclick = closeChat;
  installChatEdgeSwipe(layer.querySelector(".chat-list-view"), closeChat);
  layer.querySelector(".chat-search").oninput = (event) => {
    const q = event.target.value.toLowerCase().trim();
    layer
      .querySelectorAll(".chat-thread")
      .forEach(
        (row) => (row.hidden = !row.dataset.chatName.toLowerCase().includes(q)),
      );
  };
  layer
    .querySelectorAll("[data-chat-friend]")
    .forEach(
      (row) =>
        (row.onclick = () =>
          openChat({ id: row.dataset.chatFriend, name: row.dataset.chatName })),
    );
}

function messageMarkup(message) {
  return renderMessageMarkup(message, openedFriend?.id);
}

async function loadMessages(before = null) {
  if (!openedFriend || !state.session) return [];
  try {
    const rows = await rpc("list_chat_messages", {
      p_token: state.session.token,
      p_friend: openedFriend.id,
      p_before: before,
      p_limit: 80,
    });
    return rows.reverse();
  } catch (error) {
    console.error("Failed to load chat messages", error);
    showToast("Не удалось загрузить сообщения");
    return [];
  }
}

function closeMessageMenu() {
  document.querySelector(".chat-message-menu")?.remove();
  document.querySelector(".chat-message-menu-backdrop")?.remove();
}

function startEditing(message) {
  closeMessageMenu();
  if (!message || message.kind !== "text") return;
  editingMessage = message;
  const input = document.querySelector(".chat-input");
  const composer = document.querySelector(".chat-composer");
  if (!input || !composer) return;
  input.value = message.body || "";
  input.focus();
  input.setSelectionRange?.(input.value.length, input.value.length);
  composer.classList.add("is-editing");
  composer.querySelector(".chat-edit-bar")?.remove();
  composer.insertAdjacentHTML(
    "beforebegin",
    `<div class="chat-edit-bar"><span>${icon("edit")}</span><div><b>Редактирование</b><small>${escapeHtml(message.body || "")}</small></div><button type="button" data-cancel-edit aria-label="Отменить">×</button></div>`,
  );
  document
    .querySelector("[data-cancel-edit]")
    ?.addEventListener("click", () => {
      editingMessage = null;
      input.value = "";
      document.querySelector(".chat-edit-bar")?.remove();
      composer.classList.remove("is-editing");
    });
}

async function deleteMessage(message) {
  closeMessageMenu();
  if (!message) return;
  try {
    await rpc("delete_chat_message", {
      p_token: state.session.token,
      p_message_id: Number(message.id),
    });
    removeCachedMedia(message.id);
    await renderConversation();
  } catch (error) {
    console.error("Failed to delete message", error);
    showToast("Не удалось удалить сообщение");
  }
}

function openMessageMenu(bubble, message) {
  if (!bubble || !message || bubble.dataset.messageOwn !== "true") return;
  closeMessageMenu();
  const rect = bubble.getBoundingClientRect();
  const menuWidth = 170;
  const top = Math.max(12, Math.min(window.innerHeight - 120, rect.bottom + 8));
  const left = Math.max(
    12,
    Math.min(window.innerWidth - menuWidth - 12, rect.right - menuWidth),
  );
  const canEdit = message.kind === "text";
  document.body.insertAdjacentHTML(
    "beforeend",
    `<div class="chat-message-menu-backdrop"></div><div class="chat-message-menu" style="top:${top}px;left:${left}px" role="menu">${canEdit ? `<button type="button" data-message-edit>${icon("edit")}<span>Редактировать</span></button>` : ""}<button type="button" class="danger" data-message-delete>${icon("trash")}<span>Удалить</span></button></div>`,
  );
  document.querySelector(".chat-message-menu-backdrop").onclick =
    closeMessageMenu;
  document
    .querySelector("[data-message-edit]")
    ?.addEventListener("click", () => startEditing(message));
  document
    .querySelector("[data-message-delete]")
    ?.addEventListener("click", () => void deleteMessage(message));
}

function installLongPressActions() {
  document
    .querySelectorAll("#chat-layer .chat-bubble[data-message-own=true]")
    .forEach((bubble) => {
      if (bubble.dataset.actionsBound === "true") return;
      bubble.dataset.actionsBound = "true";
      let timer = null,
        startX = 0,
        startY = 0;
      const clear = () => {
        if (timer) clearTimeout(timer);
        timer = null;
      };
      bubble.addEventListener("pointerdown", (event) => {
        startX = event.clientX;
        startY = event.clientY;
        timer = window.setTimeout(() => {
          navigator.vibrate?.(16);
          const message = currentMessages.get(String(bubble.dataset.messageId));
          openMessageMenu(bubble, message);
        }, 420);
      });
      bubble.addEventListener("pointermove", (event) => {
        if (Math.hypot(event.clientX - startX, event.clientY - startY) > 8)
          clear();
      });
      bubble.addEventListener("pointerup", clear);
      bubble.addEventListener("pointercancel", clear);
      bubble.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        const message = currentMessages.get(String(bubble.dataset.messageId));
        openMessageMenu(bubble, message);
      });
    });
}

async function renderConversation() {
  const layer = document.querySelector("#chat-layer");
  if (!layer || !openedFriend) return;
  const friendId = openedFriend.id;
  const generation = sessionGeneration;
  closeMessageMenu();
  const latestMessages = await loadMessages();
  if (!openedFriend || openedFriend.id !== friendId || generation !== sessionGeneration || layer.hidden) return;
  if (editingMessage) return;
  const previousInput = layer.querySelector('.chat-input');
  const draft = previousInput?.value || '';
  const focused = document.activeElement === previousInput;
  const selection = focused ? [previousInput.selectionStart, previousInput.selectionEnd] : null;
  const previousScroll = layer.querySelector('.chat-messages');
  const wasNearBottom = !previousScroll || previousScroll.scrollHeight - previousScroll.scrollTop - previousScroll.clientHeight < 80;
  const scrollTop = previousScroll?.scrollTop || 0;
  if (!olderMessages.length) hasOlderMessages = latestMessages.length === 80;
  const latestIds = new Set(latestMessages.map(message => String(message.id)));
  const messages = [...olderMessages.filter(message => !latestIds.has(String(message.id))), ...latestMessages];
  hasThreadCache = false;
  scheduleBadgeRefresh(0);
  const previousMessages = currentMessages;
  currentMessages = new Map(
    messages.map((message) => [String(message.id), message]),
  );
  const existingView = layer.querySelector('.chat-conversation-view');
  if (existingView?.dataset.friendId === String(friendId)) {
    const list = existingView.querySelector('.chat-messages');
    const existing = new Map([...list.querySelectorAll('.chat-bubble[data-message-id]')].map(node => [node.dataset.messageId, node]));
    list.querySelector('.chat-empty-conversation')?.remove();
    for (const [id, node] of existing) if (!currentMessages.has(id)) node.remove();
    const loadOlder = list.querySelector('button[data-load-older]');
    let cursor = loadOlder ? loadOlder.nextSibling : list.firstChild;
    for (const message of messages) {
      const id = String(message.id);
      let node = existing.get(id);
      if (!node || JSON.stringify(previousMessages.get(id)) !== JSON.stringify(message)) {
        const template = document.createElement('template');
        template.innerHTML = messageMarkup(message);
        const replacement = template.content.firstElementChild;
        if (node) { if (cursor === node) cursor = node.nextSibling; node.replaceWith(replacement); }
        node = replacement;
      }
      if (node !== cursor) list.insertBefore(node, cursor);
      cursor = node.nextSibling;
    }
    if (!messages.length && !list.querySelector('.is-sending')) list.insertAdjacentHTML('beforeend', '<div class="chat-empty-conversation">Напишите первое сообщение</div>');
    if (wasNearBottom) list.scrollTop = list.scrollHeight;
    installLongPressActions();
    void hydrateMedia();
    return;
  }
  layer.innerHTML = `<section class="chat-shell chat-conversation-view"><header class="chat-conversation-header"><button class="chat-icon-btn" data-chat-back aria-label="Назад">${icon("back")}</button><span class="chat-avatar small">${escapeHtml(openedFriend.name?.[0]?.toUpperCase() || "?")}</span><div class="chat-peer"><b>${escapeHtml(openedFriend.name)}</b><span>личный чат</span></div><div class="chat-header-actions"><button class="chat-call-shortcut" data-chat-call="audio" title="Аудиозвонок">☎</button><button class="chat-call-shortcut" data-chat-call="video" title="Видеозвонок">▣</button></div></header><div class="chat-messages">${messages.length ? messages.map(messageMarkup).join("") : '<div class="chat-empty-conversation">Напишите первое сообщение</div>'}</div><form class="chat-composer"><input class="chat-file" type="file" accept="image/*,video/*" hidden><button type="button" class="chat-icon-btn attach" data-chat-attach aria-label="Прикрепить фото или видео">${icon("attach")}</button><textarea class="chat-input" rows="1" maxlength="4000" placeholder="Сообщение" aria-label="Сообщение"></textarea><button class="chat-send" aria-label="Отправить">${icon("send")}</button></form></section>`;
  layer.querySelector('.chat-conversation-view').dataset.friendId = String(friendId);
  const messagesEl = layer.querySelector(".chat-messages");
  if (hasOlderMessages && messages.length) {
    const loadMore = document.createElement('button');
    loadMore.type = 'button';
    loadMore.className = 'btn ghost';
    loadMore.dataset.loadOlder = '';
    loadMore.textContent = 'Загрузить более ранние сообщения';
    messagesEl.prepend(loadMore);
    loadMore.onclick = async () => {
      loadMore.disabled = true;
      const previousHeight = messagesEl.scrollHeight;
      const older = await loadMessages(messages[0].created_at);
      if (!openedFriend || openedFriend.id !== friendId || generation !== sessionGeneration || !messagesEl.isConnected) return;
      hasOlderMessages = older.length === 80;
      const known = new Set(messages.map(message => String(message.id)));
      const unique = older.filter(message => !known.has(String(message.id)));
      olderMessages = [...unique, ...olderMessages];
      unique.forEach(message => currentMessages.set(String(message.id), message));
      loadMore.insertAdjacentHTML('afterend', unique.map(messageMarkup).join(''));
      if (!hasOlderMessages) loadMore.remove(); else loadMore.disabled = false;
      messagesEl.scrollTop += messagesEl.scrollHeight - previousHeight;
      installLongPressActions();
      void hydrateMedia();
    };
  }
  requestAnimationFrame(() => {
    messagesEl.scrollTop = wasNearBottom ? messagesEl.scrollHeight : scrollTop;
  });
  const returnToThreads = () => {
    openedFriend = null;
    lastConversationSignature = "";
    scheduleBadgeRefresh();
    return renderThreads();
  };
  layer.querySelector("[data-chat-back]").onclick = () =>
    void returnToThreads();
  installChatEdgeSwipe(
    layer.querySelector(".chat-conversation-view"),
    returnToThreads,
  );
  layer.querySelector("[data-chat-attach]").onclick = () =>
    layer.querySelector(".chat-file").click();
  layer.querySelector(".chat-file").onchange = (event) =>
    void sendMedia(event.target.files?.[0], {
      getOpenedFriend: () => openedFriend,
      renderConversation,
    });
  layer.querySelector(".chat-composer").onsubmit = (event) => {
    event.preventDefault();
    void sendText();
  };
  const input = layer.querySelector(".chat-input");
  input.value = draft;
  if (focused) {
    input.focus();
    if (selection) input.setSelectionRange?.(...selection);
  }
  input.onkeydown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendText();
    }
  };
  input.oninput = () => {
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
  };
  layer.querySelectorAll("[data-chat-call]").forEach((button) => {
    button.onclick = () => {
      state.selectedFriend = { id: openedFriend.id, name: openedFriend.name };
      document.dispatchEvent(
        new CustomEvent("aurora-chat-call", {
          detail: { mode: button.dataset.chatCall },
        }),
      );
    };
  });
  installLongPressActions();
  void hydrateMedia();
}

async function sendText() {
  const input = document.querySelector(".chat-input"),
    text = input?.value.trim();
  if (!text || !openedFriend) return;
  if (editingMessage) {
    const target = editingMessage;
    try {
      await rpc("edit_chat_message", {
        p_token: state.session.token,
        p_message_id: Number(target.id),
        p_body: text,
      });
      editingMessage = null;
      document.querySelector(".chat-edit-bar")?.remove();
      await renderConversation();
    } catch (error) {
      console.error("Failed to edit message", error);
      showToast("Не удалось изменить сообщение");
    }
    return;
  }
  input.value = "";
  input.style.height = "auto";
  const messagesEl = document.querySelector(".chat-messages");
  messagesEl?.querySelector(".chat-empty-conversation")?.remove();
  const optimistic = document.createElement("article");
  optimistic.className = "chat-bubble outgoing is-sending";
  optimistic.innerHTML = `<div class="chat-message-text">${escapeHtml(text)}</div><div class="chat-message-meta"><span>Отправка…</span></div>`;
  messagesEl?.append(optimistic);
  if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
  try {
    await rpc("send_chat_message", {
      p_token: state.session.token,
      p_to: openedFriend.id,
      p_kind: "text",
      p_body: text,
      p_media_data: null,
      p_media_mime: null,
      p_media_name: null,
    });
    optimistic.remove();
    await renderConversation();
  } catch (error) {
    optimistic.remove();
    const currentInput = document.querySelector('.chat-input');
    if (currentInput) currentInput.value = currentInput.value ? `${text}\n${currentInput.value}` : text;
    console.error(error);
    showToast("Не удалось отправить сообщение");
  }
}

async function refreshBadge() {
  if (!state.session || badgeRefreshInFlight) return;
  badgeRefreshInFlight = true;
  try {
    const threads = await getThreads();
    const total = threads.reduce(
      (sum, thread) => sum + Number(thread.unread_count || 0),
      0,
    );
    const badge = document.querySelector(".chat-nav-badge");
    if (badge) {
      badge.hidden = !total;
      badge.textContent = total > 99 ? "99+" : String(total);
    }
    void setAppBadgeCount(total);

    const activeThread = openedFriend
      ? threads.find((thread) => thread.friend_id === openedFriend.id)
      : null;
    const signature = conversationSignature(activeThread);
    const layer = document.querySelector("#chat-layer");
    const conversationVisible = Boolean(
      openedFriend &&
      layer &&
      !layer.hidden &&
      layer.querySelector(".chat-conversation-view"),
    );
    const gestureInProgress = Boolean(
      layer?.querySelector(".is-edge-back-swiping, .is-edge-back-settling"),
    );
    if (
      lastConversationSignature &&
      signature !== lastConversationSignature &&
      conversationVisible &&
      !gestureInProgress
    )
      await renderConversation();
    if (!gestureInProgress) lastConversationSignature = signature;
  } finally {
    badgeRefreshInFlight = false;
  }
}

function currentChatPollDelay() {
  const layer = document.querySelector("#chat-layer");
  return chatPollDelay({
    hasSession: Boolean(state.session),
    visible: document.visibilityState !== "hidden",
    conversationOpen: Boolean(openedFriend && layer && !layer.hidden),
    online: navigator.onLine !== false,
    activeCall: Boolean(state.callId || state.peer),
  });
}

function scheduleBadgeRefresh(delay = currentChatPollDelay()) {
  if (!initialized) return;
  if (pollTimer !== null) window.clearTimeout(pollTimer);
  pollTimer = window.setTimeout(
    async () => {
      pollTimer = null;
      await refreshBadge();
      scheduleBadgeRefresh();
    },
    Math.max(0, delay),
  );
}

export function initChat() {
  if (initialized) return;
  initialized = true;
  ensureShell();
  observer = new MutationObserver(ensureShell);
  observer.observe(document.getElementById("root"), {
    childList: true,
    subtree: true,
  });
  document.addEventListener(
    "aurora-chat-open",
    (event) => void openChat(event.detail || null),
  );
  document.addEventListener('aurora-session-cleared', () => {
    sessionGeneration += 1;
    cachedThreads = [];
    cachedThreadToken = '';
    hasThreadCache = false;
    threadFetchInFlight = null;
    olderMessages = [];
    hasOlderMessages = false;
    currentMessages.clear();
    clearMediaCache();
    closeChat();
    const layer = document.querySelector('#chat-layer');
    if (layer) layer.innerHTML = '';
  });
  document.addEventListener("visibilitychange", () =>
    scheduleBadgeRefresh(document.visibilityState === "hidden" ? undefined : 0),
  );
  window.addEventListener("online", () => scheduleBadgeRefresh(0));
  window.addEventListener("offline", () => scheduleBadgeRefresh());
  scheduleBadgeRefresh(0);
}
