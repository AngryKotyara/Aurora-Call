import { rpc } from "../api.js";
import { state } from "../state.js";
import { escapeHtml } from "../utils.js";
import { LEGACY_MEDIA_FRAME_SELECTOR } from "../chat-media-routing.js";
import { icon } from "./markup.js";

const mediaCache = new Map();

export function clearMediaCache() {
  mediaCache.forEach((url) => {
    if (url?.startsWith?.("blob:")) URL.revokeObjectURL(url);
  });
  mediaCache.clear();
}

export function removeCachedMedia(messageId) {
  const cached = mediaCache.get(String(messageId)) || mediaCache.get(messageId);
  if (cached?.startsWith?.("blob:")) URL.revokeObjectURL(cached);
  mediaCache.delete(String(messageId));
  mediaCache.delete(messageId);
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

export async function hydrateMedia() {
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
