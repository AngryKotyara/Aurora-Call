export const config = Object.freeze({
  rpcBaseUrl: "/api/rpc/",
  functionsBaseUrl: "/api/functions/",
  registerEmailUrl: "/api/register-email",
  sessionStorageKey: "aurora_session",
  mediaPermissionStoragePrefix: "aurora_media_permissions_v1",
  signalPollIntervalMs: 1_200,
  iceServers: [{ urls: "stun:turn.auroracall.net:3478" }],
});
