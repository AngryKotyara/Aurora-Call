import { hangupCall, openIncomingCallFromPush } from "./calls.js";
import { dismissIncomingCall } from "./incoming-call.js";
import { rpc } from "./api.js";
import { state } from "./state.js";

const BRIDGE_NAME = "auroraNativeCall";
const NATIVE_EVENT_QUEUE = "__auroraPendingNativeEvents";
let trackedCallId = null;
let flushTimer = null;

function bridge() {
  return window.webkit?.messageHandlers?.[BRIDGE_NAME] || null;
}

function nativeEvents() {
  return Array.isArray(window[NATIVE_EVENT_QUEUE])
    ? window[NATIVE_EVENT_QUEUE]
    : [];
}

function setNativeEvents(events) {
  window[NATIVE_EVENT_QUEUE] = events.slice(-20);
}

function removeQueuedEvent(name, detail = {}) {
  const callId = String(detail.callId || "");
  const token = String(detail.token || "");
  setNativeEvents(
    nativeEvents().filter((event) => {
      if (event?.name !== name) return true;
      if (callId) return String(event?.detail?.callId || "") !== callId;
      if (token) return String(event?.detail?.token || "") !== token;
      return false;
    }),
  );
}

async function openNativeCall(callId) {
  const normalizedId = String(callId || "");
  if (!normalizedId) return false;
  if (!state.session) {
    schedulePendingFlush();
    return false;
  }
  const opened = await openIncomingCallFromPush(normalizedId);
  if (opened) removeQueuedEvent("aurora-call-open", { callId: normalizedId });
  return opened;
}

async function endNativeCall(callId) {
  const normalizedId = String(callId || "");
  if (!normalizedId || !state.session) return false;

  if (state.callId && String(state.callId) === normalizedId) {
    await hangupCall();
    removeQueuedEvent("aurora-call-end-native", { callId: normalizedId });
    return true;
  }

  try {
    const incoming = await rpc("poll_incoming_calls", {
      p_token: state.session.token,
    });
    const call = (incoming || []).find(
      (candidate) => String(candidate.id) === normalizedId,
    );
    if (call) {
      await rpc("answer_call", {
        p_token: state.session.token,
        p_call_id: call.id,
        p_accept: false,
      });
      dismissIncomingCall(call.id);
    }
    removeQueuedEvent("aurora-call-end-native", { callId: normalizedId });
    return Boolean(call);
  } catch (error) {
    console.warn("Failed to end native iOS call", error);
    return false;
  }
}

function rememberVoIPToken(token) {
  window.__auroraVoIPToken = String(token || "");
  removeQueuedEvent("aurora-voip-token", { token });
}

function flushPendingNativeEvents() {
  flushTimer = null;
  const pending = nativeEvents().slice();
  if (!pending.length) return;

  if (!state.session && pending.some((event) => event?.name !== "aurora-voip-token")) {
    schedulePendingFlush();
  }

  for (const event of pending) {
    if (event?.name === "aurora-voip-token") {
      rememberVoIPToken(event.detail?.token);
    } else if (event?.name === "aurora-call-open" && state.session) {
      void openNativeCall(event.detail?.callId);
    } else if (event?.name === "aurora-call-end-native" && state.session) {
      void endNativeCall(event.detail?.callId);
    }
  }
}

function schedulePendingFlush(delay = 250) {
  if (flushTimer !== null) return;
  flushTimer = window.setTimeout(flushPendingNativeEvents, delay);
}

function notifyNativeCallEnded(callId) {
  const handler = bridge();
  if (!handler || !callId) return;
  try {
    handler.postMessage({ action: "ended", callId: String(callId) });
  } catch (error) {
    console.warn("Failed to notify iOS that the call ended", error);
  }
}

function syncTrackedCall() {
  const callModal = document.querySelector("#call-modal");
  if (callModal) {
    if (state.callId) trackedCallId = String(state.callId);
    return;
  }
  if (!trackedCallId) return;
  const endedCallId = trackedCallId;
  trackedCallId = null;
  notifyNativeCallEnded(endedCallId);
}

function installCallLifecycleObserver() {
  if (!document.body) return;
  const observer = new MutationObserver(syncTrackedCall);
  observer.observe(document.body, { childList: true, subtree: true });
  syncTrackedCall();
}

function installNativeEventHandlers() {
  document.addEventListener("aurora-call-open", (event) => {
    void openNativeCall(event.detail?.callId);
  });
  document.addEventListener("aurora-call-end-native", (event) => {
    void endNativeCall(event.detail?.callId);
  });
  document.addEventListener("aurora-voip-token", (event) => {
    rememberVoIPToken(event.detail?.token);
  });

  const handler = bridge();
  if (handler) {
    try {
      handler.postMessage({ action: "requestVoIPToken" });
    } catch (error) {
      console.warn("Failed to request iOS VoIP token", error);
    }
  }

  schedulePendingFlush(0);
}

installNativeEventHandlers();
installCallLifecycleObserver();
