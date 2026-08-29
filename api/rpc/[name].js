import {
  noStore,
  readSessionToken,
  relayResponse,
  requestBody,
  sameOriginRequest,
  supabaseRpc,
} from "../../server/aurora.js";

const BLOCKED = new Set([
  "login_call_user",
  "record_call_event",
  "aurora_rate_limit",
]);

export default async function handler(req, res) {
  noStore(res);
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  if (!sameOriginRequest(req)) return res.status(403).json({ error: "forbidden" });

  const name = String(req.query?.name || "");
  if (!/^[a-z0-9_]{1,80}$/.test(name) || BLOCKED.has(name))
    return res.status(404).json({ error: "rpc_not_allowed" });

  const token = readSessionToken(req);
  if (!token) return res.status(401).json({ error: "invalid_session" });

  const body = requestBody(req);
  if (!body || Array.isArray(body)) return res.status(400).json({ error: "invalid_request" });

  const upstream = await supabaseRpc(name, { ...body, p_token: token });
  return relayResponse(upstream, res);
}
