export const config = Object.freeze({
  rpcBaseUrl: "/api/rpc/",
  functionsBaseUrl: "/api/functions/",
  publicFunctionsBaseUrl:
    "https://taqpirplpmjihmkztwlv.supabase.co/functions/v1/",
  supabasePublishableKey: "sb_publishable_ciRXzMnLGCYUm-u-esWIOA_v6XjUEuu",
  sessionStorageKey: "aurora_session",
  mediaPermissionStoragePrefix: "aurora_media_permissions_v1",
  signalPollIntervalMs: 1_200,
  iceServers: [{ urls: "stun:turn.auroracall.net:3478" }],
});
