import {
  noStore,
  readSessionToken,
  relayResponse,
  requestBody,
  sameOriginRequest,
  supabaseRpc,
} from "../../server/aurora.js";

// Only the application's authenticated operations are exposed. Legacy
// login_call_user and unrelated RPCs must not be reachable through this proxy.
const ALLOWED = new Set([
  "accept_call_friend_code",
  "answer_call",
  "complete_chat_storage_media",
  "create_call_friend_code",
  "delete_chat_message",
  "edit_chat_message",
  "finish_call",
  "get_call_profile",
  "get_chat_media_secure",
  "get_chat_peer_presence",
  "list_call_friends",
  "list_call_history",
  "list_chat_messages",
  "list_chat_threads",
  "poll_call_signals",
  "poll_incoming_calls",
  "remove_call_friend",
  "send_call_signal",
  "send_chat_message",
  "set_call_avatar",
  "start_call",
  "touch_call_presence",
  "upload_chat_media",
]);

export default async function handler(req, res) {
  noStore(res);
  if (req.method !== "POST")
    return res.status(405).json({ error: "method_not_allowed" });
  if (!sameOriginRequest(req))
    return res.status(403).json({ error: "forbidden" });

  const name = String(req.query?.name || "");
  if (!ALLOWED.has(name))
    return res.status(404).json({ error: "rpc_not_allowed" });

  const token = readSessionToken(req);
  if (!token) return res.status(401).json({ error: "invalid_session" });

  const body = requestBody(req);
  if (!body || Array.isArray(body))
    return res.status(400).json({ error: "invalid_request" });

  const upstream = await supabaseRpc(name, { ...body, p_token: token });
  return relayResponse(upstream, res);
}
