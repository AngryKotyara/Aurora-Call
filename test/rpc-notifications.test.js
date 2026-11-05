import assert from "node:assert/strict";
import test from "node:test";
import { rpc } from "../src/api.js";

test("successful call and message RPCs keep their existing push events", async () => {
  const originalFetch = globalThis.fetch;
  const notifications = [];
  globalThis.fetch = async (url, options) => {
    if (String(url).endsWith("/aurora-push")) {
      notifications.push(JSON.parse(options.body));
      return new Response("{}", { status: 200 });
    }
    return new Response(JSON.stringify("result-id"), { status: 200 });
  };
  try {
    await rpc("start_call", { p_to: "friend" });
    await rpc("send_chat_message", { p_to: "friend" });
    await rpc("upload_chat_media", { p_to: "friend" });
    await rpc("finish_call", { p_call_id: "call" });
    await rpc("answer_call", { p_call_id: "call", p_accept: false });
    await rpc("answer_call", { p_call_id: "accepted", p_accept: true });
    assert.deepEqual(notifications, [
      { action: "notify_call", p_to: "friend", call_id: "result-id" },
      { action: "notify_message", p_to: "friend", message_id: "result-id" },
      { action: "notify_message", p_to: "friend", message_id: "result-id" },
      { action: "notify_call_end", call_id: "call" },
      { action: "notify_call_end", call_id: "call" },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
