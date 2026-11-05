import { rpc } from "../api.js";
import {
  createIOSScreenStream,
  isIOSNativeScreenShareAvailable,
  isIOSScreenStream,
  stopIOSScreenShare,
} from "../ios-screen-share.js";
import { state } from "../state.js";
import { setScreenShareActive } from "../call-ui.js";
import { showToast } from "../utils.js";

let removeScreenEndedListener = () => {};

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

export async function stopScreenShare({
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

export async function toggleScreenShare() {
  return state.screenStream ? stopScreenShare() : startScreenShare();
}
