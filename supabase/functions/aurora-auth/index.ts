import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function normalizeUsername(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > 4096) return json({ error: "request_too_large" }, 413);

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const username = normalizeUsername(payload.username);
  const accessKey = String(payload.accessKey || "");
  if (
    !/^[\p{L}\p{N}_]{3,24}$/u.test(username) ||
    accessKey.length < 20 ||
    accessKey.length > 256
  ) {
    return json({ error: "invalid_credentials" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const clientAddress =
    forwarded || req.headers.get("cf-connecting-ip") || "unknown";
  const addressHash = (await sha256(clientAddress)).slice(0, 24);

  try {
    await db
      .rpc("aurora_rate_limit", {
        p_bucket: `auth-ip:${addressHash}`,
        p_limit: 30,
        p_window: "10 minutes",
      })
      .throwOnError();
    await db
      .rpc("aurora_rate_limit", {
        p_bucket: `auth-name:${username}`,
        p_limit: 12,
        p_window: "10 minutes",
      })
      .throwOnError();
  } catch {
    return json({ error: "rate_limited" }, 429);
  }

  const accessHash = await sha256(accessKey);
  const { data: user, error: userError } = await db
    .from("call_users")
    .select("id,username")
    .eq("username", username)
    .eq("access_hash", accessHash)
    .maybeSingle();

  if (userError || !user) return json({ error: "invalid_credentials" }, 401);

  await db
    .from("call_sessions")
    .delete()
    .eq("user_id", user.id)
    .lte("expires_at", new Date().toISOString());

  const { data: session, error: sessionError } = await db
    .from("call_sessions")
    .insert({ user_id: user.id })
    .select("token,expires_at")
    .single();

  if (sessionError || !session?.token) {
    console.error(
      "aurora_auth_session_failed",
      sessionError?.code || "missing_session",
    );
    return json({ error: "login_failed" }, 500);
  }

  const { data: sessions } = await db
    .from("call_sessions")
    .select("token")
    .eq("user_id", user.id)
    .order("expires_at", { ascending: false })
    .limit(5);
  const keep = new Set((sessions || []).map((item) => item.token));
  const { data: allSessions } = await db
    .from("call_sessions")
    .select("token")
    .eq("user_id", user.id);
  const stale = (allSessions || [])
    .map((item) => item.token)
    .filter((token) => !keep.has(token));
  if (stale.length) {
    await db.from("call_sessions").delete().in("token", stale);
  }

  return json({
    ok: true,
    user_id: user.id,
    username: user.username,
    token: session.token,
    expires_at: session.expires_at,
  });
});
