import { escapeHtml } from "../utils.js";
import { mediaRoutingAttribute } from "../chat-media-routing.js";

export function icon(name) {
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
export function threadRow(thread) {
  const initial = escapeHtml(thread.username?.[0]?.toUpperCase() || "?");
  const preview = escapeHtml(thread.last_message || "Начните переписку");
  const unread = Number(thread.unread_count || 0);
  return `<button class="chat-thread" data-chat-friend="${escapeHtml(thread.friend_id)}" data-chat-name="${escapeHtml(thread.username)}"><span class="chat-avatar">${initial}</span><span class="chat-thread-main"><span class="chat-thread-top"><b>${escapeHtml(thread.username)}</b><time>${formatThreadTime(thread.last_at)}</time></span><span class="chat-thread-bottom"><span>${preview}</span>${unread ? `<strong class="chat-unread">${unread > 99 ? "99+" : unread}</strong>` : ""}</span></span></button>`;
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

export function renderMessageMarkup(message, friendId) {
  const incoming = message.sender_id === friendId;
  const body = message.body
    ? `<div class="chat-message-text">${escapeHtml(message.body)}</div>`
    : "";
  const edited = message.edited_at
    ? '<span class="chat-edited">изменено</span>'
    : "";
  return `<article class="chat-bubble ${incoming ? "incoming" : "outgoing"}" data-message-id="${message.id}" data-message-own="${incoming ? "false" : "true"}" data-message-kind="${escapeHtml(message.kind || "text")}">${mediaMarkup(message)}${body}<div class="chat-message-meta">${edited}<time>${formatTime(message.created_at)}</time>${incoming ? "" : `<span class="chat-checks ${message.read_at ? "read" : ""}">✓✓</span>`}</div></article>`;
}
