function iconAudio() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.7 3.8c.5-.5 1.2-.6 1.8-.2l2.1 1.4c.6.4.8 1.1.5 1.8l-1 2.4c-.2.5-.1 1 .2 1.4.8 1.1 1.8 2.1 2.9 2.9.4.3.9.4 1.4.2l2.4-1c.7-.3 1.4-.1 1.8.5l1.4 2.1c.4.6.3 1.3-.2 1.8l-1.7 1.7c-.8.8-2 1.2-3.1.9-3.1-.8-5.9-2.5-8.1-4.8S3 10 2.2 6.9c-.3-1.1.1-2.3.9-3.1L4.8 2.1"/></svg>`;
}

function iconVideo() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="12" height="12" rx="3"/><path d="m15 10 4.2-2.3c.8-.4 1.8.1 1.8 1v6.6c0 .9-1 1.4-1.8 1L15 14"/></svg>`;
}

function polishHomeButtons() {
  const audio = document.getElementById("audio");
  const video = document.getElementById("video");

  if (audio && audio.dataset.premiumCall !== "true") {
    audio.dataset.premiumCall = "true";
    audio.innerHTML = `<span class="home-call-icon">${iconAudio()}</span><span class="home-call-copy"><strong>Аудиозвонок</strong><small>Начать разговор</small></span><span class="home-call-arrow" aria-hidden="true">›</span>`;
  }

  if (video && video.dataset.premiumCall !== "true") {
    video.dataset.premiumCall = "true";
    video.innerHTML = `<span class="home-call-icon">${iconVideo()}</span><span class="home-call-copy"><strong>Видеозвонок</strong><small>Включить камеру</small></span><span class="home-call-arrow" aria-hidden="true">›</span>`;
  }
}

polishHomeButtons();
const root = document.getElementById("root");
if (root) new MutationObserver(polishHomeButtons).observe(root, { childList: true, subtree: true });
