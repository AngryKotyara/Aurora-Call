import { rpc } from "./api.js";
import { config } from "./config.js";
import {
  createIOSScreenStream,
  isIOSNativeScreenShareAvailable,
  isIOSScreenStream,
  stopIOSScreenShare,
} from "./ios-screen-share.js";
import { showIncomingCall } from "./incoming-call.js";
import { clearMediaPermissionRecord } from "./media-permissions.js";
import { state } from "./state.js";
import {
  removeCallModal,
  renderCallModal,
  setRemoteScreenShareActive,
  setScreenShareActive,
} from "./ui.js";
import { query, showToast } from "./utils.js";

let removeScreenEndedListener = () => {};

function detachScreenStream() {
  const stream = state.screenStream;
  state.screenStream = null;
  removeScreenEndedListener();
  removeScreenEndedListener = () => {};
  return stream;
}

function sendScreenShareState(active) {
  if (!state.session || !state.selectedFriend || !state.callId) return Promise.resolve();
  return rpc("send_call_signal", { p_token: state.session.token, p_call_id: state.callId, p_to: state.selectedFriend.id, p_kind: "screen-share", p_payload: { active } }).catch(() => {});
}

async function stopScreenShare({ restoreCamera = true, notifyPeer = true, requestNativeStop = true } = {}) {
  const screenStream = detachScreenStream();
  if (!screenStream) { setScreenShareActive(false); return false; }
  const nativeScreenShare = isIOSScreenStream(screenStream);
  const cameraTrack = state.mediaStream?.getVideoTracks()[0] || null;
  if (restoreCamera && state.videoSender && cameraTrack) {
    try { await state.videoSender.replaceTrack(cameraTrack); } catch { showToast("Не удалось вернуть изображение с камеры"); }
  }
  if (nativeScreenShare && requestNativeStop) stopIOSScreenShare();
  screenStream.getTracks().forEach((track) => track.stop());
  setScreenShareActive(false);
  if (notifyPeer) void sendScreenShareState(false);
  return false;
}

function watchScreenTrack(track) {
  const handleEnded = () => void stopScreenShare();
  if (track.addEventListener) {
    track.addEventListener("ended", handleEnded, { once: true });
    removeScreenEndedListener = () => track.removeEventListener("ended", handleEnded);
    return;
  }
  track.onended = handleEnded;
  removeScreenEndedListener = () => { if (track.onended === handleEnded) track.onended = null; };
}

window.addEventListener("aurora-native-screen-share-ended", (event) => {
  if (state.screenStream && event.detail?.stream === state.screenStream) void stopScreenShare({ requestNativeStop: false });
});

function playEndHaptic() {
  try {
    navigator.vibrate?.([45, 35, 80]);
    window.webkit?.messageHandlers?.auroraHaptics?.postMessage?.({ type: "call-ended" });
  } catch {}
}

function stopLocalCall({ animated = false } = {}) {
  void stopScreenShare({ restoreCamera: false, notifyPeer: false });
  state.mediaStream?.getTracks().forEach((track) => track.stop());
  state.peerConnection?.close();
  state.peerConnection = null;
  state.mediaStream = null;
  state.videoSender = null;
  state.callId = null;
  setRemoteScreenShareActive(false);
  if (animated) {
    const modal = query("#call-modal");
    if (modal) {
      modal.classList.add("call-ending");
      const status = query("#call-status");
      if (status) status.textContent = "Звонок завершён";
      playEndHaptic();
      window.setTimeout(() => removeCallModal(), 420);
      return;
    }
  }
  removeCallModal();
}

function toggleTracks(kind) {
  const tracks = kind === "audio" ? state.mediaStream?.getAudioTracks() : state.mediaStream?.getVideoTracks();
  if (!tracks?.length) return false;
  const enabled = !tracks.some((track) => track.enabled);
  tracks.forEach((track) => { track.enabled = enabled; });
  return enabled;
}

function updateCallStatus(message, connectionState) {
  const status = query("#call-status");
  const callScreen = query("#call-modal");
  if (status) status.textContent = message;
  if (callScreen && connectionState) callScreen.dataset.connection = connectionState;
}

function recordCallStatus(callId, friend, mode, status) {
  if (!callId || !friend) return Promise.resolve();
  return rpc("record_call_event", { p_token: state.session.token, p_call_id: callId, p_peer: friend.id, p_mode: mode, p_status: status }).catch(() => {});
}

export async function toggleScreenShare() {
  if (state.screenStream) return stopScreenShare();
  const callId = state.callId;
  const videoSender = state.videoSender;
  const getDisplayMedia = navigator.mediaDevices?.getDisplayMedia?.bind(navigator.mediaDevices) || navigator.getDisplayMedia?.bind(navigator) || null;
  if (state.callMode !== "video" || !state.peerConnection || !videoSender?.replaceTrack) {
    showToast("Демонстрация доступна только во время видеозвонка"); return false;
  }
  let screenStream;
  try {
    if (isIOSNativeScreenShareAvailable()) screenStream = await createIOSScreenStream();
    else if (getDisplayMedia) screenStream = await getDisplayMedia({ video: true, audio: false });
    else { showToast("Этот браузер не поддерживает демонстрацию всего экрана"); return false; }
  } catch (error) {
    showToast(error?.name === "NotAllowedError" || error?.name === "AbortError" ? "Демонстрация экрана не начата" : "Не удалось включить демонстрацию экрана"); return false;
  }
  const screenTrack = screenStream.getVideoTracks()[0];
  if (!screenTrack || !state.peerConnection || state.callId !== callId || state.videoSender !== videoSender) {
    if (isIOSScreenStream(screenStream)) stopIOSScreenShare();
    screenStream.getTracks().forEach((track) => track.stop());
    showToast("Не удалось получить изображение экрана"); return false;
  }
  try { screenTrack.contentHint = "detail"; await videoSender.replaceTrack(screenTrack); }
  catch { if (isIOSScreenStream(screenStream)) stopIOSScreenShare(); screenStream.getTracks().forEach((track) => track.stop()); showToast("Не удалось передать изображение экрана"); return false; }
  state.screenStream = screenStream;
  watchScreenTrack(screenTrack);
  setScreenShareActive(true);
  void sendScreenShareState(true);
  return true;
}

export async function endCall({ notifyPeer = true } = {}) {
  const friend = state.selectedFriend;
  const callId = state.callId;
  const mode = state.callMode;
  stopLocalCall({ animated: true });
  const requests = [recordCallStatus(callId, friend, mode, "completed")];
  if (notifyPeer && friend && callId) requests.push(rpc("send_call_signal", { p_token: state.session.token, p_call_id: callId, p_to: friend.id, p_kind: "hangup", p_payload: {} }).catch(() => {}));
  await Promise.all(requests);
}

export async function startCall(mode, incoming = false, offer = null) {
  if (!state.selectedFriend) {
    if (!state.friends.length) { showToast("Сначала добавьте друга"); return; }
    const firstFriend = state.friends[0];
    state.selectedFriend = { id: firstFriend.id, name: firstFriend.username };
  }
  state.callMode = mode;
  state.callId = offer?.callId || crypto.randomUUID();
  try {
    state.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: mode === "video" });
  } catch (error) {
    state.callId = null;
    if (error?.name === "NotAllowedError" || error?.name === "SecurityError") { clearMediaPermissionRecord(state.session); showToast("Разрешите доступ к микрофону и камере в настройках"); }
    else if (error?.name === "NotFoundError") showToast("Камера или микрофон не найдены");
    else showToast("Не удалось подключить камеру и микрофон");
    return;
  }
  try {
    state.peerConnection = new RTCPeerConnection({ iceServers: config.iceServers });
    state.videoSender = null;
    state.mediaStream.getTracks().forEach((track) => { const sender = state.peerConnection.addTrack(track, state.mediaStream); if (track.kind === "video") state.videoSender = sender; });
    renderCallModal({ friendName: state.selectedFriend.name, mode, onToggleMic: () => toggleTracks("audio"), onToggleCamera: () => toggleTracks("video"), onToggleScreenShare: toggleScreenShare, canShareScreen: mode === "video", onHangup: () => void endCall() });
    query("#local-video").srcObject = state.mediaStream;
    if (incoming) setRemoteScreenShareActive(Boolean(offer?.payload?.screenSharing));
    state.peerConnection.ontrack = (event) => { query("#remote-video").srcObject = event.streams[0]; updateCallStatus("На связи", "connected"); };
    state.peerConnection.onconnectionstatechange = () => {
      const connectionState = state.peerConnection?.connectionState;
      const statuses = { connected: "На связи", connecting: "Соединение…", disconnected: "Связь прервана", failed: "Не удалось подключиться" };
      if (statuses[connectionState]) updateCallStatus(statuses[connectionState], connectionState);
    };
    state.peerConnection.onicecandidate = (event) => { if (event.candidate) void rpc("send_call_signal", { p_token: state.session.token, p_call_id: state.callId, p_to: state.selectedFriend.id, p_kind: "ice", p_payload: event.candidate }).catch(() => {}); };
    if (incoming) {
      await state.peerConnection.setRemoteDescription(offer.payload);
      const answer = await state.peerConnection.createAnswer();
      await state.peerConnection.setLocalDescription(answer);
      await rpc("send_call_signal", { p_token: state.session.token, p_call_id: state.callId, p_to: state.selectedFriend.id, p_kind: "answer", p_payload: answer });
    } else {
      const outgoingOffer = await state.peerConnection.createOffer();
      await state.peerConnection.setLocalDescription(outgoingOffer);
      await rpc("send_call_signal", { p_token: state.session.token, p_call_id: state.callId, p_to: state.selectedFriend.id, p_kind: "offer", p_payload: { ...outgoingOffer, mode, screenSharing: Boolean(state.screenStream) } });
    }
    void recordCallStatus(state.callId, state.selectedFriend, mode, incoming ? "answered" : "started");
  } catch (error) { stopLocalCall(); showToast(error.message); }
}

async function handleSignal(signal) {
  if (signal.kind === "offer" && !state.peerConnection) {
    state.selectedFriend = { id: signal.from_user, name: signal.from_username };
    const accepted = await showIncomingCall({ name: signal.from_username, mode: signal.payload.mode || "audio" });
    if (accepted) {
      await startCall(signal.payload.mode || "audio", true, { callId: signal.call_id, payload: signal.payload });
    } else {
      await rpc("send_call_signal", { p_token: state.session.token, p_call_id: signal.call_id, p_to: signal.from_user, p_kind: "decline", p_payload: {} });
    }
  } else if (signal.kind === "answer" && state.peerConnection) {
    await state.peerConnection.setRemoteDescription(signal.payload);
  } else if (signal.kind === "ice" && state.peerConnection) {
    await state.peerConnection.addIceCandidate(signal.payload).catch(() => {});
  } else if (signal.kind === "screen-share" && state.peerConnection) {
    setRemoteScreenShareActive(Boolean(signal.payload?.active));
  } else if (signal.kind === "hangup" || signal.kind === "decline") {
    await recordCallStatus(state.callId || signal.call_id, state.selectedFriend, state.callMode, signal.kind === "decline" ? "declined" : "completed");
    showToast(signal.kind === "decline" ? "Звонок отклонён" : "Звонок завершён");
    stopLocalCall({ animated: true });
  }
}

async function pollSignals() {
  if (state.session) {
    try {
      const signals = await rpc("poll_call_signals", { p_token: state.session.token, p_after: state.lastSignalId });
      for (const signal of signals) { state.lastSignalId = Math.max(state.lastSignalId, signal.id); await handleSignal(signal); }
    } catch {}
  }
  window.setTimeout(pollSignals, config.signalPollIntervalMs);
}

export function startSignalPolling() { void pollSignals(); }
