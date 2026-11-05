import { config } from "./config.js";
import { resilientFetch } from "./network.js";
import { dispatchPushForRpc } from "./push/rpc-notifications.js";

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

export async function rpc(functionName, body, policy = {}) {
  const response = await resilientFetch(
    config.rpcBaseUrl + functionName,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Client-Info": "aurora-call-web/3",
      },
      body: JSON.stringify(body),
    },
    { retries: policy.retries ?? (/^(list_|get_|poll_)/.test(functionName) ? 1 : 0), timeoutMs: policy.timeoutMs ?? 15000 },
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
        "X-Client-Info": "aurora-call-web/3",
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
    config.registerEmailUrl,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Client-Info": "aurora-call-web/3",
      },
      body: JSON.stringify({ username, email }),
    },
    { retries: 0, timeoutMs: 20000 },
  );

  const responseBody = await response.text();
  if (!response.ok) throw new Error(getErrorMessage(responseBody));
  return responseBody ? JSON.parse(responseBody) : null;
}
