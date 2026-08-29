const SUPABASE_URL = "https://taqpirplpmjihmkztwlv.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_ciRXzMnLGCYUm-u-esWIOA_v6XjUEuu";
export const SESSION_COOKIE = "__Host-aurora_session";

export function parseCookies(header = "") {
  const result = {};
  for (const part of String(header).split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!key) continue;
    try {
      result[key] = decodeURIComponent(value);
    } catch {
      result[key] = value;
    }
  }
  return result;
}

export function readSessionToken(req) {
  const token = parseCookies(req.headers.cookie || "")[SESSION_COOKIE] || "";
  return /^[0-9a-f-]{36}$/i.test(token) ? token : null;
}

export function setSessionCookie(res, token, maxAge = 86400) {
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`,
  );
}

export function clearSessionCookie(res) {
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`,
  );
}

export function noStore(res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

export function sameOriginRequest(req) {
  const fetchSite = String(req.headers["sec-fetch-site"] || "").toLowerCase();
  if (fetchSite === "cross-site") return false;

  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const host = String(
      req.headers["x-forwarded-host"] || req.headers.host || "",
    ).toLowerCase();
    return new URL(origin).host.toLowerCase() === host;
  } catch {
    return false;
  }
}

export function requestBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string" && req.body.length <= 1024 * 1024) {
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  }
  return null;
}

export async function supabaseRpc(name, body) {
  return fetch(`${SUPABASE_URL}/rest/v1/rpc/${encodeURIComponent(name)}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
      "X-Client-Info": "aurora-call-server/1",
    },
    body: JSON.stringify(body),
  });
}

export async function supabaseFunction(name, body, extraHeaders = {}) {
  return fetch(`${SUPABASE_URL}/functions/v1/${encodeURIComponent(name)}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
      "X-Client-Info": "aurora-call-server/1",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
}

export async function relayResponse(upstream, res) {
  noStore(res);
  const text = await upstream.text();
  res.status(upstream.status);
  const contentType = upstream.headers.get("content-type");
  if (contentType) res.setHeader("Content-Type", contentType);
  res.send(text);
}
