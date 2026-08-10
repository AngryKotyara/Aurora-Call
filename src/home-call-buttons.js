function iconAudio() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.15 3.5 9.4 7.3c.32.54.24 1.23-.2 1.68l-1.45 1.45a14.3 14.3 0 0 0 5.82 5.82l1.45-1.45c.45-.44 1.14-.52 1.68-.2l3.8 2.25c.58.34.82 1.05.57 1.67l-.72 1.8c-.27.68-.9 1.14-1.62 1.18C10.15 22 2 13.85 2.5 5.27c.04-.72.5-1.35 1.18-1.62l1.8-.72c.62-.25 1.33-.01 1.67.57Z"/></svg>`;
}

function iconVideo() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.75" y="5.5" width="13.25" height="13" rx="3.25"/><path d="M16 9.25 20.1 7.1c.77-.4 1.65.16 1.65 1.03v7.74c0 .87-.88 1.43-1.65 1.03L16 14.75Z"/></svg>`;
}

function polishHomeButtons() {
  const audio = document.getElementById("audio");
  const video = document.getElementById("video");

  if (audio && audio.dataset.premiumCall !== "modern2") {
    audio.dataset.premiumCall = "modern2";
    audio.innerHTML = `<span class="home-call-icon">${iconAudio()}</span><span class="home-call-copy"><strong>Аудиозвонок</strong><small>Начать разговор</small></span><span class="home-call-arrow" aria-hidden="true">›</span>`;
  }

  if (video && video.dataset.premiumCall !== "modern2") {
    video.dataset.premiumCall = "modern2";
    video.innerHTML = `<span class="home-call-icon">${iconVideo()}</span><span class="home-call-copy"><strong>Видеозвонок</strong><small>Включить камеру</small></span><span class="home-call-arrow" aria-hidden="true">›</span>`;
  }
}

polishHomeButtons();
const root = document.getElementById("root");
if (root) new MutationObserver(polishHomeButtons).observe(root, { childList: true, subtree: true });
