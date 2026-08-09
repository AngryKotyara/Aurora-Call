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
} from "./call-ui.js";
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

async function startScreenShare() {
  const friend = state.selectedFriend;
  if (!friend || !state.callId || !state.videoSender) return false;
  try {
    let screenStream;
    if (isIOSNativeScreenShareAvailable()) screenStream = await createIOSScreenStream(state.callId);
    else if (navigator.mediaDevices?.getDisplayMedia) screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    else throw new Error("screen_share_unavailable");
    const track = screenStream.getVideoTracks()[0];
    if (!track) throw new Error("screen_track_missing");
    await state.videoSender.replaceTrack(track);
    state.screenStream = screenStream;
    watchScreenTrack(track);
    setScreenShareActive(true);
    void sendScreenShareState(true);
    return true;
  } catch (error) {
    if (error?.name !== "NotAllowedError") showToast("Не удалось начать демонстрацию экрана");
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
    clearMediaPermissionRecord(state.session);
    throw error;
  }
}

function attachStreams() {
  const local = query("#local-video");
  const remote = query("#remote-video");
  if (local) local.srcObject = state.mediaStream || null;
  if (remote) remote.srcObject = state.remoteStream || null;
}

function toggleTrack(kind) {
  const stream = state.mediaStream;
  const tracks = kind === "audio" ? stream?.getAudioTracks() : stream?.getVideoTracks();
  const track = tracks?.[0];
  if (!track) return false;
  track.enabled = !track.enabled;
  return track.enabled;
}

function closePeer() {
  state.peer?.close?.();
  state.peer = null;
  state.videoSender = null;
  state.remoteStream = null;
  state.mediaStream?.getTracks().forEach((track) => track.stop());
  state.mediaStream = null;
  void stopScreenShare({ restoreCamera: false, notifyPeer: false });
  state.callId = null;
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
  const peer = new RTCPeerConnection(config.rtcConfig);
  state.peer = peer;
  state.remoteStream = new MediaStream();
  peer.ontrack = (event) => {
    event.streams[0]?.getTracks().forEach((track) => state.remoteStream.addTrack(track));
    attachStreams();
  };
  peer.onicecandidate = (event) => {
    if (event.candidate) void sendSignal("candidate", event.candidate.toJSON());
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
    const callId = await rpc("start_call", { p_token: state.session.token, p_to: friend.id, p_mode: mode });
    state.callId = callId;
    renderCallModal({
      friendName: friend.name,
      mode,
      onToggleMic: () => toggleTrack("audio"),
      onToggleCamera: () => toggleTrack("video"),
      onToggleScreenShare: toggleScreenShare,
      canShareScreen: Boolean(navigator.mediaDevices?.getDisplayMedia || isIOSNativeScreenShareAvailable()),
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
    renderCallModal({
      friendName: call.from_name,
      mode: call.mode,
      onToggleMic: () => toggleTrack("audio"),
      onToggleCamera: () => toggleTrack("video"),
      onToggleScreenShare: toggleScreenShare,
      canShareScreen: Boolean(navigator.mediaDevices?.getDisplayMedia || isIOSNativeScreenShareAvailable()),
      onHangup: () => void hangupCall(),
    });
    attachStreams();
    createPeer();
    await rpc("answer_call", { p_token: state.session.token, p_call_id: call.id, p_accept: true });
  } catch {
    await rpc("answer_call", { p_token: state.session.token, p_call_id: call.id, p_accept: false }).catch(() => {});
    closePeer();
  }
}

async function declineIncoming(call) {
  if (!state.session) return;
  await rpc("answer_call", { p_token: state.session.token, p_call_id: call.id, p_accept: false }).catch(() => {});
}

async function handleSignal(signal) {
  if (!state.peer || signal.call_id !== state.callId) return;
  try {
    if (signal.kind === "offer") {
      await state.peer.setRemoteDescription(signal.payload);
      const answer = await state.peer.createAnswer();
      await state.peer.setLocalDescription(answer);
      await sendSignal("answer", answer);
    } else if (signal.kind === "answer") {
      await state.peer.setRemoteDescription(signal.payload);
    } else if (signal.kind === "candidate") {
      await state.peer.addIceCandidate(signal.payload);
    } else if (signal.kind === "screen-share") {
      setRemoteScreenShareActive(Boolean(signal.payload?.active));
    } else if (signal.kind === "hangup") {
      closePeer();
    }
  } catch (error) {
    console.error("signal handling failed", error);
  }
}

export async function startCall(mode) {
  return callFriend(mode);
}

export async function hangupCall() {
  if (state.callId) await sendSignal("hangup", {}).catch(() => {});
  if (state.session && state.callId) await rpc("finish_call", { p_token: state.session.token, p_call_id: state.callId }).catch(() => {});
  closePeer();
}

export function startSignalPolling() {
  window.setInterval(async () => {
    if (!state.session) return;
    try {
      const incoming = await rpc("poll_incoming_calls", { p_token: state.session.token });
      for (const call of incoming || []) {
        showIncomingCall(call, { onAccept: acceptIncoming, onDecline: declineIncoming });
      }
      const signals = await rpc("poll_call_signals", { p_token: state.session.token });
      for (const signal of signals || []) await handleSignal(signal);
    } catch {}
  }, 1200);
}
