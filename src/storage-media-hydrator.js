import { config } from "./config.js";
import { state } from "./state.js";

const EDGE_URL = "https://taqpirplpmjihmkztwlv.supabase.co/functions/v1/aurora-chat-media";
const STORAGE_MESSAGE_START_ID = 11;
const cache = new Map();
const pending = new Map();

async function getSignedUrl(messageId) {
  if (cache.has(messageId)) return cache.get(messageId);
  if (pending.has(messageId)) return pending.get(messageId);
  const task = (async () => {
    const response = await fetch(EDGE_URL, {
      method: "POST",
      headers: {
        apikey: config.supabasePublishableKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "download",
        token: state.session?.token,
        messageId: Number(messageId),
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.ok || !payload?.url) throw new Error(payload?.error || `download_${response.status}`);
    cache.set(messageId, payload.url);
    return payload.url;
  })().finally(() => pending.delete(messageId));
  pending.set(messageId, task);
  return task;
}

function showImage(frame, url) {
  const image = frame.querySelector("img");
  if (!image) return;
  image.onload = () => {
    frame.querySelector(".chat-media-skeleton")?.remove();
    image.hidden = false;
    frame.dataset.mediaSrc = url;
    frame.dataset.hydrated = "true";
    frame.onclick = () => {
      const viewer = document.createElement("div");
      viewer.className = "chat-viewer";
      viewer.setAttribute("role", "dialog");
      viewer.setAttribute("aria-modal", "true");
      viewer.innerHTML = `<button class="chat-viewer-close" aria-label="Закрыть">×</button><img src="${url}" alt="Просмотр фото">`;
      viewer.onclick = (event) => {
        if (event.target === viewer || event.target.closest(".chat-viewer-close")) viewer.remove();
      };
      document.body.append(viewer);
    };
  };
  image.src = url;
}

function showVideo(frame, url) {
  const video = frame.querySelector("video");
  if (!video) return;
  video.onloadedmetadata = () => {
    frame.querySelector(".chat-media-skeleton")?.remove();
    video.hidden = false;
    frame.dataset.hydrated = "true";
  };
  video.src = url;
  video.load();
}

async function hydrate(frame) {
  const id = Number(frame.dataset.chatMediaId || 0);
  if (!id || id < STORAGE_MESSAGE_START_ID || frame.dataset.storageHydrating === "true" || frame.dataset.storageHydrated === "true") return;
  frame.dataset.storageHydrating = "true";
  try {
    const url = await getSignedUrl(id);
    if (!frame.isConnected) return;
    if (frame.dataset.mediaKind === "image") showImage(frame, url);
    else if (frame.dataset.mediaKind === "video") showVideo(frame, url);
    frame.dataset.storageHydrated = "true";
  } catch (error) {
    if (String(error?.message || "") !== "not_storage_media") {
      console.warn("Storage media hydration failed", error);
    }
  } finally {
    frame.dataset.storageHydrating = "false";
  }
}

function scan() {
  document.querySelectorAll("#chat-layer [data-chat-media-id]").forEach((frame) => void hydrate(frame));
}

const observer = new MutationObserver(scan);
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener("pageshow", scan);
scan();
