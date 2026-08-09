import { query } from "./utils.js";

let callModalCleanup = () => {};

function callControlIcon(kind) {
  if (kind === "microphone")
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8.5" y="3" width="7" height="11" rx="3.5"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M8.5 21h7"/><path class="control-slash" d="m4 4 16 16"/></svg>`;
  if (kind === "screen")
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="13" rx="2.5"/><path d="M8.5 21h7M12 17v4M9 10l3-3 3 3M12 7v7"/></svg>`;
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6.5" width="13" height="11" rx="3"/><path d="m16 10 4-2.25v8.5L16 14"/><path class="control-slash" d="m4 4 16 16"/></svg>`;
}

function endCallIcon() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.2 16.4c3.7-3.1 9.9-3.1 13.6 0"/><path d="m4.2 15.2 2.2 3.1M19.8 15.2l-2.2 3.1"/></svg>`;
}

function setMediaControlState(button, enabled, device) {
  const action = enabled ? "Выключить" : "Включить";
  const deviceName = device === "camera" ? "камеру" : "микрофон";
  const label = `${action} ${deviceName}`;
  button.dataset.enabled = String(enabled);
  button.classList.toggle("is-off", !enabled);
  button.setAttribute("aria-pressed", String(!enabled));
  button.setAttribute("aria-label", label);
  button.setAttribute("title", label);
}

function refreshScreenShareStatus() {
  const callScreen = query("#call-modal");
  const status = query("#screen-share-status");
  const statusText = query("#screen-share-status-text");
  if (!callScreen || !status || !statusText) return;
  const isLocal = callScreen.dataset.localScreenSharing === "true";
  const isRemote = callScreen.dataset.remoteScreenSharing === "true";
  status.hidden = !isLocal && !isRemote;
  statusText.textContent = isLocal
    ? isRemote ? "Вы и собеседник показываете экран" : "Вы показываете экран"
    : "Собеседник показывает экран";
}

export function setScreenShareActive(active) {
  const callScreen = query("#call-modal");
  const button = query("#toggle-screen-share");
  if (callScreen) callScreen.dataset.localScreenSharing = String(active);
  if (button) {
    const label = active ? "Остановить демонстрацию экрана" : "Начать демонстрацию экрана";
    button.dataset.active = String(active);
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
    button.setAttribute("aria-label", label);
    button.setAttribute("title", label);
  }
  refreshScreenShareStatus();
}

export function setRemoteScreenShareActive(active) {
  const callScreen = query("#call-modal");
  if (callScreen) callScreen.dataset.remoteScreenSharing = String(active);
  refreshScreenShareStatus();
}

function makePreviewDraggable(preview, boundary) {
  let drag = null;
  const margin = 12;
  const dimensions = () => ({ boundary: boundary.getBoundingClientRect(), preview: preview.getBoundingClientRect() });
  function place(left, top) {
    const rects = dimensions();
    const maxLeft = Math.max(margin, rects.boundary.width - rects.preview.width - margin);
    const maxTop = Math.max(margin, rects.boundary.height - rects.preview.height - margin);
    preview.style.right = "auto";
    preview.style.bottom = "auto";
    preview.style.left = `${Math.min(Math.max(left, margin), maxLeft)}px`;
    preview.style.top = `${Math.min(Math.max(top, margin), maxTop)}px`;
  }
  function materializePosition() {
    const rects = dimensions();
    place(rects.preview.left - rects.boundary.left, rects.preview.top - rects.boundary.top);
  }
  function onPointerDown(event) {
    if (event.button !== undefined && event.button !== 0) return;
    const rects = dimensions();
    drag = { pointerId: event.pointerId, offsetX: event.clientX - rects.preview.left, offsetY: event.clientY - rects.preview.top };
    materializePosition();
    preview.classList.add("is-dragging");
    preview.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }
  function onPointerMove(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const boundaryRect = boundary.getBoundingClientRect();
    place(event.clientX - boundaryRect.left - drag.offsetX, event.clientY - boundaryRect.top - drag.offsetY);
  }
  function endDrag(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    preview.releasePointerCapture?.(event.pointerId);
    preview.classList.remove("is-dragging");
    drag = null;
  }
  function onKeyDown(event) {
    const directions = { ArrowLeft: [-12, 0], ArrowRight: [12, 0], ArrowUp: [0, -12], ArrowDown: [0, 12] };
    const movement = directions[event.key];
    if (!movement) return;
    if (!preview.style.left || !preview.style.top) materializePosition();
    place(Number.parseFloat(preview.style.left) + movement[0], Number.parseFloat(preview.style.top) + movement[1]);
    event.preventDefault();
  }
  function keepInsideScreen() {
    if (preview.style.left && preview.style.top) place(Number.parseFloat(preview.style.left), Number.parseFloat(preview.style.top));
  }
  preview.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", endDrag);
  window.addEventListener("pointercancel", endDrag);
  window.addEventListener("resize", keepInsideScreen);
  preview.addEventListener("keydown", onKeyDown);
  return () => {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", endDrag);
    window.removeEventListener("pointercancel", endDrag);
    window.removeEventListener("resize", keepInsideScreen);
  };
}

export function renderCallModal({ friendName, mode, onToggleMic, onToggleCamera, onToggleScreenShare = async () => false, canShareScreen = true, onHangup }) {
  removeCallModal();
  const isVideo = mode === "video";
  const initial = String(friendName?.[0]?.toUpperCase() || "?").replace(/[&<>"']/g, "");
  document.body.insertAdjacentHTML("beforeend", `<div class="modal call-screen ${isVideo ? "video-call" : "audio-call"}" id="call-modal" role="dialog" aria-modal="true" aria-labelledby="call-peer-name" data-connection="connecting" data-local-screen-sharing="false" data-remote-screen-sharing="false"><div class="call-stage"><video id="remote-video" class="remote-video" autoplay playsinline></video><div class="call-audio-backdrop" aria-hidden="true"><span class="call-audio-avatar">${initial}</span></div></div><div class="call-shade" aria-hidden="true"></div><header class="call-header"><h2 id="call-peer-name">${String(friendName || "")}</h2><p><span class="connection-dot" aria-hidden="true"></span><span id="call-status">Соединение…</span> · ${isVideo ? "видео" : "аудио"}</p></header><div id="screen-share-status" class="screen-share-status" role="status" hidden><span class="screen-share-dot" aria-hidden="true"></span><span id="screen-share-status-text">Вы показываете экран</span></div>${isVideo ? `<div id="local-preview" class="local-preview" role="group" tabindex="0" aria-label="Ваше видео"><video id="local-video" autoplay muted playsinline></video><div class="local-preview-off" aria-hidden="true">${callControlIcon("camera")}<span>Камера выключена</span></div><span class="local-preview-grip" aria-hidden="true"></span></div>` : '<video id="local-video" class="audio-local-video" autoplay muted playsinline></video>'}<div class="controls" aria-label="Управление звонком"><button id="toggle-mic" class="media-control" type="button" data-enabled="true" aria-pressed="false" aria-label="Выключить микрофон"><span class="control-icon">${callControlIcon("microphone")}</span><span class="control-state" aria-hidden="true"></span></button>${isVideo ? `<button id="toggle-camera" class="media-control" type="button" data-enabled="true" aria-pressed="false" aria-label="Выключить камеру"><span class="control-icon">${callControlIcon("camera")}</span><span class="control-state" aria-hidden="true"></span></button><button id="toggle-screen-share" class="screen-share-control" type="button" data-active="false" aria-pressed="false" aria-label="${canShareScreen ? "Начать демонстрацию экрана" : "Демонстрация экрана недоступна"}" ${canShareScreen ? "" : "disabled"}><span class="control-icon">${callControlIcon("screen")}</span><span class="control-state" aria-hidden="true"></span></button>` : ""}<button id="hangup" class="danger hangup-control" type="button" aria-label="Завершить звонок"><span class="control-icon">${endCallIcon()}</span></button></div></div>`);
  document.body.classList.add("call-active");
  const microphoneButton = query("#toggle-mic");
  const cameraButton = query("#toggle-camera");
  const screenShareButton = query("#toggle-screen-share");
  const localPreview = query("#local-preview");
  microphoneButton?.addEventListener("click", () => setMediaControlState(microphoneButton, onToggleMic(), "microphone"));
  cameraButton?.addEventListener("click", () => { const enabled = onToggleCamera(); setMediaControlState(cameraButton, enabled, "camera"); localPreview?.classList.toggle("is-camera-off", !enabled); });
  if (canShareScreen) screenShareButton?.addEventListener("click", async () => {
    if (screenShareButton.dataset.pending === "true") return;
    screenShareButton.dataset.pending = "true";
    screenShareButton.disabled = true;
    try { setScreenShareActive(Boolean(await onToggleScreenShare())); }
    finally { screenShareButton.dataset.pending = "false"; screenShareButton.disabled = false; }
  });
  query("#hangup")?.addEventListener("click", onHangup);
  if (localPreview) callModalCleanup = makePreviewDraggable(localPreview, query("#call-modal"));
}

export function removeCallModal() {
  callModalCleanup();
  callModalCleanup = () => {};
  query("#call-modal")?.remove();
  document.body.classList.remove("call-active");
}
