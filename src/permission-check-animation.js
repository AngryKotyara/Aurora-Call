import { showToast } from "./utils.js";

const ROOT_SELECTOR = ".media-access";
const ICON_SELECTOR = ".media-access-icon";
const ACTIVE_CLASS = "permission-check-animated";
const MEDIA_APP_DISABLED_KEY = "aurora_media_app_disabled_v1";
let bypassNextMediaRequest = false;

function mediaAppDisabled() {
  try { return localStorage.getItem(MEDIA_APP_DISABLED_KEY) === "1"; }
  catch { return false; }
}

function setMediaAppDisabled(disabled) {
  try {
    if (disabled) localStorage.setItem(MEDIA_APP_DISABLED_KEY, "1");
    else localStorage.removeItem(MEDIA_APP_DISABLED_KEY);
  } catch {}
}

function installMediaGate() {
  const mediaDevices = navigator.mediaDevices;
  if (!mediaDevices?.getUserMedia || mediaDevices.getUserMedia.__auroraWrapped) return;

  const original = mediaDevices.getUserMedia.bind(mediaDevices);
  const wrapped = async (...args) => {
    if (mediaAppDisabled() && !bypassNextMediaRequest) {
      throw new DOMException("Media access is disabled in Aurora Call settings", "NotAllowedError");
    }
    bypassNextMediaRequest = false;
    return original(...args);
  };
  wrapped.__auroraWrapped = true;

  try { mediaDevices.getUserMedia = wrapped; }
  catch {
    try {
      Object.defineProperty(mediaDevices, "getUserMedia", { configurable: true, value: wrapped });
    } catch {}
  }
}

function isPushCard(card) {
  return card.hasAttribute("data-push-settings");
}

function isMediaCard(card) {
  return !isPushCard(card) && card.hasAttribute("data-media-status");
}

function isEnabledCard(card) {
  if (isMediaCard(card) && mediaAppDisabled()) return false;
  if (card.dataset.mediaStatus === "granted") return true;
  if (isPushCard(card)) {
    const title = card.querySelector(".media-access-copy h2")?.textContent || "";
    return title.includes("включены");
  }
  return card.classList.contains("granted");
}

function applyManualMediaState(card) {
  if (!isMediaCard(card)) return;
  const button = card.querySelector("[data-request-media]");
  const icon = card.querySelector(ICON_SELECTOR);
  const title = card.querySelector(".media-access-copy h2");
  const text = card.querySelector(".media-access-copy p");

  if (mediaAppDisabled()) {
    card.classList.remove("granted");
    card.dataset.permissionAnimationReady = "0";
    icon?.classList.remove(ACTIVE_CLASS);
    if (icon) icon.textContent = "";
    if (title) title.textContent = "Камера и микрофон выключены";
    if (text) text.textContent = "Aurora Call не будет использовать камеру и микрофон, пока вы снова не включите доступ.";
    if (button) {
      button.disabled = false;
      button.classList.remove("permission-granted");
      button.textContent = "Включить доступ";
    }
    return;
  }

  if (card.dataset.mediaStatus === "granted" && button) {
    button.disabled = false;
    button.classList.remove("permission-granted");
    button.textContent = "Отключить доступ";
  }
}

function animateCheck(card) {
  applyManualMediaState(card);
  if (!isEnabledCard(card) || card.dataset.permissionAnimationReady === "1") return;
  const icon = card.querySelector(ICON_SELECTOR);
  if (!icon) return;

  card.dataset.permissionAnimationReady = "1";
  icon.classList.remove(ACTIVE_CLASS);
  void icon.offsetWidth;
  icon.classList.add(ACTIVE_CLASS);
}

function scan(root = document) {
  root.querySelectorAll?.(ROOT_SELECTOR).forEach(animateCheck);
}

function handleMediaToggle(event) {
  const button = event.target.closest?.("[data-request-media]");
  if (!button) return;
  const card = button.closest(ROOT_SELECTOR);
  if (!card || !isMediaCard(card)) return;

  if (!mediaAppDisabled() && card.dataset.mediaStatus === "granted") {
    event.preventDefault();
    event.stopImmediatePropagation();
    setMediaAppDisabled(true);
    applyManualMediaState(card);
    showToast("Камера и микрофон отключены в Aurora Call", true);
    return;
  }

  if (mediaAppDisabled()) {
    setMediaAppDisabled(false);
    bypassNextMediaRequest = true;
    card.dataset.permissionAnimationReady = "0";
  }
}

const observer = new MutationObserver((records) => {
  for (const record of records) {
    if (record.type === "childList") {
      record.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) return;
        if (node.matches?.(ROOT_SELECTOR)) animateCheck(node);
        scan(node);
      });
    }
    if (record.type === "attributes" && record.target instanceof Element && record.target.matches(ROOT_SELECTOR)) {
      if (!isEnabledCard(record.target)) record.target.dataset.permissionAnimationReady = "0";
      animateCheck(record.target);
    }
  }
});

function init() {
  installMediaGate();
  scan();
  document.addEventListener("click", handleMediaToggle, true);
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "data-media-status"] });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
else init();
