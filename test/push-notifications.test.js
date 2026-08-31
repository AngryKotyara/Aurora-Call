import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("push backend emits declarative notifications with unread badges", () => {
  const backend = source("supabase/functions/aurora-push/index.ts");

  assert.match(backend, /web_push:\s*8030/);
  assert.match(backend, /app_badge/);
  assert.match(backend, /title,\s*body,\s*tag,\s*\.\.\.data,/s);
  assert.match(backend, /unreadMessageCount\(recipientId\)/);
  assert.match(backend, /86_400/);
});

test("native Android push uses UnifiedPush without Firebase fallback", () => {
  const backend = source("supabase/functions/aurora-push/index.ts");
  const pushClient = source("src/push-notifications.js");

  assert.match(backend, /"X-UnifiedPush":\s*"1"/);
  assert.match(pushClient, /distributor_available/);
  assert.match(pushClient, /mode:\s*"unifiedpush_help"/);
  assert.doesNotMatch(pushClient, /Firebase Cloud Messaging/);
});

test("call notification launches are routed to the call controller", () => {
  const pushClient = source("src/push-notifications.js");
  const calls = source("src/calls.js");

  assert.match(pushClient, /new CustomEvent\("aurora-call-open"/);
  assert.match(calls, /openIncomingCallFromPush/);
  assert.match(calls, /poll_incoming_calls/);
});
