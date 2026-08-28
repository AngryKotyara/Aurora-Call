import { rpc } from "./api.js";
import { state } from "./state.js";
import { showToast } from "./utils.js";

const voiceUrls = new Map();
let activePeer = null;
let recorder = null;
let recordingStream = null;
let chunks = [];
let startedAt = 0;
let timerId = null;
let startX = 0;
let startY = 0;
let cancelled = false;
let locked = false;
let stopping = false;
let pointerHeld = false;
let pendingRelease = false;

function svgMic() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="3" width="8" height="12" rx="4"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/></svg>`;
}
function svgPlay() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 6 9 6-9 6z"/></svg>`;
}
function svgPause() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7v10M15 7v10"/></svg>`;
}
function svgTrash() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5M14 11v5"/></svg>`;
}
function svgSend() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 11 17-8-7.5 18-2-7.5zM10.5 13.5 20 3"/></svg>`;
}
function svgLock() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="10" width="12" height="10" rx="2"/><path d="M9 10V7a3 3 0 0 1 6 0v3"/></svg>`;
}
function svgCheck() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.2 4.2L19 7"/></svg>`;
}

function formatDuration(seconds) {
  const value = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

function inferPeer() {
  if (activePeer?.id) return activePeer;
  const name = document
    .querySelector("#chat-layer .chat-peer b")
    ?.textContent?.trim();
  if (!name) return null;
  const friend = (state.friends || []).find(
    (item) => item.username === name || item.name === name,
  );
  if (friend)
    activePeer = { id: friend.id, name: friend.username || friend.name };
  return activePeer;
}

function capturePeer(event) {
  const messageButton = event.target.closest?.("[data-message-friend]");
  if (messageButton)
    activePeer = {
      id: messageButton.dataset.messageFriend,
      name: messageButton.title?.replace(/^Написать\s+/, "") || "",
    };
  const thread = event.target.closest?.("[data-chat-friend]");
  if (thread)
    activePeer = {
      id: thread.dataset.chatFriend,
      name: thread.dataset.chatName || "",
    };
}
document.addEventListener("click", capturePeer, true);

function preferredMime() {
  const options = [
    "audio/mp4",
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
  ];
  return (
    options.find((type) => window.MediaRecorder?.isTypeSupported?.(type)) || ""
  );
}

function showRecordingUI() {
  const composer = document.querySelector("#chat-layer .chat-composer");
  if (!composer) return;
  document.querySelector(".voice-record-strip")?.remove();
  composer.classList.add("voice-recording");
  composer.insertAdjacentHTML(
    "beforebegin",
    `<div class="voice-record-strip"><span class="voice-record-dot"></span><b data-voice-time>0:00</b><span class="voice-slide-hint">‹ Сдвиньте для отмены</span><span class="voice-lock-hint">${svgLock()} вверх — зафиксировать</span></div>`,
  );
  updateTimer();
  timerId = window.setInterval(updateTimer, 250);
}
function updateTimer() {
  const node = document.querySelector("[data-voice-time]");
  if (node) node.textContent = formatDuration((Date.now() - startedAt) / 1000);
}
function clearRecordingUI() {
  if (timerId) clearInterval(timerId);
  timerId = null;
  document.querySelector(".voice-record-strip")?.remove();
  const composer = document.querySelector("#chat-layer .chat-composer");
  composer?.classList.remove("voice-recording", "voice-locked");
  composer?.querySelector(".voice-lock-controls")?.remove();
}
function showFinishAnimation(discarded = false) {
  const composer = document.querySelector("#chat-layer .chat-composer");
  if (!composer) return;
  document.querySelector(".voice-finish-flash")?.remove();
  composer.insertAdjacentHTML(
    "beforebegin",
    `<div class="voice-finish-flash ${discarded ? "discarded" : "sent"}"><span>${discarded ? svgTrash() : svgCheck()}</span><b>${discarded ? "Запись отменена" : "Запись завершена"}</b></div>`,
  );
  window.setTimeout(
    () => document.querySelector(".voice-finish-flash")?.remove(),
    650,
  );
}

function showLockedControls() {
  const composer = document.querySelector("#chat-layer .chat-composer");
  if (!composer || composer.querySelector(".voice-lock-controls")) return;
  composer.classList.add("voice-locked");
  composer.insertAdjacentHTML(
    "beforeend",
    `<div class="voice-lock-controls"><button type="button" data-voice-discard aria-label="Удалить запись">${svgTrash()}</button><button type="button" data-voice-send aria-label="Отправить голосовое">${svgSend()}</button></div>`,
  );
  composer.querySelector("[data-voice-discard]").onclick = () =>
    stopRecording(true);
  composer.querySelector("[data-voice-send]").onclick = () =>
    stopRecording(false);
  const hint = document.querySelector(".voice-slide-hint");
  if (hint) hint.textContent = "Запись зафиксирована";
  document.querySelector(".voice-lock-hint")?.remove();
}

async function beginRecording(event) {
  if (recorder || stopping) return;
  const peer = inferPeer();
  if (!peer?.id) return showToast("Не удалось определить собеседника");
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
    return showToast("Запись голоса не поддерживается браузером");
  try {
    const requestedAt = performance.now();
    recordingStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    if (!pointerHeld && pendingRelease) {
      cleanupStream();
      pendingRelease = false;
      return;
    }
    const mimeType = preferredMime();
    recorder = mimeType
      ? new MediaRecorder(recordingStream, {
          mimeType,
          audioBitsPerSecond: 64000,
        })
      : new MediaRecorder(recordingStream);
    chunks = [];
    cancelled = false;
    locked = false;
    startX = event.clientX || 0;
    startY = event.clientY || 0;
    startedAt = Date.now();
    recorder.ondataavailable = (e) => {
      if (e.data?.size) chunks.push(e.data);
    };
    recorder.onstop = () => void finalizeRecording();
    recorder.start(180);
    navigator.vibrate?.(12);
    showRecordingUI();
    if (
      !pointerHeld ||
      pendingRelease ||
      (performance.now() - requestedAt > 1200 && !pointerHeld)
    ) {
      pendingRelease = false;
      window.setTimeout(() => stopRecording(false), 80);
    }
  } catch (error) {
    console.error("Voice recording failed", error);
    showToast("Не удалось получить доступ к микрофону");
    cleanupStream();
    pointerHeld = false;
    pendingRelease = false;
  }
}

function cleanupStream() {
  recordingStream?.getTracks?.().forEach((track) => track.stop());
  recordingStream = null;
}
function trackGesture(event) {
  if (!recorder || locked) return;
  const dx = (event.clientX || 0) - startX;
  const dy = (event.clientY || 0) - startY;
  const strip = document.querySelector(".voice-record-strip");
  if (strip) strip.style.setProperty("--drag-x", `${Math.min(0, dx)}px`);
  if (dx < -85) {
    cancelled = true;
    pointerHeld = false;
    stopRecording(true);
  } else if (dy < -75) {
    locked = true;
    navigator.vibrate?.(16);
    showLockedControls();
  }
}
function stopRecording(discard = false) {
  if (!recorder || recorder.state === "inactive" || stopping) return;
  stopping = true;
  cancelled = cancelled || discard;
  try {
    recorder.requestData?.();
  } catch {}
  try {
    recorder.stop();
  } catch (error) {
    stopping = false;
    console.warn("Voice stop failed", error);
  }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "");
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
function waveBars(seed) {
  let hash = 0;
  for (const char of String(seed))
    hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  return Array.from(
    { length: 34 },
    (_, i) =>
      `<i style="--h:${(5 + Math.abs(Math.sin((hash + i * 19) * 0.17)) * 21).toFixed(1)}px"></i>`,
  ).join("");
}
function optimisticVoice(duration) {
  const messages = document.querySelector("#chat-layer .chat-messages");
  if (!messages) return null;
  messages.querySelector(".chat-empty-conversation")?.remove();
  const bubble = document.createElement("article");
  bubble.className =
    "chat-bubble outgoing voice-message voice-finishing is-sending";
  bubble.innerHTML = `<div class="voice-player"><button type="button" class="voice-play" disabled>${svgPlay()}</button><div class="voice-wave">${waveBars("sending")}</div><span class="voice-duration">${formatDuration(duration)}</span></div><div class="chat-message-meta"><span>Отправка…</span></div>`;
  messages.append(bubble);
  messages.scrollTop = messages.scrollHeight;
  requestAnimationFrame(() => bubble.classList.add("voice-enter"));
  return bubble;
}

async function finalizeRecording() {
  const localRecorder = recorder;
  const duration = Math.max(0.1, (Date.now() - startedAt) / 1000);
  recorder = null;
  cleanupStream();
  clearRecordingUI();
  stopping = false;
  pointerHeld = false;
  pendingRelease = false;
  const wasCancelled = cancelled;
  if (wasCancelled || duration < 0.35 || !chunks.length) {
    chunks = [];
    showFinishAnimation(true);
    navigator.vibrate?.(8);
    return;
  }
  showFinishAnimation(false);
  const mime = localRecorder?.mimeType || chunks[0]?.type || "audio/webm";
  const blob = new Blob(chunks, { type: mime });
  chunks = [];
  const optimistic = optimisticVoice(duration);
  try {
    const peer = inferPeer();
    if (!peer?.id) throw new Error("peer_not_found");
    const base64 = await blobToBase64(blob);
    const extension = mime.includes("mp4")
      ? "m4a"
      : mime.includes("ogg")
        ? "ogg"
        : "webm";
    await rpc("upload_chat_media", {
      p_token: state.session.token,
      p_to: peer.id,
      p_kind: "audio",
      p_body: String(Math.round(duration * 1000)),
      p_media_mime: mime,
      p_media_name: `voice-${Date.now()}.${extension}`,
      p_media_base64: base64,
    });
    optimistic?.classList.remove("is-sending", "voice-finishing");
    optimistic?.classList.add("voice-sent");
    const meta = optimistic?.querySelector(".chat-message-meta");
    if (meta) meta.textContent = "Отправлено ✓✓";
    navigator.vibrate?.(10);
  } catch (error) {
    console.error("Voice message send failed", error);
    optimistic?.classList.remove("voice-finishing");
    optimistic?.classList.add("is-failed");
    const meta = optimistic?.querySelector(".chat-message-meta");
    if (meta) meta.textContent = "Ошибка отправки";
    showToast("Не удалось отправить голосовое сообщение");
  }
}

async function resolveVoice(messageId) {
  if (voiceUrls.has(messageId)) return voiceUrls.get(messageId);
  const result = await rpc("get_chat_media_secure", {
    p_token: state.session.token,
    p_message_id: Number(messageId),
  });
  const row = Array.isArray(result) ? result[0] : result;
  if (!row?.media_base64) throw new Error("voice_not_found");
  const binary = atob(row.media_base64),
    bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const url = URL.createObjectURL(
    new Blob([bytes], { type: row.media_mime || "audio/webm" }),
  );
  voiceUrls.set(messageId, url);
  return url;
}
async function hydrateVoiceBubble(bubble) {
  if (bubble.dataset.voiceReady) return;
  bubble.dataset.voiceReady = "loading";
  const messageId = bubble.dataset.messageId,
    durationMs = Number(bubble.dataset.voiceDuration || 0),
    meta = bubble.querySelector(".chat-message-meta");
  const player = document.createElement("div");
  player.className = "voice-player";
  player.innerHTML = `<button type="button" class="voice-play" aria-label="Воспроизвести">${svgPlay()}</button><div class="voice-wave" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">${waveBars(messageId)}</div><span class="voice-duration">${durationMs ? formatDuration(durationMs / 1000) : "0:00"}</span>`;
  bubble.insertBefore(player, meta || bubble.firstChild);
  try {
    const src = await resolveVoice(messageId),
      audio = new Audio(src);
    audio.preload = "metadata";
    const button = player.querySelector(".voice-play"),
      wave = player.querySelector(".voice-wave"),
      durationLabel = player.querySelector(".voice-duration");
    audio.onloadedmetadata = () => {
      if (!durationMs && Number.isFinite(audio.duration))
        durationLabel.textContent = formatDuration(audio.duration);
    };
    audio.ontimeupdate = () => {
      const percent = audio.duration
        ? Math.min(100, (audio.currentTime / audio.duration) * 100)
        : 0;
      wave.style.setProperty("--voice-progress", `${percent}%`);
      wave.setAttribute("aria-valuenow", String(Math.round(percent)));
      durationLabel.textContent = formatDuration(
        audio.currentTime || audio.duration || durationMs / 1000,
      );
    };
    audio.onended = () => {
      button.innerHTML = svgPlay();
      wave.style.setProperty("--voice-progress", "0%");
      durationLabel.textContent = formatDuration(
        audio.duration || durationMs / 1000,
      );
    };
    button.onclick = async () => {
      document.querySelectorAll("audio[data-aurora-voice]").forEach((other) => {
        if (other !== audio) other.pause();
      });
      if (audio.paused) {
        await audio.play();
        button.innerHTML = svgPause();
      } else {
        audio.pause();
        button.innerHTML = svgPlay();
      }
    };
    audio.dataset.auroraVoice = messageId;
    bubble.append(audio);
    audio.hidden = true;
    bubble.dataset.voiceReady = "true";
  } catch (error) {
    console.error("Voice hydrate failed", error);
    bubble.dataset.voiceReady = "error";
    player.classList.add("voice-error");
  }
}
function decorateVoiceBubbles() {
  document
    .querySelectorAll('#chat-layer .chat-bubble[data-message-kind="audio"]')
    .forEach((bubble) => {
      if (!bubble.dataset.voiceDuration) {
        const body = bubble.querySelector(".chat-message-text");
        if (body && /^\d+$/.test(body.textContent.trim())) {
          bubble.dataset.voiceDuration = body.textContent.trim();
          body.remove();
        }
      }
      bubble.classList.add("voice-message");
      void hydrateVoiceBubble(bubble);
    });
}
function installComposer() {
  const composer = document.querySelector("#chat-layer .chat-composer");
  if (!composer || composer.dataset.voiceInstalled === "true") return;
  composer.dataset.voiceInstalled = "true";
  const send = composer.querySelector(".chat-send"),
    input = composer.querySelector(".chat-input");
  if (!send || !input) return;
  const mic = document.createElement("button");
  mic.type = "button";
  mic.className = "chat-voice-record";
  mic.setAttribute("aria-label", "Удерживайте для записи голосового сообщения");
  mic.innerHTML = svgMic();
  send.insertAdjacentElement("afterend", mic);
  const sync = () => {
    const hasText = Boolean(input.value.trim());
    mic.hidden = hasText;
    send.hidden = !hasText;
  };
  input.addEventListener("input", sync);
  sync();
  mic.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    pointerHeld = true;
    pendingRelease = false;
    mic.setPointerCapture?.(event.pointerId);
    void beginRecording(event);
  });
  mic.addEventListener("pointermove", trackGesture);
  mic.addEventListener("pointerup", () => {
    pointerHeld = false;
    if (recorder && !locked) stopRecording(false);
    else if (!recorder) pendingRelease = true;
  });
  mic.addEventListener("pointercancel", () => {
    pointerHeld = false;
    if (recorder && !locked) stopRecording(true);
    else pendingRelease = true;
  });
  mic.addEventListener("lostpointercapture", () => {
    if (pointerHeld) return;
    if (recorder && !locked && !stopping) stopRecording(false);
  });
  mic.addEventListener("contextmenu", (event) => event.preventDefault());
}
function refresh() {
  installComposer();
  decorateVoiceBubbles();
}
const observer = new MutationObserver(refresh);
observer.observe(document.documentElement, { childList: true, subtree: true });
refresh();
