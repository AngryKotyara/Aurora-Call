let audioContext = null;
let ringInterval = null;
let vibrationInterval = null;
let confirmInstalled = false;
let activeIncomingCallId = null;
let activeIncomingCallPromise = null;
let activeIncomingFinish = null;

function tone(frequency, startsAt, duration, gainValue = 0.055) {
  if (!audioContext) return;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, startsAt);
  gain.gain.exponentialRampToValueAtTime(gainValue, startsAt + 0.025);
  gain.gain.exponentialRampToValueAtTime(0.0001, startsAt + duration);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start(startsAt);
  oscillator.stop(startsAt + duration + 0.03);
}

function playRingPhrase() {
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === "suspended") void audioContext.resume();
    const now = audioContext.currentTime + 0.02;
    tone(659.25, now, 0.28);
    tone(783.99, now + 0.32, 0.28);
    tone(987.77, now + 0.65, 0.38);
    tone(783.99, now + 1.08, 0.24, 0.04);
  } catch {
    // Browser autoplay policy can block sound before the first user gesture.
  }
}

function vibrate() {
  try {
    navigator.vibrate?.([450, 180, 450, 900]);
    window.webkit?.messageHandlers?.auroraHaptics?.postMessage?.({
      type: "incoming-call",
    });
  } catch {
    // Haptics are best-effort across browser and native shells.
  }
}

function startAlerting() {
  stopIncomingCallAlert();
  playRingPhrase();
  vibrate();
  ringInterval = window.setInterval(playRingPhrase, 2200);
  vibrationInterval = window.setInterval(vibrate, 3100);
}

export function stopIncomingCallAlert() {
  if (ringInterval) window.clearInterval(ringInterval);
  if (vibrationInterval) window.clearInterval(vibrationInterval);
  ringInterval = null;
  vibrationInterval = null;
  try {
    navigator.vibrate?.(0);
  } catch {}
}

export function installIncomingCallAlerting() {
  if (confirmInstalled) return;
  confirmInstalled = true;
  const originalConfirm = window.confirm.bind(window);

  window.confirm = (message = "") => {
    const isIncomingCall = /звонит\.\s*Принять\?/i.test(String(message));
    if (!isIncomingCall) return originalConfirm(message);

    startAlerting();
    try {
      return originalConfirm(message);
    } finally {
      stopIncomingCallAlert();
    }
  };
}

export function showIncomingCall(
  call,
  { onAccept = async () => {}, onDecline = async () => {} } = {},
) {
  const { id = null, from_name: fromName, name, mode = "audio" } = call || {};
  const displayName = fromName || name || "Входящий звонок";
  if (activeIncomingCallPromise) return activeIncomingCallPromise;

  activeIncomingCallId = id;
  document.querySelector("#incoming-call-layer")?.remove();
  const initial = String(displayName || "?")
    .slice(0, 1)
    .toUpperCase();
  const layer = document.createElement("div");
  layer.id = "incoming-call-layer";
  layer.className = "incoming-call-layer";
  layer.setAttribute("role", "dialog");
  layer.setAttribute("aria-modal", "true");
  layer.innerHTML = `<div class="incoming-call-card">
    <div class="incoming-call-avatar-wrap" aria-hidden="true"><span class="incoming-call-ring"></span><span class="incoming-call-ring r2"></span><span class="incoming-call-ring r3"></span><span class="incoming-call-avatar"></span></div>
    <h2></h2><p>${mode === "video" ? "Входящий видеозвонок" : "Входящий аудиозвонок"}</p>
    <div class="incoming-call-actions"><button class="incoming-call-action decline" data-incoming-decline aria-label="Отклонить">✕</button><button class="incoming-call-action accept" data-incoming-accept aria-label="Принять">☎</button></div>
    <div class="incoming-call-labels"><span>Отклонить</span><span>Принять</span></div>
  </div>`;
  layer.querySelector(".incoming-call-avatar").textContent = initial;
  layer.dataset.callId = String(id || "");
  layer.querySelector("h2").textContent = String(displayName);
  document.body.append(layer);
  startAlerting();

  activeIncomingCallPromise = new Promise((resolve) => {
    let finishing = false;
    const finish = async (accepted, runAction = true) => {
      if (finishing) return;
      finishing = true;
      stopIncomingCallAlert();
      layer.remove();
      try {
        if (runAction) await (accepted ? onAccept(call) : onDecline(call));
        resolve(accepted);
      } catch (error) {
        console.error("incoming call action failed", error);
        resolve(false);
      } finally {
        if (activeIncomingCallId === id) {
          activeIncomingCallId = null;
          activeIncomingCallPromise = null;
          activeIncomingFinish = null;
        }
      }
    };
    activeIncomingFinish = finish;
    layer
      .querySelector("[data-incoming-accept]")
      .addEventListener("click", () => void finish(true), { once: true });
    layer
      .querySelector("[data-incoming-decline]")
      .addEventListener("click", () => void finish(false), { once: true });
  });
  return activeIncomingCallPromise;
}

export function dismissIncomingCall(callId = null) {
  if (!activeIncomingCallPromise) return false;
  if (callId != null && String(activeIncomingCallId || "") !== String(callId))
    return false;
  void activeIncomingFinish?.(false, false);
  return true;
}
