import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";

const PROD_ORIGIN = "https://aurora-call.vercel.app";
const DEFAULT_TURN_PORT = 3478;
const DEFAULT_TURNS_PORT = 5349;
const CREDENTIAL_TTL_SECONDS = 10 * 60;

function allowedOrigin(origin: string) {
  return (
    origin === PROD_ORIGIN ||
    /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)
  );
}

function headers(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": allowedOrigin(origin) ? origin : PROD_ORIGIN,
    "Access-Control-Allow-Headers": "apikey,content-type,x-client-info",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    Vary: "Origin",
    "X-Content-Type-Options": "nosniff",
  };
}

const respond = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: headers(req) });

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

async function sessionUser(token: string | null) {
  if (!token || !/^[0-9a-f-]{36}$/i.test(token)) return null;
  const { data } = await db
    .from("call_sessions")
    .select("user_id")
    .eq("token", token)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  return data?.user_id ? String(data.user_id) : null;
}

async function configValues(keys: string[]) {
  const { data, error } = await db
    .from("aurora_push_config")
    .select("key,value")
    .in("key", keys);
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((row) => [row.key, row.value]));
}

async function hmacSha1Base64(secret: string, username: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(username)),
  );
  let binary = "";
  for (const byte of signature) binary += String.fromCharCode(byte);
  return btoa(binary);
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (origin && !allowedOrigin(origin))
    return respond(req, { error: "forbidden" }, 403);
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers: headers(req) });
  if (req.method !== "POST")
    return respond(req, { error: "method_not_allowed" }, 405);

  try {
    const body = await req.json();
    const userId = await sessionUser(body?.p_token || null);
    if (!userId) return respond(req, { error: "unauthorized" }, 401);

    await db
      .rpc("aurora_rate_limit", {
        p_bucket: `turn:credentials:${userId}`,
        p_limit: 120,
        p_window: "1 hour",
      })
      .throwOnError();

    const values = await configValues(["turn_host", "turn_shared_secret"]);
    const host = String(values.turn_host || "").trim().toLowerCase();
    const secret = String(values.turn_shared_secret || "");
    if (!/^[a-z0-9.-]+$/.test(host) || secret.length < 32)
      return respond(req, { error: "turn_not_configured" }, 503);

    const expiresUnix =
      Math.floor(Date.now() / 1000) + CREDENTIAL_TTL_SECONDS;
    const username = `${expiresUnix}:${userId}`;
    const credential = await hmacSha1Base64(secret, username);

    return respond(req, {
      ice_servers: [
        { urls: `stun:${host}:${DEFAULT_TURN_PORT}` },
        {
          urls: [
            `turn:${host}:${DEFAULT_TURN_PORT}?transport=udp`,
            `turn:${host}:${DEFAULT_TURN_PORT}?transport=tcp`,
            `turns:${host}:${DEFAULT_TURNS_PORT}?transport=tcp`,
          ],
          username,
          credential,
        },
      ],
      expires_at: new Date(expiresUnix * 1000).toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    if (message.includes("rate_limited"))
      return respond(req, { error: "rate_limited" }, 429);
    console.error("aurora_turn_credentials_failed", message);
    return respond(req, { error: "turn_credentials_failed" }, 500);
  }
});
