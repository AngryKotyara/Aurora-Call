import { rpc } from "./api.js";
import { state } from "./state.js";
import { escapeHtml, showToast } from "./utils.js";

let openedFriend = null;
let pollTimer = null;
let observer = null;
let lastThreadSignature = "";

const MAX_MEDIA_BYTES = 8 * 1024 * 1024;

function icon(name) {
  const paths = {
    chat: '<path d="M4 5.5A3.5 3.5 0 0 1 7.5 2h9A3.5 3.5 0 0 1 20 5.5v6a3.5 3.5 0 0 1-3.5 3.5H10l-5 4v-4.6A3.5 3.5 0 0 1 4 12z"/>',
    back: '<path d="m15 18-6-6 6-6"/>',
    attach: '<path d="M8.5 12.5 14 7a3 3 0 0 1 4.2 4.2l-7.1 7.1a5 5 0 0 1-7.1-7.1l7.2-7.2"/>',
    send: '<path d="m3 11 17-8-7.5 18-2-7.5zM10.5 13.5 20 3"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name]}</svg>`;
}

function ensureShell() {
  const nav = document.querySelector(".nav");
  if (nav && !nav.querySelector("[data-chat-open]")) {
    nav.insertAdjacentHTML("beforeend", `<button data-chat-open aria-label="Чаты" title="Чаты">${icon("chat")}<span class="chat-nav-badge" hidden></span></button>`);
    nav.querySelector("[data-chat-open]").addEventListener("click", () => openChat());
  }

  if (!document.querySelector("#chat-layer")) {
    document.body.insertAdjacentHTML("beforeend", '<div id="chat-layer" class="chat-layer" hidden></div>');
  }
}

function formatTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("ru", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatThreadTime(value) {
  if (!value) return "";
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return formatTime(value);
  return new Intl.DateTimeFormat("ru", { day: "2-digit", month: "2-digit" }).format(date);
}

async function getThreads() {
  if (!state.session) return [];
  return rpc("list_chat_threads", { p_token: state.session.token }).catch(() => []);
}

function threadRow(thread) {
  const initial = escapeHtml(thread.username?.[0]?.toUpperCase() || "?");
  const preview = escapeHtml(thread.last_message || "Начните переписку");
  const unread = Number(thread.unread_count || 0);
  return `<button class="chat-thread" data-chat-friend="${escapeHtml(thread.friend_id)}" data-chat-name="${escapeHtml(thread.username)}">
    <span class="chat-avatar">${initial}</span>
    <span class="chat-thread-main"><span class="chat-thread-top"><b>${escapeHtml(thread.username)}</b><time>${formatThreadTime(thread.last_at)}</time></span><span class="chat-thread-bottom"><span>${preview}</span>${unread ? `<strong class="chat-unread">${unread > 99 ? "99+" : unread}</strong>` : ""}</span></span>
  </button>`;
}

async function openChat(friend = null) {
  ensureShell();
  const layer = document.querySelector("#chat-layer");
  layer.hidden = false;
  document.body.classList.add("chat-active");
  if (friend) openedFriend = friend;
  if (openedFriend) await renderConversation();
  else await renderThreads();
}

function closeChat() {
  openedFriend = null;
  const layer = document.querySelector("#chat-layer");
  if (layer) layer.hidden = true;
  document.body.classList.remove("chat-active");
}

async function renderThreads() {
  const layer = document.querySelector("#chat-layer");
  if (!layer) return;
  const threads = await getThreads();
  layer.innerHTML = `<section class="chat-shell chat-list-view">
    <header class="chat-topbar"><div><span class="chat-kicker">Aurora Call</span><h1>Чаты</h1></div><button class="chat-icon-btn" data-chat-close aria-label="Закрыть">${icon("close")}</button></header>
    <div class="chat-search-wrap"><input class="chat-search" type="search" placeholder="Поиск" aria-label="Поиск по чатам"></div>
    <div class="chat-thread-list">${threads.length ? threads.map(threadRow).join("") : '<div class="chat-empty"><span>💬</span><b>Сообщений пока нет</b><p>Выберите друга и начните переписку.</p></div>'}</div>
  </section>`;
  layer.querySelector("[data-chat-close]").addEventListener("click", closeChat);
  layer.querySelector(".chat-search").addEventListener("input", (event) => {
    const q = event.target.value.toLowerCase().trim();
    layer.querySelectorAll(".chat-thread").forEach((row) => row.hidden = !row.dataset.chatName.toLowerCase().includes(q));
  });
  layer.querySelectorAll("[data-chat-friend]").forEach((row) => row.addEventListener("click", () => openChat({ id: row.dataset.chatFriend, name: row.dataset.chatName })));
}

function messageMarkup(message) {
  const incoming = message.sender_id === openedFriend?.id;
  const body = message.body ? `<div class="chat-message-text">${escapeHtml(message.body)}</div>` : "";
  let media = "";
  if (message.kind === "image" && message.media_data) media = `<button class="chat-media-open" data-media-src="${escapeHtml(message.media_data)}" data-media-type="image"><img src="${escapeHtml(message.media_data)}" alt="${escapeHtml(message.media_name || "Фото")}" loading="lazy"></button>`;
  if (message.kind === "video" && message.media_data) media = `<video class="chat-video" src="${escapeHtml(message.media_data)}" controls playsinline preload="metadata"></video>`;
  return `<article class="chat-bubble ${incoming ? "incoming" : "outgoing"}">${media}${body}<div class="chat-message-meta"><time>${formatTime(message.created_at)}</time>${incoming ? "" : `<span class="chat-checks ${message.read_at ? "read" : ""}">✓✓</span>`}</div></article>`;
}

async function loadMessages() {
  if (!openedFriend || !state.session) return [];
  const rows = await rpc("list_chat_messages", { p_token: state.session.token, p_friend: openedFriend.id, p_before: null, p_limit: 80 }).catch(() => []);
  return rows.reverse();
}

async function renderConversation({ preserveScroll = false } = {}) {
  const layer = document.querySelector("#chat-layer");
  if (!layer || !openedFriend) return;
  const messages = await loadMessages();
  layer.innerHTML = `<section class="chat-shell chat-conversation-view">
    <header class="chat-conversation-header"><button class="chat-icon-btn" data-chat-back aria-label="Назад">${icon("back")}</button><span class="chat-avatar small">${escapeHtml(openedFriend.name?.[0]?.toUpperCase() || "?")}</span><div class="chat-peer"><b>${escapeHtml(openedFriend.name)}</b><span>личный чат</span></div><div class="chat-header-actions"><button class="chat-call-shortcut" data-chat-call="audio" title="Аудиозвонок">☎</button><button class="chat-call-shortcut" data-chat-call="video" title="Видеозвонок">▣</button></div></header>
    <div class="chat-messages">${messages.length ? messages.map(messageMarkup).join("") : '<div class="chat-day"><span>Сегодня</span></div><div class="chat-empty-conversation">Напишите первое сообщение</div>'}</div>
    <form class="chat-composer"><input class="chat-file" type="file" accept="image/*,video/*" hidden><button type="button" class="chat-icon-btn attach" data-chat-attach aria-label="Прикрепить фото или видео">${icon("attach")}</button><textarea class="chat-input" rows="1" maxlength="4000" placeholder="Сообщение" aria-label="Сообщение"></textarea><button class="chat-send" aria-label="Отправить">${icon("send")}</button></form>
  </section>`;

  const messagesEl = layer.querySelector(".chat-messages");
  if (!preserveScroll) requestAnimationFrame(() => { messagesEl.scrollTop = messagesEl.scrollHeight; });
  layer.querySelector("[data-chat-back]").addEventListener("click", () => { openedFriend = null; void renderThreads(); });
  layer.querySelector("[data-chat-attach]").addEventListener("click", () => layer.querySelector(".chat-file").click());
  layer.querySelector(".chat-file").addEventListener("change", (event) => void sendMedia(event.target.files?.[0]));
  layer.querySelector(".chat-composer").addEventListener("submit", (event) => { event.preventDefault(); void sendText(); });
  const input = layer.querySelector(".chat-input");
  input.addEventListener("keydown", (event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendText(); } });
  input.addEventListener("input", () => { input.style.height = "auto"; input.style.height = `${Math.min(input.scrollHeight, 120)}px`; });
  layer.querySelectorAll("[data-chat-call]").forEach((button) => button.addEventListener("click", () => {
    state.selectedFriend = { id: openedFriend.id, name: openedFriend.name };
    document.dispatchEvent(new CustomEvent("aurora-chat-call", { detail: { mode: button.dataset.chatCall } }));
  }));
  layer.querySelectorAll("[data-media-type=image]").forEach((button) => button.addEventListener("click", () => showMediaViewer(button.dataset.mediaSrc)));
}

async function sendText() {
  const input = document.querySelector(".chat-input");
  const text = input?.value.trim();
  if (!text || !openedFriend) return;
  input.value = "";
  input.style.height = "auto";
  try {
    await rpc("send_chat_message", { p_token: state.session.token, p_to: openedFriend.id, p_kind: "text", p_body: text, p_media_data: null, p_media_mime: null, p_media_name: null });
    await renderConversation();
  } catch { showToast("Не удалось отправить сообщение"); }
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function sendMedia(file) {
  if (!file || !openedFriend) return;
  if (!/^image\//.test(file.type) && !/^video\//.test(file.type)) return showToast("Можно отправлять фото и видео");
  if (file.size > MAX_MEDIA_BYTES) return showToast("Файл слишком большой. Максимум 8 МБ");
  const composer = document.querySelector(".chat-composer");
  composer?.classList.add("is-uploading");
  try {
    const data = await fileToDataUrl(file);
    await rpc("send_chat_message", { p_token: state.session.token, p_to: openedFriend.id, p_kind: file.type.startsWith("image/") ? "image" : "video", p_body: null, p_media_data: data, p_media_mime: file.type, p_media_name: file.name });
    await renderConversation();
  } catch { showToast("Не удалось отправить файл"); }
  finally { composer?.classList.remove("is-uploading"); }
}

function showMediaViewer(src) {
  document.body.insertAdjacentHTML("beforeend", `<div class="chat-viewer" role="dialog" aria-modal="true"><button class="chat-viewer-close" aria-label="Закрыть">${icon("close")}</button><img src="${escapeHtml(src)}" alt="Просмотр фото"></div>`);
  const viewer = document.querySelector(".chat-viewer:last-of-type");
  viewer.addEventListener("click", (event) => { if (event.target === viewer || event.target.closest(".chat-viewer-close")) viewer.remove(); });
}

async function refreshBadge() {
  if (!state.session) return;
  const threads = await getThreads();
  const total = threads.reduce((sum, thread) => sum + Number(thread.unread_count || 0), 0);
  const badge = document.querySelector(".chat-nav-badge");
  if (badge) { badge.hidden = !total; badge.textContent = total > 99 ? "99+" : String(total); }
  const signature = threads.map((t) => `${t.friend_id}:${t.last_at}:${t.unread_count}`).join("|");
  if (lastThreadSignature && signature !== lastThreadSignature && openedFriend && !document.querySelector("#chat-layer")?.hidden) await renderConversation({ preserveScroll: false });
  lastThreadSignature = signature;
}

export function initChat() {
  ensureShell();
  observer = new MutationObserver(ensureShell);
  observer.observe(document.getElementById("root"), { childList: true, subtree: true });
  document.addEventListener("aurora-chat-open", (event) => void openChat(event.detail || null));
  pollTimer = window.setInterval(() => void refreshBadge(), 2200);
  void refreshBadge();
}
