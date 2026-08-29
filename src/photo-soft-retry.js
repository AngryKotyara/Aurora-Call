const retryState = new WeakMap();
const RETRY_DELAYS = [900, 1600, 2800, 4500];

function setLoading(frame) {
  const label = frame.querySelector(".chat-media-skeleton small");
  if (label && frame.dataset.mediaKind === "image") {
    label.textContent = "Загрузка фото…";
  }
}

function scheduleRetry(frame) {
  if (!(frame instanceof HTMLElement)) return;
  if (frame.dataset.mediaKind !== "image") return;
  if (frame.dataset.storageFailed !== "true") return;

  const state = retryState.get(frame) || { attempt: 0, timer: null };
  if (state.timer) return;
  if (state.attempt >= RETRY_DELAYS.length) return;

  setLoading(frame);
  const delay = RETRY_DELAYS[state.attempt];
  state.attempt += 1;
  state.timer = window.setTimeout(() => {
    state.timer = null;
    if (!frame.isConnected) return;
    if (frame.dataset.storageFailed !== "true") {
      state.attempt = 0;
      return;
    }
    setLoading(frame);
    frame.click();
  }, delay);
  retryState.set(frame, state);
}

function scan() {
  document
    .querySelectorAll(
      '#chat-layer [data-media-kind="image"][data-storage-failed="true"]',
    )
    .forEach(scheduleRetry);

  document
    .querySelectorAll('#chat-layer [data-media-kind="image"].is-loaded')
    .forEach((frame) => retryState.delete(frame));
}

const observer = new MutationObserver(scan);
observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ["data-storage-failed", "class"],
});

document.addEventListener("aurora-chat-media-complete", scan);
window.addEventListener("pageshow", scan);
window.addEventListener("online", scan);
scan();
