import {
  noStore,
  requestBody,
  sameOriginRequest,
  setSessionCookie,
  supabaseRpc,
} from "../server/aurora.js";

export default async function handler(req, res) {
  noStore(res);
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  if (!sameOriginRequest(req)) return res.status(403).json({ error: "forbidden" });

  const body = requestBody(req);
  const token = String(body?.token || "");
  if (!/^[0-9a-f-]{36}$/i.test(token))
    return res.status(400).json({ error: "invalid_session" });

  const probe = await supabaseRpc("list_call_friends", { p_token: token });
  if (!probe.ok) return res.status(401).json({ error: "invalid_session" });

  setSessionCookie(res, token, 86400);
  return res.status(200).json({ ok: true });
}
