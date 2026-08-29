import {
  noStore,
  requestBody,
  sameOriginRequest,
  setSessionCookie,
  supabaseFunction,
} from "../server/aurora.js";

export default async function handler(req, res) {
  noStore(res);
  if (req.method !== "POST")
    return res.status(405).json({ error: "method_not_allowed" });
  if (!sameOriginRequest(req))
    return res.status(403).json({ error: "forbidden" });

  const body = requestBody(req);
  const username = String(body?.username || "").trim();
  const accessKey = String(body?.accessKey || "");
  if (!username || !accessKey || accessKey.length > 256)
    return res.status(400).json({ error: "invalid_request" });

  const forwardedFor = String(req.headers["x-forwarded-for"] || "")
    .split(",")[0]
    .trim();
  const upstream = await supabaseFunction(
    "aurora-auth",
    { username, accessKey },
    forwardedFor ? { "x-forwarded-for": forwardedFor } : {},
  );
  const payload = await upstream.json().catch(() => ({}));
  if (!upstream.ok || !payload?.token)
    return res
      .status(upstream.status || 401)
      .json({ error: payload?.error || "login_failed" });

  setSessionCookie(res, payload.token, 86400);
  return res.status(200).json({
    user_id: payload.user_id,
    username: payload.username,
    token: true,
    expires_at: payload.expires_at,
  });
}
