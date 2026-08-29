import {
  clearSessionCookie,
  noStore,
  readSessionToken,
  sameOriginRequest,
  supabaseRpc,
} from "../server/aurora.js";

export default async function handler(req, res) {
  noStore(res);
  if (req.method !== "POST")
    return res.status(405).json({ error: "method_not_allowed" });
  if (!sameOriginRequest(req))
    return res.status(403).json({ error: "forbidden" });

  const token = readSessionToken(req);
  if (token) {
    await supabaseRpc("revoke_call_session", { p_token: token }).catch(
      () => null,
    );
  }
  clearSessionCookie(res);
  return res.status(200).json({ ok: true });
}
