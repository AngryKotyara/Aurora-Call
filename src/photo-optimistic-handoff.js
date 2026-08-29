import { config } from "./config.js";
import { STORAGE_MEDIA_FRAME_SELECTOR } from "./chat-media-routing.js";
import { state } from "./state.js";

const EDGE_URL = `${config.functionsBaseUrl}aurora-chat-media`;
const CAPTURE_TTL_MS = 2 * 60 * 1000;
const RETRY_DELAYS = [0, 900, 1800, 3500, 7000];
const captures = [];
const capturedBubbles = new WeakSet();
const hydratedFrames = new WeakSet();

function sessionToken() {
  if (state.session?.token) return state.session.token;
  try {
    return JSON.parse(localStorage.getItem(config.sessionStorageKey) || "null")
      ?.token;
  } catch {
    return null;
  }
}

function cleanupExpired() {
  const now = Date.now();
  for (let index = captures.length - 1; index >= 0; index -= 1) {
    const capture = captures[index];
    if (capture.assigned || now - capture.createdAt > CAPTURE_TTL_MS) {
      if (!capture.released) URL.revokeObjectURL(capture.url);
      capture.released = true;
      captures.splice(index, 1);
    }
  }
}

async function captureUploadBubble(bubble) {
  if (capturedBubbles.has(bubble)) return;
  const image = bubble.querySelector(".chat-upload-preview img[src^='blob:']");
  if (!image) return;
  capturedBubbles.add(bubble);

  try {
    const response = await fetch(image.src);
    if (!response.ok) return;
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const name =
      bubble.querySelector(".chat-message-meta span")?.textContent?.trim() ||
      "";
    captures.push({
      url,
      name,
      createdAt: Date.now(),
      assigned: false,
      released: false,
    });
    cleanupExpired();
  } catch (error) {
    console.warn("Failed to preserve optimistic photo preview", error);
  }
}

function findCapture(frame) {
  if (!frame.closest(".chat-bubble.outgoing")) return null;
  const name = frame.dataset.mediaName || "";
  const now = Date.now();
  for (let index = captures.length - 1; index >= 0; index -= 1) {
    const capture = captures[index];
    if (capture.assigned || capture.released) continue;
    if (now - capture.createdAt > CAPTURE_TTL_MS) continue;
    if (name && capture.name && capture.name !== name) continue;
    capture.assigned = true;
    return capture;
  }
  return null;
}

function showLocalPreview(frame, capture) {
  const image = frame.querySelector("img");
  if (!image) return false;
  frame.querySelector(".chat-media-skeleton")?.remove();
  image.src = capture.url;
  image.hidden = false;
  frame.dataset.storageHydrated = "true";
  frame.dataset.storageFailed = "false";
  frame.dataset.storageMediaSrc = capture.url;
  frame.dataset.mediaSrc = capture.url;
  frame.dataset.hydrated = "true";
  frame.dataset.optimisticHandoff = "true";
  frame.classList.add("is-loaded");
  return true;
}

async function getSignedUrl(messageId) {
  const token = sessionToken();
  if (!token) throw new Error("missing_session");
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
  if (!response.ok || !payload?.ok || !payload?.url)
    throw new Error(payload?.error || `download_${response.status}`);
  return payload.url;
}

function preload(url) {
  return new Promise((resolve, reject) => {
    const probe = new Image();
    probe.decoding = "async";
    probe.onload = () => resolve(url);
    probe.onerror = () => reject(new Error("image_load_failed"));
    probe.src = url;
  });
}

function releaseCapture(capture) {
  if (capture.released) return;
  capture.released = true;
  URL.revokeObjectURL(capture.url);
}

async function handoff(frame, capture) {
  const messageId = Number(frame.dataset.chatMediaId || 0);
  if (!messageId) return;

  for (const delay of RETRY_DELAYS) {
    if (delay)
      await new Promise((resolve) => window.setTimeout(resolve, delay));
    if (!frame.isConnected) return;
    try {
      const url = await getSignedUrl(messageId);
      await preload(url);
      if (!frame.isConnected) return;
      const image = frame.querySelector("img");
      if (!image) return;
      image.src = url;
      frame.dataset.storageMediaSrc = url;
      frame.dataset.mediaSrc = url;
      frame.dataset.optimisticHandoff = "done";
      releaseCapture(capture);
      cleanupExpired();
      return;
    } catch (error) {
      console.warn("Photo handoff retry", error);
    }
  }

  // Keep the local image visible. The normal media loader can retry later,
  // but it must not replace a successfully sent photo with an error state.
  frame.dataset.storageHydrated = "true";
  frame.dataset.storageFailed = "false";
}

function adoptServerFrame(frame) {
  if (hydratedFrames.has(frame)) return;
  if (frame.dataset.mediaKind !== "image") return;
  const capture = findCapture(frame);
  if (!capture) return;
  hydratedFrames.add(frame);
  if (!showLocalPreview(frame, capture)) return;
  void handoff(frame, capture);
}

function scan() {
  document
    .querySelectorAll("#chat-layer .chat-upload-bubble")
    .forEach((bubble) => void captureUploadBubble(bubble));
  document
    .querySelectorAll(
      `#chat-layer ${STORAGE_MEDIA_FRAME_SELECTOR}[data-media-kind="image"]`,
    )
    .forEach(adoptServerFrame);
  cleanupExpired();
}

const observer = new MutationObserver(scan);
observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
});

document.addEventListener("aurora-chat-media-complete", scan);
window.addEventListener("pageshow", scan);
window.addEventListener("pagehide", () => {
  captures.forEach(releaseCapture);
  captures.length = 0;
});
scan();
