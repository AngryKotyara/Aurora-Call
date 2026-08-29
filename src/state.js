import { config } from "./config.js";

function readStoredSession() {
  try {
    const session = JSON.parse(
      localStorage.getItem(config.sessionStorageKey) || "null",
    );
    return session?.token ? session : null;
  } catch {
    localStorage.removeItem(config.sessionStorageKey);
    return null;
  }
}

export const state = {
  session: readStoredSession(),
  friends: [],
  callHistory: [],
  selectedFriend: null,
  peer: null,
  mediaStream: null,
  videoSender: null,
  screenStream: null,
  callId: null,
  callMode: "audio",
  lastSignalId: 0,
};

function publicSession(session) {
  if (!session) return null;
  return {
    user_id: session.user_id,
    username: session.username,
    expires_at: session.expires_at || null,
    token: true,
  };
}

export function saveSession(session) {
  state.session = publicSession(session);
  localStorage.setItem(config.sessionStorageKey, JSON.stringify(state.session));
}

export async function migrateLegacySession() {
  const token = state.session?.token;
  if (typeof token !== "string" || !/^[0-9a-f-]{36}$/i.test(token)) return;
  try {
    const response = await fetch("/api/auth-adopt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (!response.ok) throw new Error("legacy_session_rejected");
    saveSession(state.session);
  } catch {
    state.session = null;
    localStorage.removeItem(config.sessionStorageKey);
  }
}

export function clearSession() {
  state.session = null;
  state.friends = [];
  state.callHistory = [];
  state.selectedFriend = null;
  state.lastSignalId = 0;
  localStorage.removeItem(config.sessionStorageKey);
  void fetch("/api/auth-logout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    keepalive: true,
  }).catch(() => {});
}
