export const CHAT_POLL_ACTIVE_MS = 2_500;
export const CHAT_POLL_IDLE_MS = 8_000;
export const CHAT_POLL_BACKGROUND_MS = 45_000;
export const SIGNAL_POLL_IDLE_MS = 3_000;
export const SIGNAL_POLL_BACKGROUND_MS = 15_000;
export const PUSH_SUBSCRIPTION_SYNC_MS = 6 * 60 * 60 * 1_000;

export function chatPollDelay({
  hasSession = true,
  visible = true,
  conversationOpen = false,
} = {}) {
  if (!hasSession) return 60_000;
  if (!visible) return CHAT_POLL_BACKGROUND_MS;
  return conversationOpen ? CHAT_POLL_ACTIVE_MS : CHAT_POLL_IDLE_MS;
}

export function signalPollDelay({
  hasSession = true,
  visible = true,
  activeCall = false,
  online = true,
  baseInterval = 1_200,
} = {}) {
  const safeBase = Math.max(800, Number(baseInterval) || 1_200);
  if (!hasSession) return 30_000;
  if (activeCall) return safeBase;
  if (!online || !visible) return SIGNAL_POLL_BACKGROUND_MS;
  return SIGNAL_POLL_IDLE_MS;
}

export function pushSyncDue(lastSyncAt, now = Date.now()) {
  const lastSync = Math.max(0, Number(lastSyncAt) || 0);
  return (
    !lastSync ||
    Math.max(0, Number(now) || 0) - lastSync >= PUSH_SUBSCRIPTION_SYNC_MS
  );
}
