import assert from "node:assert/strict";
import test from "node:test";

import {
  CHAT_POLL_ACTIVE_MS,
  CHAT_POLL_BACKGROUND_MS,
  CHAT_POLL_IDLE_MS,
  PUSH_SUBSCRIPTION_SYNC_MS,
  SIGNAL_POLL_BACKGROUND_MS,
  SIGNAL_POLL_IDLE_MS,
  chatPollDelay,
  pushSyncDue,
  signalPollDelay,
} from "../src/polling-policy.js";

test("chat polling slows down outside an open visible conversation", () => {
  assert.equal(chatPollDelay({ conversationOpen: true }), CHAT_POLL_ACTIVE_MS);
  assert.equal(chatPollDelay(), CHAT_POLL_IDLE_MS);
  assert.equal(chatPollDelay({ visible: false }), CHAT_POLL_BACKGROUND_MS);
  assert.equal(chatPollDelay({ hasSession: false }), 60_000);
});

test("call polling stays responsive during a call and rests otherwise", () => {
  assert.equal(
    signalPollDelay({ activeCall: true, baseInterval: 1_200 }),
    1_200,
  );
  assert.equal(signalPollDelay(), SIGNAL_POLL_IDLE_MS);
  assert.equal(signalPollDelay({ visible: false }), SIGNAL_POLL_BACKGROUND_MS);
  assert.equal(signalPollDelay({ online: false }), SIGNAL_POLL_BACKGROUND_MS);
});

test("push subscriptions are only refreshed after the maintenance window", () => {
  const now = 10 * PUSH_SUBSCRIPTION_SYNC_MS;
  assert.equal(pushSyncDue(0, now), true);
  assert.equal(pushSyncDue(now - PUSH_SUBSCRIPTION_SYNC_MS + 1, now), false);
  assert.equal(pushSyncDue(now - PUSH_SUBSCRIPTION_SYNC_MS, now), true);
});
