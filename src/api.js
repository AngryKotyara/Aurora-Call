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

export async function rpc(functionName, body, policy = {}) {
  const response = await resilientFetch(config.rpcBaseUrl + functionName, {
    method: "POST",
    headers: {
      apikey: config.supabasePublishableKey,
      "Content-Type": "application/json",
      "X-Client-Info": "aurora-call-web/1",
    },
    body: JSON.stringify(body),
  }, { retries: policy.retries ?? 1, timeoutMs: policy.timeoutMs ?? 15000 });

  const responseBody = await response.text();
  if (!response.ok) throw new Error(getErrorMessage(responseBody));
  return responseBody ? JSON.parse(responseBody) : null;
}
