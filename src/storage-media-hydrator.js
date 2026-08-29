import { config } from "./config.js";
import { state } from "./state.js";

const EDGE_URL = `${config.functionsBaseUrl}aurora-chat-media`;
const SIGNED_URL_TTL_MS = 12 * 60 * 1000;
const RETRY_DELAYS = [0, 400, 1200];
const signedUrlCache = new Map();
const signedUrlPending = new Map();
const imageBlobCache = new Map();
const imageBlobPending = new Map();

function sessionToken() {
  if (state.session?.token) return state.session.token;
  try {
    return JSON.parse(localStorage.getItem(config.sessionStorageKey) || "null")
      ?.token;
  } catch {
    return null;
  }
}

function sleep(ms) {
  return ms
    ? new Promise((resolve) => window.setTimeout(resolve, ms))
    : Promise.resolve();
}

function mediaError(code, status = 0) {
  const error = new Error(code || `download_${status}`);
  error.code = code || `download_${status}`;
  return error;
}

function revokeImageBlob(messageId) {
  const cached = imageBlobCache.get(messageId);
  if (cached?.url?.startsWith("blob:")) URL.revokeObjectURL(cached.url);
  imageBlobCache.delete(messageId);
}

async function getSignedUrl(messageId, { force = false } = {}) {
  const cached = signedUrlCache.get(messageId);
  if (!force && cached?.expiresAt > Date.now()) return cached.url;
  if (signedUrlPending.has(messageId)) return signedUrlPending.get(messageId);
  if (force) signedUrlCache.delete(messageId);

  const task = (async () => {
    let lastError = null;
    for (const delay of RETRY_DELAYS) {
      await sleep(delay);
      const token = sessionToken();
      if (!token) throw mediaError("missing_session");
      try {
        const response = await fetch(EDGE_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "download",
            token,
            messageId: Number(messageId),
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload?.ok || !payload?.url) {
          const error = mediaError(
            payload?.error || `download_${response.status}`,
            response.status,
          );
          if (error.code === "not_storage_media") throw error;
          lastError = error;
          continue;
        }
        const value = {
          url: payload.url,
          expiresAt: Date.now() + SIGNED_URL_TTL_MS,
        };
        signedUrlCache.set(messageId, value);
        return value.url;
      } catch (error) {
        if (error?.code === "not_storage_media") throw error;
        lastError = error;
      }
    }
    throw lastError || mediaError("download_failed");
  })().finally(() => signedUrlPending.delete(messageId));

  signedUrlPending.set(messageId, task);
  return task;
}

async function getImageBlobUrl(messageId, signedUrl, { force = false } = {}) {
  if (!force && imageBlobCache.has(messageId))
    return imageBlobCache.get(messageId).url;
  if (imageBlobPending.has(messageId)) return imageBlobPending.get(messageId);
  if (force) revokeImageBlob(messageId);

  const task = (async () => {
    const response = await fetch(signedUrl, {
      method: "GET",
      cache: "force-cache",
      credentials: "omit",
    });
    if (!response.ok)
      throw mediaError(`image_fetch_${response.status}`, response.status);
    const blob = await response.blob();
    if (!blob.size) throw mediaError("image_empty");
    if (blob.type && !blob.type.startsWith("image/"))
      throw mediaError("image_invalid_type");
    const url = URL.createObjectURL(blob);
    imageBlobCache.set(messageId, { url, size: blob.size, type: blob.type });
    return url;
  })().finally(() => imageBlobPending.delete(messageId));

  imageBlobPending.set(messageId, task);
  return task;
}

function setLoadingLabel(frame) {
  const label = frame.querySelector(".chat-media-skeleton small");
  if (!label) return;
  label.textContent =
    frame.dataset.mediaKind === "video" ? "Загрузка видео…" : "Загрузка фото…";
}

function showViewer(src) {
  const viewer = document.createElement("div");
  viewer.className = "chat-viewer";
  viewer.setAttribute("role", "dialog");
  viewer.setAttribute("aria-modal", "true");

  const close = document.createElement("button");
  close.type = "button";
  close.className = "chat-viewer-close";
  close.setAttribute("aria-label", "Закрыть");
  close.textContent = "×";

  const image = document.createElement("img");
  image.src = src;
  image.alt = "Просмотр фото";

  viewer.append(close, image);
  viewer.addEventListener("click", (event) => {
    if (event.target === viewer || event.target.closest(".chat-viewer-close"))
      viewer.remove();
  });
  document.body.append(viewer);
}

function bindFrameInteraction(frame) {
  if (frame.dataset.storageInteractionBound === "true") return;
  frame.dataset.storageInteractionBound = "true";
  frame.addEventListener(
    "click",
    (event) => {
      if (
        frame.dataset.mediaKind === "image" &&
        frame.dataset.storageMediaSrc
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        showViewer(frame.dataset.storageMediaSrc);
        return;
      }
      if (frame.dataset.storageFailed === "true") {
        event.preventDefault();
        event.stopImmediatePropagation();
        frame.dataset.storageFailed = "false";
        frame.dataset.storageHydrated = "false";
        void hydrate(frame, { force: true });
      }
    },
    true,
  );
}

function revealImage(frame, url) {
  const image = frame.querySelector("img");
  if (!image) return Promise.reject(mediaError("image_missing"));
  image.decoding = "async";
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (handler) => {
      if (settled) return;
      settled = true;
      image.onload = null;
      image.onerror = null;
      handler();
    };
    image.onload = () =>
      finish(() => {
        frame.querySelector(".chat-media-skeleton")?.remove();
        image.hidden = false;
        frame.dataset.mediaSrc = url;
        frame.dataset.storageMediaSrc = url;
        frame.dataset.hydrated = "true";
        frame.classList.add("is-loaded");
        resolve();
      });
    image.onerror = () => finish(() => reject(mediaError("image_load_failed")));
    image.src = url;
    if (image.complete && image.naturalWidth > 0)
      queueMicrotask(() => image.onload?.());
  });
}

function revealVideo(frame, url) {
  const video = frame.querySelector("video");
  if (!video) return Promise.reject(mediaError("video_missing"));
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (handler) => {
      if (settled) return;
      settled = true;
      video.onloadedmetadata = null;
      video.onerror = null;
      handler();
    };
    video.onloadedmetadata = () =>
      finish(() => {
        frame.querySelector(".chat-media-skeleton")?.remove();
        video.hidden = false;
        frame.dataset.hydrated = "true";
        frame.classList.add("is-loaded");
        resolve();
      });
    video.onerror = () => finish(() => reject(mediaError("video_load_failed")));
    video.src = url;
    video.load();
  });
}

async function reveal(frame, signedUrl, messageId, { force = false } = {}) {
  if (frame.dataset.mediaKind === "image") {
    const blobUrl = await getImageBlobUrl(messageId, signedUrl, { force });
    return revealImage(frame, blobUrl);
  }
  if (frame.dataset.mediaKind === "video") return revealVideo(frame, signedUrl);
  throw mediaError("unsupported_media_kind");
}

async function hydrate(frame, { force = false } = {}) {
  const id = Number(frame.dataset.chatMediaId || 0);
  if (
    !id ||
    frame.dataset.directSrc ||
    frame.dataset.storageSkipped === "true" ||
    frame.dataset.storageHydrating === "true" ||
    (!force && frame.dataset.storageHydrated === "true") ||
    (!force && frame.dataset.storageFailed === "true")
  )
    return;

  bindFrameInteraction(frame);
  frame.dataset.storageHydrating = "true";
  frame.dataset.storageFailed = "false";
  setLoadingLabel(frame);

  try {
    let signedUrl = await getSignedUrl(id, { force });
    if (!frame.isConnected) return;
    try {
      await reveal(frame, signedUrl, id, { force });
    } catch (error) {
      if (
        !String(error?.code || "").includes("load_failed") &&
        !String(error?.code || "").startsWith("image_fetch_")
      )
        throw error;
      signedUrlCache.delete(id);
      revokeImageBlob(id);
      signedUrl = await getSignedUrl(id, { force: true });
      if (!frame.isConnected) return;
      await reveal(frame, signedUrl, id, { force: true });
    }
    frame.dataset.storageHydrated = "true";
    frame.dataset.storageFailed = "false";
  } catch (error) {
    if (error?.code === "not_storage_media") {
      frame.dataset.storageSkipped = "true";
      return;
    }
    console.warn("Storage media hydration failed", error);
    frame.dataset.storageHydrated = "false";
    frame.dataset.storageFailed = "true";
    const label = frame.querySelector(".chat-media-skeleton small");
    if (label) label.textContent = "Не удалось загрузить — нажмите для повтора";
  } finally {
    frame.dataset.storageHydrating = "false";
  }
}

function scan({ retryFailed = false } = {}) {
  document
    .querySelectorAll("#chat-layer [data-chat-media-id]")
    .forEach((frame) => {
      if (retryFailed && frame.dataset.storageFailed === "true")
        frame.dataset.storageFailed = "false";
      void hydrate(frame, { force: retryFailed });
    });
}

const observer = new MutationObserver(() => scan());
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener("pageshow", () => scan());
window.addEventListener("online", () => scan({ retryFailed: true }));
document.addEventListener("aurora-chat-media-complete", () => scan());
window.addEventListener("pagehide", () => {
  imageBlobCache.forEach((value) => {
    if (value?.url?.startsWith("blob:")) URL.revokeObjectURL(value.url);
  });
  imageBlobCache.clear();
});
scan();
