export function isAndroidNativeApp(browser = globalThis.navigator) {
  return (
    /AuroraCallAndroid\//.test(browser?.userAgent || "") &&
    typeof globalThis.AuroraNative?.postMessage === "function"
  );
}

export function postAndroidNative(action, payload = {}) {
  if (!isAndroidNativeApp()) return false;
  try {
    globalThis.AuroraNative.postMessage(JSON.stringify({ action, ...payload }));
    return true;
  } catch (error) {
    console.warn("Android native bridge failed", error);
    return false;
  }
}

export function requestAndroidNotificationState() {
  return postAndroidNative("get_notification_state");
}

export function enableAndroidNotifications() {
  return postAndroidNative("enable_notifications");
}

export function disableAndroidNotifications() {
  return postAndroidNative("disable_notifications");
}

export function openAndroidFullScreenSettings() {
  return postAndroidNative("open_full_screen_settings");
}

export function notifyAndroidCallActive({ callId, peerName, mode }) {
  return postAndroidNative("call_active", {
    call_id: String(callId || ""),
    peer_name: String(peerName || "Aurora Call"),
    mode: mode === "video" ? "video" : "audio",
  });
}

export function notifyAndroidCallEnded(callId) {
  return postAndroidNative("call_ended", {
    call_id: String(callId || ""),
  });
}
