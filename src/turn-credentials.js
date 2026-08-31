import { config } from "./config.js";
import { state } from "./state.js";

const TURN_HOST = "turn.auroracall.net";
const REFRESH_MARGIN_MS = 2 * 60_000;
const REFRESH_INTERVAL_MS = 5 * 60_000;
let expiresAt = 0;
let refreshInFlight = null;
let bootstrapTimer = null;
let maintenanceTimer = null;

function allowedUrl(value) {
  if (typeof value !== "string") return false;
  return [
    `stun:${TURN_HOST}:`,
    `turn:${TURN_HOST}:`,
    `turns:${TURN_HOST}:`,
  ].some((prefix) => value.startsWith(prefix));
}

function validIceServer(server) {
  if (!server || typeof server !== "object") return false;
  const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
  if (!urls.length || urls.some((url) => !allowedUrl(url))) return false;
  const needsCredentials = urls.some(
    (url) => typeof url === "string" && /^turns?:/.test(url),
  );
  if (!needsCredentials) return true;
  return (
    typeof server.username === "string" &&
    server.username.length > 0 &&
    server.username.length < 256 &&
    typeof server.credential === "string" &&
    server.credential.length > 0 &&
    server.credential.length < 512
  );
}

function replaceIceServers(servers) {
  const safe = servers.filter(validIceServer).slice(0, 4);
  if (!safe.length) return false;
  config.iceServers.splice(0, config.iceServers.length, ...safe);
  return true;
}

export async function refreshTurnCredentials({ force = false } = {}) {
  if (!state.session?.token || navigator.onLine === false) return false;
  if (!force && expiresAt > Date.now() + REFRESH_MARGIN_MS) return true;
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const response = await fetch(
        `${config.functionsBaseUrl}aurora-turn-credentials`,
        {
          method: "POST",
          headers: {
            apikey: config.supabasePublishableKey,
            "Content-Type": "application/json",
            "X-Client-Info": "aurora-call-turn/1",
          },
          body: JSON.stringify({ p_token: state.session.token }),
        },
      );
      if (!response.ok) return false;
      const payload = await response.json();
      if (!Array.isArray(payload?.ice_servers)) return false;
      if (!replaceIceServers(payload.ice_servers)) return false;
      const parsedExpiry = Date.parse(payload.expires_at || "");
      expiresAt = Number.isFinite(parsedExpiry)
        ? parsedExpiry
        : Date.now() + 5 * 60_000;
      return true;
    } catch (error) {
      console.warn("TURN credentials unavailable", error);
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export function initTurnCredentials() {
  if (maintenanceTimer !== null) return;

  let bootstrapAttempts = 0;
  bootstrapTimer = window.setInterval(() => {
    bootstrapAttempts += 1;
    void refreshTurnCredentials();
    if (expiresAt > Date.now() || bootstrapAttempts >= 60) {
      window.clearInterval(bootstrapTimer);
      bootstrapTimer = null;
    }
  }, 1_000);

  maintenanceTimer = window.setInterval(
    () => void refreshTurnCredentials(),
    REFRESH_INTERVAL_MS,
  );

  window.addEventListener(
    "online",
    () => void refreshTurnCredentials({ force: true }),
  );
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void refreshTurnCredentials();
  });
  document.addEventListener("aurora-call-open", () => {
    void refreshTurnCredentials();
  });
}
