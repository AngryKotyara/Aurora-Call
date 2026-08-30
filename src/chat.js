import { rpc } from "./api.js";
import {
  LEGACY_MEDIA_FRAME_SELECTOR,
  mediaRoutingAttribute,
} from "./chat-media-routing.js";
import { installChatEdgeSwipe } from "./chat-edge-swipe.js";
import { state } from "./state.js";
import { escapeHtml, showToast } from "./utils.js";

let openedFriend = null;
let pollTimer = null;
let observer = null;
let lastThreadSignature = "";
let editingMessage = null;
let currentMessages = new Map();
const mediaCache = new Map();
const MAX_MEDIA_BYTES = 1024 * 1024 * 1024;

function icon(name) {
  const paths = {
    chat: '<path d="M4 5.5A3.5 3.5 0 0 1 7.5 2h9A3.5 3.5 0 0 1 20 5.5v6a3.5 3.5 0 0 1-3.5 3.5H10l-5 4v-4.6A3.5 3.5 0 0 1 4 12z"/>',
    back: '<path d="m15 18-6-6 6-6"/>',
    attach:
      '<path d="M8.5 12.5 14 7a3 3 0 0 1 4.2 4.2l-7.1 7.1a5 5 0 0 1-7.1-7.1l7.2-7.2"/>',
    send: '<path d="m3 11 17-8-7.5 18-2-7.5zM10.5 13.5 20 3"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    edit: '<path d="m4 20 4.2-1 10.9-10.9a2.1 2.1 0 0 0-3-3L5.2 16zM14.8 6.4l3 3"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5M14 11v5"/>',
    home: '<path d="m3.5 10 8.5-7 8.5 7v9.5a1.5 1.5 0 0 1-1.5 1.5h-4.5v-7h-5v7H5a1.5 1.5 0 0 1-1.5-1.5z"/>',
    history: '<path d="M4 5v5h5M5.3 9A8 8 0 1 1 4 13M12 7v5l3 2"/>',
    friends:
      '<path d="M8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm8-1a3.5 3.5 0 1 0 0-7M2 21a6 6 0 0 1 12 0m1-7a5 5 0 0 1 7 4.6"/>',
    settings:
      '<path d="M12 8.2A3.8 3.8 0 1 0 12 15.8 3.8 3.8 0 0 0 12 8.2Zm0-5.2 1 .3.7 2.1 1.5.6 2-1 1 .7-.2 2.3 1.1 1.1 2.2.2.4 1.2-1.7 1.6v1.6l1.7 1.6-.4 1.2-2.2.2-1.1 1.1.2 2.3-1 .7-2-1-1.5.6-.7 2.1-1 .3-1.4-1.8H9.8L8.4 22l-1-.3-.7-2.1-1.5-.6-2 1-1-.7.2-2.3L1.3 16l-2.2-.2-.4-1.2L.4 13v-1.6L-1.3 9.8-.9 8.6l2.2-.2 1.1-1.1-.2-2.3 1-.7 2 1 1.5-.6.7-2.1 1-.3L9.8 4h1.6z"/>',
  };
  return `<svg class="aurora-nav-icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name]}</svg>`;
}

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

function formatTime(value) {
  return value
    ? new Intl.DateTimeFormat("ru", {
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(value))
    : "";
}
function formatThreadTime(value) {
  if (!value) return "";
  const date = new Date(value),
    now = new Date();
  return date.toDateString() === now.toDateString()
    ? formatTime(value)
    : new Intl.DateTimeFormat("ru", {
        day: "2-digit",
        month: "2-digit",
      }).format(date);
}
async function getThreads() {
  return state.session
    ? rpc("list_chat_threads", { p_token: state.session.token }).catch(() => [])
    : [];
}

function threadRow(thread) {
  const initial = escapeHtml(thread.username?.[0]?.toUpperCase() || "?");
  const preview = escapeHtml(thread.last_message || "Начните переписку");
  const unread = Number(thread.unread_count || 0);
  return `<button class="chat-thread" data-chat-friend="${escapeHtml(thread.friend_id)}" data-chat-name="${escapeHtml(thread.username)}"><span class="chat-avatar">${initial}</span><span class="chat-thread-main"><span class="chat-thread-top"><b>${escapeHtml(thread.username)}</b><time>${formatThreadTime(thread.last_at)}</time></span><span class="chat-thread-bottom"><span>${preview}</span>${unread ? `<strong class="chat-unread">${unread > 99 ? "99+" : unread}</strong>` : ""}</span></span></button>`;
}

async function openChat(friend = null) {
  ensureShell();
  const layer = document.querySelector("#chat-layer");
  layer.hidden = false;
  document.body.classList.add("chat-active");
  if (friend) openedFriend = friend;
  openedFriend ? await renderConversation() : await renderThreads();
}
function closeChat() {
  openedFriend = null;
  editingMessage = null;
  closeMessageMenu();
  const layer = document.querySelector("#chat-layer");
  if (layer) layer.hidden = true;
  document.body.classList.remove("chat-active");
}

async function renderThreads() {
  const layer = document.querySelector("#chat-layer");
  if (!layer) return;
  const threads = await getThreads();
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

export function mediaMarkup(message) {
  if (!message.media_data) return "";
  const name = escapeHtml(
    message.media_name || (message.kind === "image" ? "Фото" : "Видео"),
  );
  const direct =
    message.media_data.startsWith("data:") ||
    message.media_data.startsWith("http");
  const directAttr = direct
    ? ` data-direct-src="${escapeHtml(message.media_data)}"`
    : "";
  const routingAttr = mediaRoutingAttribute(message.media_data);
  if (message.kind === "image")
    return `<button class="chat-media-open chat-media-frame" data-chat-media-id="${message.id}" data-media-kind="image" data-media-name="${name}"${directAttr}${routingAttr}><div class="chat-media-skeleton"><span class="chat-media-spinner"></span><small>Загрузка фото…</small></div><img alt="${name}" loading="eager" hidden></button>`;
  if (message.kind === "video")
    return `<div class="chat-media-frame chat-video-frame" data-chat-media-id="${message.id}" data-media-kind="video" data-media-name="${name}"${directAttr}${routingAttr}><div class="chat-media-skeleton"><span class="chat-media-spinner"></span><small>Загрузка видео…</small></div><video class="chat-video" controls playsinline preload="metadata" hidden></video></div>`;
  return "";
}

function messageMarkup(message) {
  const incoming = message.sender_id === openedFriend?.id;
  const body = message.body
    ? `<div class="chat-message-text">${escapeHtml(message.body)}</div>`
    : "";
  const edited = message.edited_at
    ? '<span class="chat-edited">изменено</span>'
    : "";
  return `<article class="chat-bubble ${incoming ? "incoming" : "outgoing"}" data-message-id="${message.id}" data-message-own="${incoming ? "false" : "true"}" data-message-kind="${escapeHtml(message.kind || "text")}">${mediaMarkup(message)}${body}<div class="chat-message-meta">${edited}<time>${formatTime(message.created_at)}</time>${incoming ? "" : `<span class="chat-checks ${message.read_at ? "read" : ""}">✓✓</span>`}</div></article>`;
}

async function loadMessages() {
  if (!openedFriend || !state.session) return [];
  try {
    const rows = await rpc("list_chat_messages", {
      p_token: state.session.token,
      p_friend: openedFriend.id,
      p_before: null,
      p_limit: 80,
    });
    return rows.reverse();
  } catch (error) {
    console.error("Failed to load chat messages", error);
    showToast("Не удалось загрузить сообщения");
    return [];
  }
}

function base64ToBlobUrl(base64, mime) {
  const binary = atob(base64);
  const chunk = 64 * 1024;
  const parts = [];
  for (let offset = 0; offset < binary.length; offset += chunk) {
    const slice = binary.slice(offset, offset + chunk);
    const bytes = new Uint8Array(slice.length);
    for (let index = 0; index < slice.length; index += 1)
      bytes[index] = slice.charCodeAt(index);
    parts.push(bytes);
  }
  return URL.createObjectURL(
    new Blob(parts, { type: mime || "application/octet-stream" }),
  );
}

async function resolveMedia(messageId, directSrc) {
  if (directSrc) return directSrc;
  if (mediaCache.has(messageId)) return mediaCache.get(messageId);
  const result = await rpc("get_chat_media_secure", {
    p_token: state.session.token,
    p_message_id: Number(messageId),
  });
  const row = Array.isArray(result) ? result[0] : result;
  if (!row?.media_base64 || !row?.media_mime)
    throw new Error("media_not_found");
  const blobUrl = base64ToBlobUrl(row.media_base64, row.media_mime);
  mediaCache.set(messageId, blobUrl);
  return blobUrl;
}

function showUnsupportedMedia(frame, src, name) {
  frame.classList.add("is-unsupported");
  frame.innerHTML = `<a class="chat-file-card" href="${escapeHtml(src)}" download="${escapeHtml(name || "media")}"><span class="chat-file-icon">↧</span><span><b>${escapeHtml(name || "Медиафайл")}</b><small>Открыть или скачать</small></span></a>`;
}

async function hydrateMedia() {
  const frames = [
    ...document.querySelectorAll(`#chat-layer ${LEGACY_MEDIA_FRAME_SELECTOR}`),
  ];
  await Promise.all(
    frames.map(async (frame) => {
      if (frame.dataset.hydrated === "true") return;
      frame.dataset.hydrated = "loading";
      try {
        const src = await resolveMedia(
          frame.dataset.chatMediaId,
          frame.dataset.directSrc || "",
        );
        const skeleton = frame.querySelector(".chat-media-skeleton");
        if (frame.dataset.mediaKind === "image") {
          const img = frame.querySelector("img");
          img.onload = () => {
            skeleton?.remove();
            img.hidden = false;
            frame.dataset.mediaSrc = src;
            frame.dataset.hydrated = "true";
          };
          img.onerror = () =>
            showUnsupportedMedia(frame, src, frame.dataset.mediaName);
          img.src = src;
        } else {
          const video = frame.querySelector("video");
          video.onloadedmetadata = () => {
            skeleton?.remove();
            video.hidden = false;
            frame.dataset.hydrated = "true";
          };
          video.onerror = () =>
            showUnsupportedMedia(frame, src, frame.dataset.mediaName);
          video.src = src;
          video.load();
        }
      } catch (error) {
        console.error("Failed to load chat media", error);
        frame.dataset.hydrated = "false";
        const label = frame.querySelector(".chat-media-skeleton small");
        if (label)
          label.textContent = "Не удалось загрузить — нажмите для повтора";
        frame.onclick = () => {
          frame.dataset.hydrated = "false";
          void hydrateMedia();
        };
      }
    }),
  );
  document
    .querySelectorAll("#chat-layer .chat-media-open[data-media-src]")
    .forEach((button) => {
      button.onclick = () => showMediaViewer(button.dataset.mediaSrc);
    });
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
    const cached =
      mediaCache.get(String(message.id)) || mediaCache.get(message.id);
    if (cached?.startsWith?.("blob:")) URL.revokeObjectURL(cached);
    mediaCache.delete(String(message.id));
    mediaCache.delete(message.id);
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
  closeMessageMenu();
  editingMessage = null;
  const messages = await loadMessages();
  currentMessages = new Map(
    messages.map((message) => [String(message.id), message]),
  );
  layer.innerHTML = `<section class="chat-shell chat-conversation-view"><header class="chat-conversation-header"><button class="chat-icon-btn" data-chat-back aria-label="Назад">${icon("back")}</button><span class="chat-avatar small">${escapeHtml(openedFriend.name?.[0]?.toUpperCase() || "?")}</span><div class="chat-peer"><b>${escapeHtml(openedFriend.name)}</b><span>личный чат</span></div><div class="chat-header-actions"><button class="chat-call-shortcut" data-chat-call="audio" title="Аудиозвонок">☎</button><button class="chat-call-shortcut" data-chat-call="video" title="Видеозвонок">▣</button></div></header><div class="chat-messages">${messages.length ? messages.map(messageMarkup).join("") : '<div class="chat-empty-conversation">Напишите первое сообщение</div>'}</div><form class="chat-composer"><input class="chat-file" type="file" accept="image/*,video/*" hidden><button type="button" class="chat-icon-btn attach" data-chat-attach aria-label="Прикрепить фото или видео">${icon("attach")}</button><textarea class="chat-input" rows="1" maxlength="4000" placeholder="Сообщение" aria-label="Сообщение"></textarea><button class="chat-send" aria-label="Отправить">${icon("send")}</button></form></section>`;
  const messagesEl = layer.querySelector(".chat-messages");
  requestAnimationFrame(() => {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  });
  const returnToThreads = () => {
    openedFriend = null;
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
    void sendMedia(event.target.files?.[0]);
  layer.querySelector(".chat-composer").onsubmit = (event) => {
    event.preventDefault();
    void sendText();
  };
  const input = layer.querySelector(".chat-input");
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
    await renderConversation();
  } catch (error) {
    optimistic.remove();
    input.value = text;
    console.error(error);
    showToast("Не удалось отправить сообщение");
  }
}

function readFileBase64(file, onProgress) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = (event) => {
      if (event.lengthComputable)
        onProgress(Math.min(65, Math.round((event.loaded / event.total) * 65)));
    };
    reader.onload = () => {
      onProgress(68);
      resolve(String(reader.result).split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function createUploadBubble(file) {
  const messagesEl = document.querySelector(".chat-messages");
  messagesEl?.querySelector(".chat-empty-conversation")?.remove();
  const article = document.createElement("article");
  article.className = "chat-bubble outgoing chat-upload-bubble";
  const preview = URL.createObjectURL(file),
    isImage = file.type.startsWith("image/");
  article.innerHTML = `<div class="chat-upload-preview">${isImage ? `<img src="${preview}" alt="${escapeHtml(file.name)}">` : `<video src="${preview}" muted playsinline></video>`}<div class="chat-upload-mask"><span class="chat-upload-ring" style="--p:0"><b>0%</b></span><small>Отправка ${isImage ? "фото" : "видео"}</small></div></div><div class="chat-message-meta"><span>${escapeHtml(file.name)}</span></div>`;
  messagesEl?.append(article);
  if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
  return {
    article,
    preview,
    update(value) {
      const ring = article.querySelector(".chat-upload-ring");
      if (ring) {
        ring.style.setProperty("--p", String(value));
        ring.querySelector("b").textContent = `${value}%`;
      }
    },
  };
}

async function sendMedia(file) {
  if (!file || !openedFriend) return;
  if (!file.type.startsWith("image/") && !file.type.startsWith("video/"))
    return showToast("Можно отправлять фото и видео");
  if (file.size > MAX_MEDIA_BYTES)
    return showToast("Файл слишком большой. Максимум 1 ГБ");
  const upload = createUploadBubble(file);
  let fakeProgress = null;
  try {
    const base64 = await readFileBase64(file, (p) => upload.update(p));
    let p = 70;
    upload.update(p);
    fakeProgress = window.setInterval(() => {
      p = Math.min(94, p + Math.max(1, Math.round((95 - p) / 5)));
      upload.update(p);
    }, 180);
    await rpc("upload_chat_media", {
      p_token: state.session.token,
      p_to: openedFriend.id,
      p_kind: file.type.startsWith("image/") ? "image" : "video",
      p_body: null,
      p_media_mime: file.type,
      p_media_name: file.name,
      p_media_base64: base64,
    });
    upload.update(100);
    await new Promise((resolve) => setTimeout(resolve, 180));
    await renderConversation();
  } catch (error) {
    console.error("Failed to send chat media", error);
    upload.article.classList.add("is-failed");
    upload.article.querySelector(".chat-upload-mask small").textContent =
      "Ошибка отправки";
    showToast("Не удалось отправить файл");
  } finally {
    if (fakeProgress) clearInterval(fakeProgress);
    URL.revokeObjectURL(upload.preview);
  }
}

function showMediaViewer(src) {
  document.body.insertAdjacentHTML(
    "beforeend",
    `<div class="chat-viewer" role="dialog" aria-modal="true"><button class="chat-viewer-close" aria-label="Закрыть">${icon("close")}</button><img src="${escapeHtml(src)}" alt="Просмотр фото"></div>`,
  );
  const viewer = document.querySelector(".chat-viewer:last-of-type");
  viewer.onclick = (event) => {
    if (event.target === viewer || event.target.closest(".chat-viewer-close"))
      viewer.remove();
  };
}

async function refreshBadge() {
  if (!state.session) return;
  const threads = await getThreads(),
    total = threads.reduce(
      (sum, thread) => sum + Number(thread.unread_count || 0),
      0,
    ),
    badge = document.querySelector(".chat-nav-badge");
  if (badge) {
    badge.hidden = !total;
    badge.textContent = total > 99 ? "99+" : String(total);
  }
  const signature = threads
    .map(
      (thread) =>
        `${thread.friend_id}:${thread.last_at}:${thread.unread_count}`,
    )
    .join("|");
  if (
    lastThreadSignature &&
    signature !== lastThreadSignature &&
    openedFriend &&
    !document.querySelector("#chat-layer")?.hidden
  )
    await renderConversation();
  lastThreadSignature = signature;
}

export function initChat() {
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
  pollTimer = window.setInterval(() => void refreshBadge(), 2200);
  void refreshBadge();
}
