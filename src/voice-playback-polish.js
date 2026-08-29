const PLAY_ICON =
  '<svg viewBox="0 0 24 24"><path d="m9 6 9 6-9 6z"/></svg>';
const PAUSE_ICON =
  '<svg viewBox="0 0 24 24"><path d="M9 7v10M15 7v10"/></svg>';

const visualState = new WeakMap();
const activeAudio = new Set();
let raf = 0;

function parts(audio) {
  const bubble = audio.closest(".voice-message");
  if (!bubble) return {};
  const player = bubble.querySelector(".voice-player");
  if (!player) return {};
  return {
    player,
    wave: player.querySelector(".voice-wave"),
    button: player.querySelector(".voice-play, button"),
  };
}

function syncButton(audio, player, button) {
  if (!player || !button || button.disabled) return;
  const playing = !audio.paused && !audio.ended;
  const nextState = playing ? "playing" : "paused";

  player.classList.toggle("is-playing", playing);
  button.classList.toggle("is-playing", playing);
  button.setAttribute("aria-pressed", String(playing));
  button.setAttribute(
    "aria-label",
    playing
      ? "Поставить голосовое сообщение на паузу"
      : "Воспроизвести голосовое сообщение",
  );

  if (button.dataset.voicePlaybackState !== nextState) {
    button.dataset.voicePlaybackState = nextState;
    button.innerHTML = playing ? PAUSE_ICON : PLAY_ICON;
  }
}

function syncWave(audio, force = false, reset = false) {
  const { player, wave, button } = parts(audio);
  if (!player || !wave) return;

  const bars = Array.from(wave.querySelectorAll("i"));
  const duration =
    Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
  const ratio =
    reset || !duration
      ? 0
      : Math.min(1, Math.max(0, audio.currentTime / duration));
  const playing = !audio.paused && !audio.ended;
  const playedCount = Math.min(bars.length, Math.floor(ratio * bars.length));
  const currentIndex =
    playing && bars.length
      ? Math.min(bars.length - 1, Math.floor(ratio * bars.length))
      : -1;

  const previous = visualState.get(audio);
  if (
    force ||
    !previous ||
    previous.playedCount !== playedCount ||
    previous.currentIndex !== currentIndex ||
    previous.playing !== playing
  ) {
    bars.forEach((bar, index) => {
      bar.classList.toggle("voice-bar-played", index < playedCount);
      bar.classList.toggle("voice-bar-current", index === currentIndex);
    });
    wave.classList.toggle("is-playing", playing);
    visualState.set(audio, { playedCount, currentIndex, playing });
  }

  wave.style.setProperty("--voice-progress", `${ratio * 100}%`);
  syncButton(audio, player, button);
}

function tick() {
  raf = 0;
  activeAudio.forEach((audio) => {
    if (!audio.isConnected || audio.paused || audio.ended) {
      activeAudio.delete(audio);
      syncWave(audio, true, audio.ended);
      return;
    }
    syncWave(audio);
  });
  if (activeAudio.size) raf = requestAnimationFrame(tick);
}

function startTracking(audio) {
  activeAudio.add(audio);
  syncWave(audio, true);
  if (!raf) raf = requestAnimationFrame(tick);
}

function stopTracking(audio, reset = false) {
  activeAudio.delete(audio);
  syncWave(audio, true, reset);
}

function isVoiceAudio(target) {
  return (
    target instanceof HTMLAudioElement &&
    target.matches("audio[data-aurora-voice]")
  );
}

document.addEventListener(
  "play",
  (event) => {
    if (!isVoiceAudio(event.target)) return;
    startTracking(event.target);
  },
  true,
);

document.addEventListener(
  "pause",
  (event) => {
    if (!isVoiceAudio(event.target)) return;
    stopTracking(event.target, false);
  },
  true,
);

document.addEventListener(
  "ended",
  (event) => {
    if (!isVoiceAudio(event.target)) return;
    stopTracking(event.target, true);
  },
  true,
);

for (const type of [
  "loadedmetadata",
  "durationchange",
  "seeking",
  "seeked",
  "timeupdate",
]) {
  document.addEventListener(
    type,
    (event) => {
      if (!isVoiceAudio(event.target)) return;
      syncWave(event.target, type !== "timeupdate");
    },
    true,
  );
}

function initialize(root = document) {
  root
    .querySelectorAll?.("audio[data-aurora-voice]")
    .forEach((audio) => syncWave(audio, true));
}

initialize();
new MutationObserver((records) => {
  for (const record of records) {
    for (const node of record.addedNodes) {
      if (!(node instanceof Element)) continue;
      if (node.matches?.("audio[data-aurora-voice]")) syncWave(node, true);
      initialize(node);
    }
  }
}).observe(document.documentElement, { childList: true, subtree: true });
