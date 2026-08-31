import { config } from "./config.js";
import { resilientFetch } from "./network.js";

function getErrorMessage(responseBody) {
  try {
    const payload = JSON.parse(responseBody);
    return payload.message || payload.error || "request_failed";
  } catch {
    return "request_failed";
  }
}

function announceExpiredSession() {
  if (typeof document === "undefined") return;
  document.dispatchEvent(new CustomEvent("aurora-session-expired"));
}

async function sendPushEvent(action, body) {
  try {
    await resilientFetch(
      `${config.functionsBaseUrl}aurora-push`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Client-Info": "aurora-call-web/2",
        },
        body: JSON.stringify({ action, ...body }),
      },
      { retries: 0, timeoutMs: 7000 },
    );
  } catch (error) {
    console.warn("push notification dispatch failed", error);
  }
}

function dispatchPushForRpc(functionName, requestBody, result) {
  if (!requestBody?.p_to || result == null) return;
  if (functionName === "start_call") {
    void sendPushEvent("notify_call", {
      p_to: requestBody.p_to,
      call_id: result,
    });
    return;
  }
  if (
    functionName === "send_chat_message" ||
    functionName === "upload_chat_media"
  ) {
    void sendPushEvent("notify_message", {
      p_to: requestBody.p_to,
      message_id: result,
    });
  }
}

export async function rpc(functionName, body, policy = {}) {
  const response = await resilientFetch(
    config.rpcBaseUrl + functionName,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Client-Info": "aurora-call-web/2",
      },
      body: JSON.stringify(body),
    },
    { retries: policy.retries ?? 1, timeoutMs: policy.timeoutMs ?? 15000 },
  );

  const responseBody = await response.text();
  if (!response.ok) {
    const message = getErrorMessage(responseBody);
    if (response.status === 401 || message === "invalid_session")
      announceExpiredSession();
    throw new Error(message);
  }
  const result = responseBody ? JSON.parse(responseBody) : null;
  dispatchPushForRpc(functionName, body, result);
  return result;
}

export async function loginByAccessKey(username, accessKey) {
  const response = await resilientFetch(
    "/api/auth-login",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Client-Info": "aurora-call-web/2",
      },
      body: JSON.stringify({ username, accessKey }),
    },
    { retries: 0, timeoutMs: 15000 },
  );
  const responseBody = await response.text();
  if (!response.ok) throw new Error(getErrorMessage(responseBody));
  return responseBody ? JSON.parse(responseBody) : null;
}

export async function registerByEmail(username, email) {
  const response = await resilientFetch(
    `${config.publicFunctionsBaseUrl}aurora-register-email`,
    {
      method: "POST",
      headers: {
        apikey: config.supabasePublishableKey,
        "Content-Type": "application/json",
        "X-Client-Info": "aurora-call-web/2",
      },
      body: JSON.stringify({ username, email }),
    },
    { retries: 0, timeoutMs: 20000 },
  );

  const responseBody = await response.text();
  if (!response.ok) throw new Error(getErrorMessage(responseBody));
  return responseBody ? JSON.parse(responseBody) : null;
}
