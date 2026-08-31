import { rpc } from "./api.js";
import { state } from "./state.js";

const HEARTBEAT_MS = 18_000;
const PEER_POLL_MS = 2_200;
const ACTIVITY_REFRESH_MS = 4_000;
const TYPING_IDLE_MS = 3_200;
const PUBLISH_THROTTLE_MS = 2_500;

let initialized = false;
let currentPeer = null;
let currentActivity = "idle";
let conversationWasOpen = false;
let heartbeatTimer = null;
let peerPollTimer = null;
let activityRefreshTimer = null;
let typingIdleTimer = null;
let peerPollInFlight = false;
let shellObserver = null;
let voiceObserver = null;
let observedComposer = null;
let syncQueued = false;
let lastPublishedKey = "";
let lastPublishedAt = 0;
let lastSessionPresent = false;

function hasSession() {
  return Boolean(state.session);
}

function pageVisible() {
  return document.visibilityState !== "hidden";
}

function networkAvailable() {
  return navigator.onLine !== false;
}

function conversationView() {
  const layer = document.querySelector("#chat-layer");
  if (!layer || layer.hidden) return null;
  return layer.querySelector(".chat-conversation-view");
}

function normalizePeer(peer) {
  const id = String(peer?.id || "").trim();
  if (!id) return null;
  return {
    id,
    name: String(peer?.name || peer?.username || "").trim(),
  };
}

function peerFromDom() {
  const name = document
    .querySelector("#chat-layer .chat-peer b")
    ?.textContent?.trim();
  if (!name) return currentPeer;
  if (currentPeer?.name === name) return currentPeer;
  const friend = (state.friends || []).find(
    (item) => item?.username === name || item?.name === name,
  );
  return friend
    ? normalizePeer({ id: friend.id, name: friend.username || friend.name })
    : currentPeer;
}

function stopTypingTimer() {
  if (typingIdleTimer !== null) window.clearTimeout(typingIdleTimer);
  typingIdleTimer = null;
}

function stopActivityRefresh() {
  if (activityRefreshTimer !== null) window.clearTimeout(activityRefreshTimer);
  activityRefreshTimer = null;
}

function stopPeerPolling() {
  if (peerPollTimer !== null) window.clearTimeout(peerPollTimer);
  peerPollTimer = null;
}

function publishKeepalive(
  activity = "idle",
  peerId = null,
  { force = false } = {},
) {
  if (!hasSession() || !pageVisible() || !networkAvailable())
    return Promise.resolve();
  const safeActivity = ["idle", "typing", "recording"].includes(activity)
    ? activity
    : "idle";
  const safePeer =
    safeActivity === "idle" ? null : String(peerId || "").trim() || null;
  if (safeActivity !== "idle" && !safePeer) return Promise.resolve();

  const key = `${safeActivity}:${safePeer || ""}`;
  const now = Date.now();
  if (
    !force &&
    key === lastPublishedKey &&
    now - lastPublishedAt < PUBLISH_THROTTLE_MS
  )
    return Promise.resolve();

  lastPublishedKey = key;
  lastPublishedAt = now;
  return rpc(
    "touch_call_presence",
    { p_friend: safePeer, p_activity: safeActivity },
    { retries: 0, timeoutMs: 5_000 },
  ).catch((error) => {
    if (lastPublishedKey === key) lastPublishedAt = 0;
    console.debug("Presence update skipped", error);
  });
}

function sendOfflineKeepalive() {
  if (!hasSession()) return;
  void fetch("/api/rpc/touch_call_presence", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    keepalive: true,
    body: JSON.stringify({ p_friend: null, p_activity: "offline" }),
  }).catch(() => {});
}

function scheduleActivityRefresh() {
  stopActivityRefresh();
  if (currentActivity === "idle" || !currentPeer?.id) return;
  activityRefreshTimer = window.setTimeout(async () => {
    activityRefreshTimer = null;
    if (!conversationView() || currentActivity === "idle" || !currentPeer?.id)
      return;
    await publishKeepalive(currentActivity, currentPeer.id, { force: true });
    scheduleActivityRefresh();
  }, ACTIVITY_REFRESH_MS);
}

function setActivity(activity, { force = false } = {}) {
  const next = ["typing", "recording"].includes(activity) ? activity : "idle";
  if (next !== "typing") stopTypingTimer();
  currentActivity = next;
  scheduleActivityRefresh();
  return publishKeepalive(next, currentPeer?.id || null, { force });
}

function capturePeer(peer) {
  const normalized = normalizePeer(peer);
  if (!normalized) return;
  const changed = normalized.id !== currentPeer?.id;
  if (changed && currentActivity !== "idle")
    void setActivity("idle", { force: true });
  currentPeer = normalized;
  if (changed) {
    stopPeerPolling();
    queuePeerPoll(0);
  }
}

function timeText(date) {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatLastSeen(value, nowValue = new Date()) {
  if (!value) return "не в сети";
  const date = new Date(value);
  const now = new Date(nowValue);
  if (!Number.isFinite(date.getTime()) || !Number.isFinite(now.getTime()))
    return "не в сети";

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const seenDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const time = timeText(date);

  if (seenDay.getTime() === today.getTime()) return `был(а) сегодня в ${time}`;
  if (seenDay.getTime() === yesterday.getTime())
    return `был(а) вчера в ${time}`;

  const dateText = new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  }).format(date);
  return `был(а) ${dateText} в ${time}`;
}

export function peerPresenceLabel(presence, nowValue = new Date()) {
  if (presence?.is_online) {
    if (presence.activity === "recording") return "записывает голосовое…";
    if (presence.activity === "typing") return "печатает…";
    return "онлайн";
  }
  return formatLastSeen(presence?.last_seen_at, nowValue);
}

function ensureStatusElement() {
  const peer = document.querySelector("#chat-layer .chat-peer");
  if (!peer) return null;
  let status = peer.querySelector(".chat-peer-status");
  if (!status) {
    status =
      peer.querySelector(":scope > span") || document.createElement("span");
    status.className = "chat-peer-status";
    status.innerHTML =
      '<i class="chat-online-dot" aria-hidden="true"></i><span class="chat-peer-status-text">проверяем статус…</span>';
    if (!status.parentElement) peer.append(status);
  }
  return status;
}

function renderPeerPresence(presence) {
  const status = ensureStatusElement();
  if (!status) return;
  const online = Boolean(presence?.is_online);
  const active = online && ["typing", "recording"].includes(presence?.activity);
  status.classList.toggle("is-online", online);
  status.classList.toggle("is-active", active);
  const label = status.querySelector(".chat-peer-status-text");
  if (label) label.textContent = peerPresenceLabel(presence);
}

async function pollPeerPresence() {
  peerPollTimer = null;
  if (
    peerPollInFlight ||
    !conversationView() ||
    !pageVisible() ||
    !hasSession()
  )
    return;
  const peer = peerFromDom();
  if (!peer?.id) return;
  currentPeer = peer;
  peerPollInFlight = true;
  const requestedId = peer.id;
  try {
    const result = await rpc(
      "get_chat_peer_presence",
      { p_friend: requestedId },
      { retries: 0, timeoutMs: 5_000 },
    );
    const row = Array.isArray(result) ? result[0] : result;
    if (conversationView() && currentPeer?.id === requestedId)
      renderPeerPresence(row || {});
  } catch (error) {
    console.debug("Peer presence unavailable", error);
  } finally {
    peerPollInFlight = false;
    if (conversationView() && pageVisible() && hasSession())
      queuePeerPoll(PEER_POLL_MS);
  }
}

function queuePeerPoll(delay = PEER_POLL_MS) {
  if (peerPollTimer !== null || peerPollInFlight) return;
  if (!conversationView() || !pageVisible() || !hasSession()) return;
  peerPollTimer = window.setTimeout(
    () => void pollPeerPresence(),
    Math.max(0, delay),
  );
}

function syncVoiceObserver() {
  const composer = document.querySelector(
    "#chat-layer .chat-conversation-view .chat-composer",
  );
  if (composer === observedComposer) return;
  voiceObserver?.disconnect();
  voiceObserver = null;
  observedComposer = composer || null;
  if (!composer) return;
  voiceObserver = new MutationObserver(() => syncVoiceActivity());
  voiceObserver.observe(composer, {
    attributes: true,
    attributeFilter: ["class"],
    childList: true,
    subtree: true,
  });
}

function syncVoiceActivity() {
  const view = conversationView();
  if (!view) return;
  const recording = Boolean(
    view.querySelector(".chat-composer.voice-recording, .voice-record-strip"),
  );
  if (recording && currentActivity !== "recording") {
    stopTypingTimer();
    void setActivity("recording", { force: true });
  } else if (!recording && currentActivity === "recording") {
    void setActivity("idle", { force: true });
  }
}

function syncConversationState() {
  syncQueued = false;
  const sessionPresent = hasSession();
  if (sessionPresent && !lastSessionPresent && pageVisible())
    void publishKeepalive("idle", null, { force: true });
  lastSessionPresent = sessionPresent;

  const view = conversationView();
  if (!view) {
    if (conversationWasOpen && currentActivity !== "idle")
      void setActivity("idle", { force: true });
    conversationWasOpen = false;
    currentPeer = null;
    stopPeerPolling();
    stopTypingTimer();
    stopActivityRefresh();
    voiceObserver?.disconnect();
    voiceObserver = null;
    observedComposer = null;
    return;
  }

  conversationWasOpen = true;
  const peer = peerFromDom();
  if (peer) currentPeer = peer;
  ensureStatusElement();
  syncVoiceObserver();
  syncVoiceActivity();

  if (currentActivity === "typing") {
    const input = view.querySelector(".chat-input");
    if (!input?.value?.trim()) void setActivity("idle", { force: true });
  }
  queuePeerPoll(0);
}

function queueSync() {
  if (syncQueued) return;
  syncQueued = true;
  queueMicrotask(syncConversationState);
}

function scheduleHeartbeat(delay = HEARTBEAT_MS) {
  if (heartbeatTimer !== null) window.clearTimeout(heartbeatTimer);
  heartbeatTimer = window.setTimeout(
    async () => {
      heartbeatTimer = null;
      if (hasSession() && pageVisible() && networkAvailable()) {
        const active =
          conversationView() && currentActivity !== "idle" && currentPeer?.id;
        await publishKeepalive(
          active ? currentActivity : "idle",
          active ? currentPeer.id : null,
          {
            force: true,
          },
        );
      }
      scheduleHeartbeat();
    },
    Math.max(0, delay),
  );
}

function handleTypingInput(event) {
  const input = event.target.closest?.(
    "#chat-layer .chat-conversation-view .chat-input",
  );
  if (!input) return;
  const peer = peerFromDom();
  if (peer) currentPeer = peer;
  if (!input.value.trim() || !currentPeer?.id) {
    void setActivity("idle", { force: true });
    return;
  }
  void setActivity("typing");
  stopTypingTimer();
  typingIdleTimer = window.setTimeout(() => {
    typingIdleTimer = null;
    if (currentActivity === "typing") void setActivity("idle", { force: true });
  }, TYPING_IDLE_MS);
}

function handleComposerSubmit(event) {
  if (
    !event.target.closest?.(
      "#chat-layer .chat-conversation-view .chat-composer",
    )
  )
    return;
  if (currentActivity === "typing") void setActivity("idle", { force: true });
}

function handleFocusOut(event) {
  if (
    !event.target.closest?.("#chat-layer .chat-conversation-view .chat-input")
  )
    return;
  if (currentActivity === "typing") void setActivity("idle", { force: true });
}

function handlePeerCapture(event) {
  const thread = event.target.closest?.("[data-chat-friend]");
  if (thread)
    capturePeer({
      id: thread.dataset.chatFriend,
      name: thread.dataset.chatName || "",
    });
  const message = event.target.closest?.("[data-message-friend]");
  if (message)
    capturePeer({
      id: message.dataset.messageFriend,
      name:
        message.dataset.name ||
        message.title?.replace(/^Написать\s+/, "") ||
        "",
    });
}

export function initChatPresence() {
  if (initialized) return;
  initialized = true;
  lastSessionPresent = hasSession();

  document.addEventListener("click", handlePeerCapture, true);
  document.addEventListener("input", handleTypingInput, true);
  document.addEventListener("submit", handleComposerSubmit, true);
  document.addEventListener("focusout", handleFocusOut, true);
  document.addEventListener("aurora-chat-open", (event) =>
    capturePeer(event.detail || null),
  );
  document.addEventListener("visibilitychange", () => {
    if (!pageVisible()) {
      stopPeerPolling();
      stopTypingTimer();
      stopActivityRefresh();
      currentActivity = "idle";
      sendOfflineKeepalive();
      return;
    }
    lastPublishedAt = 0;
    void publishKeepalive("idle", null, { force: true });
    queueSync();
  });
  window.addEventListener("online", () => {
    lastPublishedAt = 0;
    void publishKeepalive("idle", null, { force: true });
    queueSync();
  });
  window.addEventListener("pagehide", sendOfflineKeepalive);

  shellObserver = new MutationObserver(queueSync);
  shellObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  if (hasSession() && pageVisible())
    void publishKeepalive("idle", null, { force: true });
  scheduleHeartbeat();
  queueSync();
}
