import { rpc } from "./api.js";
import { config } from "./config.js";
import { clearMediaPermissionRecord } from "./media-permissions.js";
import { state } from "./state.js";
import { removeCallModal, renderCallModal } from "./ui.js";
import { query, showToast } from "./utils.js";

function stopLocalCall() {
  state.mediaStream?.getTracks().forEach((track) => track.stop());
  state.peerConnection?.close();
  state.peerConnection = null;
  state.mediaStream = null;
  state.callId = null;
  removeCallModal();
}

function toggleTracks(kind) {
  const tracks =
    kind === "audio"
      ? state.mediaStream?.getAudioTracks()
      : state.mediaStream?.getVideoTracks();
  tracks?.forEach((track) => {
    track.enabled = !track.enabled;
  });
}

function recordCallStatus(callId, friend, mode, status) {
  if (!callId || !friend) return Promise.resolve();

  return rpc("record_call_event", {
    p_token: state.session.token,
    p_call_id: callId,
    p_peer: friend.id,
    p_mode: mode,
    p_status: status,
  }).catch(() => {});
}

export async function endCall({ notifyPeer = true } = {}) {
  const friend = state.selectedFriend;
  const callId = state.callId;
  const mode = state.callMode;
  stopLocalCall();

  const requests = [recordCallStatus(callId, friend, mode, "completed")];

  if (notifyPeer && friend && callId)
    requests.push(
      rpc("send_call_signal", {
        p_token: state.session.token,
        p_call_id: callId,
        p_to: friend.id,
        p_kind: "hangup",
        p_payload: {},
      }).catch(() => {}),
    );

  await Promise.all(requests);
}

export async function startCall(mode, incoming = false, offer = null) {
  if (!state.selectedFriend) {
    if (!state.friends.length) {
      showToast("Сначала добавьте друга");
      return;
    }
    const firstFriend = state.friends[0];
    state.selectedFriend = { id: firstFriend.id, name: firstFriend.username };
  }

  state.callMode = mode;
  state.callId = offer?.callId || crypto.randomUUID();

  try {
    state.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: mode === "video",
    });
  } catch (error) {
    state.callId = null;
    if (error?.name === "NotAllowedError" || error?.name === "SecurityError") {
      clearMediaPermissionRecord(state.session);
      showToast("Разрешите доступ к микрофону и камере в настройках");
    } else if (error?.name === "NotFoundError") {
      showToast("Камера или микрофон не найдены");
    } else {
      showToast("Не удалось подключить камеру и микрофон");
    }
    return;
  }

  try {
    state.peerConnection = new RTCPeerConnection({
      iceServers: config.iceServers,
    });
    state.mediaStream
      .getTracks()
      .forEach((track) =>
        state.peerConnection.addTrack(track, state.mediaStream),
      );

    renderCallModal({
      friendName: state.selectedFriend.name,
      mode,
      onToggleMic: () => toggleTracks("audio"),
      onToggleCamera: () => toggleTracks("video"),
      onHangup: () => void endCall(),
    });
    query("#local-video").srcObject = state.mediaStream;

    state.peerConnection.ontrack = (event) => {
      query("#remote-video").srcObject = event.streams[0];
    };
    state.peerConnection.onicecandidate = (event) => {
      if (!event.candidate) return;
      void rpc("send_call_signal", {
        p_token: state.session.token,
        p_call_id: state.callId,
        p_to: state.selectedFriend.id,
        p_kind: "ice",
        p_payload: event.candidate,
      }).catch(() => {});
    };

    if (incoming) {
      await state.peerConnection.setRemoteDescription(offer.payload);
      const answer = await state.peerConnection.createAnswer();
      await state.peerConnection.setLocalDescription(answer);
      await rpc("send_call_signal", {
        p_token: state.session.token,
        p_call_id: state.callId,
        p_to: state.selectedFriend.id,
        p_kind: "answer",
        p_payload: answer,
      });
    } else {
      const outgoingOffer = await state.peerConnection.createOffer();
      await state.peerConnection.setLocalDescription(outgoingOffer);
      await rpc("send_call_signal", {
        p_token: state.session.token,
        p_call_id: state.callId,
        p_to: state.selectedFriend.id,
        p_kind: "offer",
        p_payload: { ...outgoingOffer, mode },
      });
    }

    void recordCallStatus(
      state.callId,
      state.selectedFriend,
      mode,
      incoming ? "answered" : "started",
    );
  } catch (error) {
    stopLocalCall();
    showToast(error.message);
  }
}

async function handleSignal(signal) {
  if (signal.kind === "offer" && !state.peerConnection) {
    state.selectedFriend = {
      id: signal.from_user,
      name: signal.from_username,
    };
    const accepted = window.confirm(`${signal.from_username} звонит. Принять?`);

    if (accepted) {
      await startCall(signal.payload.mode || "audio", true, {
        callId: signal.call_id,
        payload: signal.payload,
      });
    } else {
      await rpc("send_call_signal", {
        p_token: state.session.token,
        p_call_id: signal.call_id,
        p_to: signal.from_user,
        p_kind: "decline",
        p_payload: {},
      });
    }
  } else if (signal.kind === "answer" && state.peerConnection) {
    await state.peerConnection.setRemoteDescription(signal.payload);
  } else if (signal.kind === "ice" && state.peerConnection) {
    await state.peerConnection.addIceCandidate(signal.payload).catch(() => {});
  } else if (signal.kind === "hangup" || signal.kind === "decline") {
    await recordCallStatus(
      state.callId || signal.call_id,
      state.selectedFriend,
      state.callMode,
      signal.kind === "decline" ? "declined" : "completed",
    );
    showToast(
      signal.kind === "decline" ? "Звонок отклонён" : "Звонок завершён",
    );
    stopLocalCall();
  }
}

async function pollSignals() {
  if (state.session) {
    try {
      const signals = await rpc("poll_call_signals", {
        p_token: state.session.token,
        p_after: state.lastSignalId,
      });

      for (const signal of signals) {
        state.lastSignalId = Math.max(state.lastSignalId, signal.id);
        await handleSignal(signal);
      }
    } catch {
      // Polling is intentionally resilient to short network interruptions.
    }
  }

  window.setTimeout(pollSignals, config.signalPollIntervalMs);
}

export function startSignalPolling() {
  void pollSignals();
}
