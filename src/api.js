import { config } from "./config.js";

function getErrorMessage(responseBody) {
  try {
    const payload = JSON.parse(responseBody);
    return payload.message || payload.error || "request_failed";
  } catch {
    return "request_failed";
  }
}

export async function rpc(functionName, body) {
  const response = await fetch(config.rpcBaseUrl + functionName, {
    method: "POST",
    headers: {
      apikey: config.supabasePublishableKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const responseBody = await response.text();

  if (!response.ok) {
    throw new Error(getErrorMessage(responseBody));
  }

  return responseBody ? JSON.parse(responseBody) : null;
}
