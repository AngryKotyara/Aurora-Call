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

export function saveSession(session) {
  state.session = session;
  localStorage.setItem(config.sessionStorageKey, JSON.stringify(session));
}

export function clearSession() {
  state.session = null;
  state.friends = [];
  state.callHistory = [];
  state.selectedFriend = null;
  state.lastSignalId = 0;
  localStorage.removeItem(config.sessionStorageKey);
}
