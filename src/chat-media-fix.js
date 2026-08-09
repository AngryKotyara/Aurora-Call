import { config } from "./config.js";

const resolved = new Map();
const pending = new Map();

function getSession() {
  try {
    return JSON.parse(localStorage.getItem(config.sessionStorageKey) || "null");
  } catch {
    return null;
  }
}

function base64ToBlobUrl(base64, mime) {
  const chunkSize = 1024 * 1024;
  const parts = [];
  for (let offset = 0; offset < base64.length; offset += chunkSize) {
    const binary = atob(base64.slice(offset, offset + chunkSize));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    parts.push(bytes);
  }
  return URL.createObjectURL(new Blob(parts, { type: mime || "application/octet-stream" }));
}

async function fetchMedia(messageId) {
  if (resolved.has(messageId)) return resolved.get(messageId);
  if (pending.has(messageId)) return pending.get(messageId);

  const task = (async () => {
    const session = getSession();
    if (!session?.token) throw new Error("missing_session");

    const response = await fetch(`${config.rpcBaseUrl}get_chat_media_secure`, {
      method: "POST",
      headers: {
        apikey: config.supabasePublishableKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_token: session.token,
        p_message_id: Number(messageId),
      }),
    });

    if (!response.ok) throw new Error(`media_${response.status}`);
    const payload = await response.json();
    const row = Array.isArray(payload) ? payload[0] : payload;
    if (!row?.media_base64) throw new Error("media_not_found");

    const url = base64ToBlobUrl(row.media_base64, row.media_mime);
    const value = { url, mime: row.media_mime || "", name: row.media_name || "Медиафайл" };
    resolved.set(messageId, value);
    return value;
  })().finally(() => pending.delete(messageId));

  pending.set(messageId, task);
  return task;
}

function finishImage(frame, image, skeleton, media) {
  image.onload = () => {
    skeleton?.remove();
    image.hidden = false;
    frame.dataset.mediaSrc = media.url;
    frame.classList.add("is-loaded");
  };
  image.onerror = () => {
    if (skeleton) skeleton.querySelector("small").textContent = "Формат не поддерживается";
  };
  image.src = media.url;
  frame.onclick = () => {
    if (!frame.dataset.mediaSrc) return;
    const viewer = document.createElement("div");
    viewer.className = "chat-viewer";
    viewer.setAttribute("role", "dialog");
    viewer.setAttribute("aria-modal", "true");
    viewer.innerHTML = `<button class="chat-viewer-close" aria-label="Закрыть">×</button><img src="${frame.dataset.mediaSrc}" alt="Просмотр фото">`;
    viewer.addEventListener("click", (event) => {
      if (event.target === viewer || event.target.closest(".chat-viewer-close")) viewer.remove();
    });
    document.body.append(viewer);
  };
}

function finishVideo(frame, video, skeleton, media) {
  video.onloadedmetadata = () => {
    skeleton?.remove();
    video.hidden = false;
    frame.classList.add("is-loaded");
  };
  video.onerror = () => {
    if (skeleton) skeleton.querySelector("small").textContent = "Формат не поддерживается";
  };
  video.src = media.url;
  video.load();
}

async function hydrate(frame) {
  if (frame.dataset.blobHydrated === "true" || frame.dataset.blobHydrating === "true") return;
  if (frame.dataset.directSrc) return;
  const id = frame.dataset.chatMediaId;
  if (!id) return;

  frame.dataset.blobHydrating = "true";
  try {
    const media = await fetchMedia(id);
    const skeleton = frame.querySelector(".chat-media-skeleton");
    const image = frame.querySelector("img");
    const video = frame.querySelector("video");
    if (image) finishImage(frame, image, skeleton, media);
    else if (video) finishVideo(frame, video, skeleton, media);
    frame.dataset.blobHydrated = "true";
  } catch (error) {
    console.error("Aurora media hydration failed", error);
    const label = frame.querySelector(".chat-media-skeleton small");
    if (label) label.textContent = "Не удалось загрузить — нажмите, чтобы повторить";
    frame.onclick = () => {
      frame.dataset.blobHydrating = "false";
      delete frame.dataset.blobHydrated;
      void hydrate(frame);
    };
  } finally {
    frame.dataset.blobHydrating = "false";
  }
}

function scan() {
  document.querySelectorAll("#chat-layer [data-chat-media-id]").forEach((frame) => void hydrate(frame));
}

const observer = new MutationObserver(scan);
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener("pageshow", scan);
setInterval(scan, 1500);
scan();
