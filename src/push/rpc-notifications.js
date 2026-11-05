import { config } from "../config.js";
import { resilientFetch } from "../network.js";

async function sendPushEvent(action, body) {
  try {
    await resilientFetch(
      `${config.functionsBaseUrl}aurora-push`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Client-Info": "aurora-call-web/3",
        },
        body: JSON.stringify({ action, ...body }),
      },
      { retries: 0, timeoutMs: 7000 },
    );
  } catch (error) {
    console.warn("push notification dispatch failed", error);
  }
}

export function dispatchPushForRpc(functionName, requestBody, result) {
  if (result == null) return;
  if (functionName === "start_call" && requestBody?.p_to) {
    void sendPushEvent("notify_call", {
      p_to: requestBody.p_to,
      call_id: result,
    });
    return;
  }
  if (
    requestBody?.p_to &&
    (functionName === "send_chat_message" ||
      functionName === "upload_chat_media")
  ) {
    void sendPushEvent("notify_message", {
      p_to: requestBody.p_to,
      message_id: result,
    });
    return;
  }
  if (functionName === "finish_call" && requestBody?.p_call_id) {
    void sendPushEvent("notify_call_end", {
      call_id: requestBody.p_call_id,
    });
    return;
  }
  if (
    functionName === "answer_call" &&
    requestBody?.p_call_id &&
    requestBody?.p_accept === false
  ) {
    void sendPushEvent("notify_call_end", {
      call_id: requestBody.p_call_id,
    });
  }
}
