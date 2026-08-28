import { rpc } from "./api.js";
import { config } from "./config.js";
import {
  createIOSScreenStream,
  isIOSNativeScreenShareAvailable,
  isIOSScreenStream,
  stopIOSScreenShare,
} from "./ios-screen-share.js";
import { dismissIncomingCall, showIncomingCall } from "./incoming-call.js";
import { clearMediaPermissionRecord } from "./media-permissions.js";
import { state } from "./state.js";
import {
  removeCallModal,
  renderCallModal,
  setCallConnectionState,
  setRemoteScreenShareActive,
  setScreenShareActive,
} from "./call-ui.js";
import { query, showToast } from "./utils.js";

let removeScreenEndedListener = () => {};
let signalPollInFlight = false;
let signalPollTimer = null;
const pendingSignals = new Map();
const MAX_PENDING_CALLS = 20;
const MAX_SIGNALS_PER_CALL = 100;

export function getScreenShareSupport(browser = globalThis.navigator) {
  if (isIOSNativeScreenShareAvailable()) return { available: true, reason: "" };
  if (browser?.mediaDevices?.getDisplayMedia)
    return { available: true, reason: "" };

  const userAgent = browser?.userAgent || "";
  if (/iPad|iPhone|iPod/i.test(userAgent)) {
    return {
      available: false,
      reason:
        "В Safari на iPhone демонстрация экрана доступна только в приложении Aurora Call.",
    };
  }
  if (/Android/i.test(userAgent)) {
    return {
      available: false,
      reason:
        "Chrome на Android пока не поддерживает демонстрацию экрана из веб-приложения.",
    };
  }
  return {
    available: false,
    reason: "Этот браузер не поддерживает демонстрацию экрана.",
  };
}

function detachScreenStream() {
  const stream = state.screenStream;
  state.screenStream = null;
  removeScreenEndedListener();
  removeScreenEndedListener = () => {};
  return stream;
}

function sendScreenShareState(active) {
  if (!state.session || !state.selectedFriend || !state.callId)
    return Promise.resolve();
  return rpc("send_call_signal", {
    p_token: state.session.token,
    p_call_id: state.callId,
    p_to: state.selectedFriend.id,
    p_kind: "screen-share",
    p_payload: { active },
  }).catch(() => {});
}

async function stopScreenShare({
  restoreCamera = true,
  notifyPeer = true,
  requestNativeStop = true,
} = {}) {
  const screenStream = detachScreenStream();
  if (!screenStream) {
    setScreenShareActive(false);
    return false;
  }
  const nativeScreenShare = isIOSScreenStream(screenStream);
  const cameraTrack = state.mediaStream?.getVideoTracks()[0] || null;
  if (restoreCamera && state.videoSender && cameraTrack) {
    try {
      await state.videoSender.replaceTrack(cameraTrack);
    } catch {
      showToast("Не удалось вернуть изображение с камеры");
    }
  }
  if (nativeScreenShare && requestNativeStop) stopIOSScreenShare();
  screenStream.getTracks().forEach((track) => track.stop());
  setScreenShareActive(false);
  if (notifyPeer) void sendScreenShareState(false);
  return false;
}

function watchScreenTrack(track, screenStream) {
  const handleEnded = () => void stopScreenShare({ requestNativeStop: false });
  const handleNativeEnded = (event) => {
    if (event.detail?.stream !== screenStream) return;
    void stopScreenShare({ requestNativeStop: false });
  };
  if (track.addEventListener) {
    track.addEventListener("ended", handleEnded, { once: true });
    if (isIOSScreenStream(screenStream)) {
      window.addEventListener(
        "aurora-native-screen-share-ended",
        handleNativeEnded,
      );
    }
    removeScreenEndedListener = () => {
      track.removeEventListener("ended", handleEnded);
      window.removeEventListener(
        "aurora-native-screen-share-ended",
        handleNativeEnded,
      );
    };
  } else {
    track.onended = handleEnded;
    removeScreenEndedListener = () => {
      if (track.onended === handleEnded) track.onended = null;
    };
  }
}

async function startScreenShare() {
  const friend = state.selectedFriend;
  if (!friend || !state.callId || !state.videoSender) return false;
  try {
    let screenStream;
    if (isIOSNativeScreenShareAvailable())
      screenStream = await createIOSScreenStream(state.callId);
    else if (navigator.mediaDevices?.getDisplayMedia)
      screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
    else throw new Error("screen_share_unavailable");
    const track = screenStream.getVideoTracks()[0];
    if (!track) throw new Error("screen_track_missing");
    try {
      track.contentHint = "detail";
    } catch {
      // Some older mobile WebRTC implementations expose a read-only hint.
    }
    await state.videoSender.replaceTrack(track);
    state.screenStream = screenStream;
    watchScreenTrack(track, screenStream);
    setScreenShareActive(true);
    void sendScreenShareState(true);
    return true;
  } catch (error) {
    if (error?.name !== "NotAllowedError")
      showToast("Не удалось начать демонстрацию экрана");
    return false;
  }
}

async function toggleScreenShare() {
  return state.screenStream ? stopScreenShare() : startScreenShare();
}

async function prepareLocalMedia(mode) {
  try {
    const constraints = { audio: true, video: mode === "video" };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    state.mediaStream = stream;
    return stream;
  } catch (error) {
    if (error?.name === "NotAllowedError" || error?.name === "SecurityError") {
      clearMediaPermissionRecord(state.session);
    }
    throw error;
  }
}

function attachStreams() {
  const local = query("#local-video");
  const remote = query("#remote-video");
  if (local) {
    local.srcObject = state.mediaStream || null;
    void local.play?.().catch(() => {});
  }
  if (remote) {
    remote.srcObject = state.remoteStream || null;
    void remote.play?.().catch(() => {
      remote.dataset.playbackBlocked = "true";
    });
  }
}

function toggleTrack(kind) {
  const stream = state.mediaStream;
  const tracks =
    kind === "audio" ? stream?.getAudioTracks() : stream?.getVideoTracks();
  const track = tracks?.[0];
  if (!track) return false;
  track.enabled = !track.enabled;
  return track.enabled;
}

function closePeer() {
  const closingCallId = state.callId;
  state.peer?.close?.();
  state.peer = null;
  state.videoSender = null;
  state.remoteStream = null;
  state.mediaStream?.getTracks().forEach((track) => track.stop());
  state.mediaStream = null;
  void stopScreenShare({ restoreCamera: false, notifyPeer: false });
  state.callId = null;
  if (closingCallId) pendingSignals.delete(closingCallId);
  setRemoteScreenShareActive(false);
  removeCallModal();
}

async function sendSignal(kind, payload) {
  if (!state.session || !state.selectedFriend || !state.callId) return;
  await rpc("send_call_signal", {
    p_token: state.session.token,
    p_call_id: state.callId,
    p_to: state.selectedFriend.id,
    p_kind: kind,
    p_payload: payload,
  });
}

function createPeer() {
  const peer = new RTCPeerConnection({ iceServers: config.iceServers });
  state.peer = peer;
  state.remoteStream = new MediaStream();
  peer.ontrack = (event) => {
    const tracks =
      event.streams[0]?.getTracks?.() || [event.track].filter(Boolean);
    const existingTrackIds = new Set(
      state.remoteStream.getTracks().map((track) => track.id),
    );
    tracks.forEach((track) => {
      if (!existingTrackIds.has(track.id)) state.remoteStream.addTrack(track);
    });
    attachStreams();
  };
  peer.onicecandidate = (event) => {
    if (event.candidate) void sendSignal("ice", event.candidate.toJSON());
  };
  peer.onconnectionstatechange = () =>
    setCallConnectionState(peer.connectionState || peer.iceConnectionState);
  peer.oniceconnectionstatechange = () => {
    if (!peer.connectionState || peer.connectionState === "new") {
      setCallConnectionState(peer.iceConnectionState);
    }
  };
  state.mediaStream?.getTracks().forEach((track) => {
    const sender = peer.addTrack(track, state.mediaStream);
    if (track.kind === "video") state.videoSender = sender;
  });
  return peer;
}

async function callFriend(mode) {
  const friend = state.selectedFriend;
  if (!friend || !state.session) return;
  try {
    await prepareLocalMedia(mode);
    const callId = await rpc("start_call", {
      p_token: state.session.token,
      p_to: friend.id,
      p_mode: mode,
    });
    state.callId = callId;
    const screenShare = getScreenShareSupport();
    renderCallModal({
      friendName: friend.name,
      mode,
      onToggleMic: () => toggleTrack("audio"),
      onToggleCamera: () => toggleTrack("video"),
      onToggleScreenShare: toggleScreenShare,
      canShareScreen: screenShare.available,
      screenShareUnavailableReason: screenShare.reason,
      onScreenShareUnavailable: () => showToast(screenShare.reason),
      onHangup: () => void hangupCall(),
    });
    attachStreams();
    const peer = createPeer();
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    await sendSignal("offer", offer);
  } catch (error) {
    closePeer();
    showToast(error?.message || "Не удалось начать звонок");
  }
}

async function acceptIncoming(call) {
  if (!state.session) return;
  state.callId = call.id;
  state.selectedFriend = { id: call.from_id, name: call.from_name };
  try {
    await prepareLocalMedia(call.mode);
    const screenShare = getScreenShareSupport();
    renderCallModal({
      friendName: call.from_name,
      mode: call.mode,
      onToggleMic: () => toggleTrack("audio"),
      onToggleCamera: () => toggleTrack("video"),
      onToggleScreenShare: toggleScreenShare,
      canShareScreen: screenShare.available,
      screenShareUnavailableReason: screenShare.reason,
      onScreenShareUnavailable: () => showToast(screenShare.reason),
      onHangup: () => void hangupCall(),
    });
    attachStreams();
    createPeer();
    await rpc("answer_call", {
      p_token: state.session.token,
      p_call_id: call.id,
      p_accept: true,
    });
    await flushPendingSignals(call.id);
  } catch {
    await rpc("answer_call", {
      p_token: state.session.token,
      p_call_id: call.id,
      p_accept: false,
    }).catch(() => {});
    closePeer();
  }
}

async function declineIncoming(call) {
  if (!state.session) return;
  pendingSignals.delete(call.id);
  await rpc("answer_call", {
    p_token: state.session.token,
    p_call_id: call.id,
    p_accept: false,
  }).catch(() => {});
}

function queueSignal(signal) {
  if (!signal?.call_id) return;
  const queue = pendingSignals.get(signal.call_id) || [];
  if (queue.length < MAX_SIGNALS_PER_CALL) queue.push(signal);
  pendingSignals.set(signal.call_id, queue);
  while (pendingSignals.size > MAX_PENDING_CALLS) {
    pendingSignals.delete(pendingSignals.keys().next().value);
  }
}

async function processSignal(signal) {
  try {
    if (signal.kind === "offer") {
      await state.peer.setRemoteDescription(signal.payload);
      const answer = await state.peer.createAnswer();
      await state.peer.setLocalDescription(answer);
      await sendSignal("answer", answer);
    } else if (signal.kind === "answer") {
      await state.peer.setRemoteDescription(signal.payload);
    } else if (signal.kind === "ice" || signal.kind === "candidate") {
      await state.peer.addIceCandidate(signal.payload);
    } else if (signal.kind === "screen-share") {
      setRemoteScreenShareActive(Boolean(signal.payload?.active));
    } else if (signal.kind === "hangup" || signal.kind === "decline") {
      if (signal.kind === "decline") showToast("Собеседник отклонил звонок");
      closePeer();
    }
  } catch (error) {
    console.error("signal handling failed", error);
  }
}

async function handleSignal(signal) {
  if (!state.peer || signal.call_id !== state.callId) {
    if (["hangup", "decline"].includes(signal.kind)) {
      pendingSignals.delete(signal.call_id);
      if (dismissIncomingCall(signal.call_id)) {
        if (signal.kind === "decline") showToast("Собеседник отклонил звонок");
        return;
      }
    }
    queueSignal(signal);
    return;
  }
  await processSignal(signal);
}

async function flushPendingSignals(callId) {
  const queue = pendingSignals.get(callId) || [];
  pendingSignals.delete(callId);
  queue.sort((left, right) => Number(left.id || 0) - Number(right.id || 0));
  for (const signal of queue) {
    if (!state.peer || state.callId !== callId) break;
    await processSignal(signal);
  }
}

export async function startCall(mode) {
  return callFriend(mode);
}

export async function hangupCall() {
  if (state.callId) await sendSignal("hangup", {}).catch(() => {});
  if (state.session && state.callId)
    await rpc("finish_call", {
      p_token: state.session.token,
      p_call_id: state.callId,
    }).catch(() => {});
  closePeer();
}

export async function pollSignalsOnce() {
  if (!state.session || signalPollInFlight) return;
  signalPollInFlight = true;
  try {
    const incoming = await rpc("poll_incoming_calls", {
      p_token: state.session.token,
    });
    for (const call of incoming || []) {
      void showIncomingCall(call, {
        onAccept: acceptIncoming,
        onDecline: declineIncoming,
      });
    }

    const signals = await rpc("poll_call_signals", {
      p_token: state.session.token,
      p_after: state.lastSignalId,
    });
    for (const signal of signals || []) {
      state.lastSignalId = Math.max(state.lastSignalId, Number(signal.id || 0));
      await handleSignal(signal);
    }
  } catch (error) {
    console.warn("call polling failed", error);
  } finally {
    signalPollInFlight = false;
  }
}

export function startSignalPolling() {
  if (signalPollTimer) return;
  void pollSignalsOnce();
  signalPollTimer = window.setInterval(
    () => void pollSignalsOnce(),
    config.signalPollIntervalMs,
  );
}
