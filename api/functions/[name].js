import {
  noStore,
  readSessionToken,
  relayResponse,
  requestBody,
  sameOriginRequest,
  supabaseFunction,
} from "../../server/aurora.js";

const ALLOWED = new Set(["aurora-push", "aurora-chat-media"]);

export default async function handler(req, res) {
  noStore(res);
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  if (!sameOriginRequest(req)) return res.status(403).json({ error: "forbidden" });

  const name = String(req.query?.name || "");
  if (!ALLOWED.has(name)) return res.status(404).json({ error: "function_not_allowed" });

  const token = readSessionToken(req);
  if (!token) return res.status(401).json({ error: "invalid_session" });

  const body = requestBody(req);
  if (!body || Array.isArray(body)) return res.status(400).json({ error: "invalid_request" });

  const upstream = await supabaseFunction(name, {
    ...body,
    token,
    p_token: token,
  });
  return relayResponse(upstream, res);
}
