import {
  noStore,
  requestBody,
  sameOriginRequest,
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
  const email = String(body?.email || "").trim();
  if (!username || !email || username.length > 64 || email.length > 320)
    return res.status(400).json({ error: "invalid_request" });

  const forwardedFor = String(req.headers["x-forwarded-for"] || "")
    .split(",")[0]
    .trim();
  const upstream = await supabaseFunction(
    "aurora-register-email",
    { username, email },
    forwardedFor ? { "x-forwarded-for": forwardedFor } : {},
  );
  const text = await upstream.text();
  res.status(upstream.status);
  const contentType = upstream.headers.get("content-type");
  if (contentType) res.setHeader("Content-Type", contentType);
  return res.send(text);
}
