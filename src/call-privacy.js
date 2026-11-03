const KEY = "aurora_relay_only_v1";

export function isNativeApp() {
  return (
    /AuroraCallAndroid\//.test(globalThis.navigator?.userAgent || "") ||
    Boolean(globalThis.window?.webkit?.messageHandlers?.auroraScreenShare)
  );
}

export function relayOnlyEnabled() {
  if (isNativeApp()) return false;
  try {
    return globalThis.localStorage?.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setRelayOnlyEnabled(enabled) {
  globalThis.localStorage.setItem(KEY, enabled ? "1" : "0");
}

export function hasTurnServer(servers) {
  return servers.some((server) =>
    (Array.isArray(server.urls) ? server.urls : [server.urls]).some(
      (url) => typeof url === "string" && /^turns?:/i.test(url),
    ),
  );
}
