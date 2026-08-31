import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";

const PROD_ORIGIN = "https://aurora-call.vercel.app";
const DEFAULT_BUNDLE_ID = "app.auroracall";
const TOKEN_LIFETIME_MS = 50 * 60 * 1000;

function allowedOrigin(origin: string) {
  return (
    origin === PROD_ORIGIN ||
    /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)
  );
}

function cors(req: Request) {
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

const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors(req) });

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(supabaseUrl, serviceRole, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function currentUser(token: string | null) {
  if (!token || !/^[0-9a-f-]{36}$/i.test(token)) return null;
  const { data } = await db
    .from("call_sessions")
    .select("user_id")
    .eq("token", token)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  return data?.user_id ?? null;
}

async function limit(userId: string, action: string, count: number) {
  await db
    .rpc("aurora_rate_limit", {
      p_bucket: `apns:${action}:${userId}`,
      p_limit: count,
      p_window: "1 hour",
    })
    .throwOnError();
}

function base64UrlBytes(bytes: Uint8Array) {
  let binary = "";
  for (const value of bytes) binary += String.fromCharCode(value);
  return btoa(binary)
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlText(value: string) {
  return base64UrlBytes(new TextEncoder().encode(value));
}

type APNSConfig = {
  teamId: string;
  keyId: string;
  privateKey: string;
  bundleId: string;
};

function apnsConfig(): APNSConfig | null {
  const teamId = Deno.env.get("APNS_TEAM_ID")?.trim() || "";
  const keyId = Deno.env.get("APNS_KEY_ID")?.trim() || "";
  const privateKey = (Deno.env.get("APNS_PRIVATE_KEY") || "")
    .replace(/\\n/g, "\n")
    .trim();
  const bundleId =
    Deno.env.get("APNS_BUNDLE_ID")?.trim() || DEFAULT_BUNDLE_ID;
  if (!teamId || !keyId || !privateKey) return null;
  return { teamId, keyId, privateKey, bundleId };
}

async function importECPrivateKey(pem: string) {
  const raw = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const binary = atob(raw);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    bytes,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

let cachedProviderToken = "";
let cachedProviderTokenUntil = 0;
let cachedProviderIdentity = "";

async function providerToken(config: APNSConfig) {
  const identity = `${config.teamId}:${config.keyId}:${config.privateKey.length}`;
  if (
    cachedProviderToken &&
    cachedProviderIdentity === identity &&
    cachedProviderTokenUntil > Date.now()
  ) {
    return cachedProviderToken;
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const header = base64UrlText(
    JSON.stringify({ alg: "ES256", kid: config.keyId }),
  );
  const claims = base64UrlText(
    JSON.stringify({ iss: config.teamId, iat: issuedAt }),
  );
  const unsigned = `${header}.${claims}`;
  const key = await importECPrivateKey(config.privateKey);
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(unsigned),
  );
  cachedProviderToken = `${unsigned}.${base64UrlBytes(new Uint8Array(signature))}`;
  cachedProviderTokenUntil = Date.now() + TOKEN_LIFETIME_MS;
  cachedProviderIdentity = identity;
  return cachedProviderToken;
}

function apnsHost(environment: string) {
  return environment === "development"
    ? "https://api.sandbox.push.apple.com"
    : "https://api.push.apple.com";
}

async function sendVoIPPush({
  deviceToken,
  environment,
  payload,
  config,
}: {
  deviceToken: string;
  environment: string;
  payload: Record<string, unknown>;
  config: APNSConfig;
}) {
  const token = await providerToken(config);
  const response = await fetch(
    `${apnsHost(environment)}/3/device/${encodeURIComponent(deviceToken)}`,
    {
      method: "POST",
      headers: {
        authorization: `bearer ${token}`,
        "apns-topic": `${config.bundleId}.voip`,
        "apns-push-type": "voip",
        "apns-priority": "10",
        "apns-expiration": "0",
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );
  const responseBody = await response.text().catch(() => "");
  let reason = "";
  try {
    reason = String(JSON.parse(responseBody || "{}")?.reason || "");
  } catch {
    reason = "";
  }
  return { ok: response.ok, status: response.status, reason };
}

async function sendIncomingCallPush(
  userId: string,
  callId: string,
  callerName: string,
  mode: string,
) {
  const config = apnsConfig();
  if (!config) throw new Error("apns_not_configured");

  const { data: devices, error } = await db
    .from("aurora_native_devices")
    .select("id,device_token,push_environment")
    .eq("user_id", userId)
    .eq("platform", "ios_voip");
  if (error) throw error;
  if (!devices?.length) return 0;

  const stale: string[] = [];
  let delivered = 0;
  await Promise.all(
    devices.map(async (device) => {
      try {
        const result = await sendVoIPPush({
          deviceToken: device.device_token,
          environment: device.push_environment || "production",
          config,
          payload: {
            aps: {},
            type: "call",
            call_id: callId,
            caller_name: callerName,
            mode: mode === "video" ? "video" : "audio",
          },
        });
        if (result.ok) {
          delivered += 1;
          return;
        }
        if (
          result.status === 410 ||
          (result.status === 400 && result.reason === "BadDeviceToken")
        ) {
          stale.push(device.id);
          return;
        }
        console.error(
          "aurora_apns_send_failed",
          result.status,
          result.reason || "unknown",
        );
      } catch (error) {
        console.error(
          "aurora_apns_send_failed",
          error instanceof Error ? error.message : "unknown",
        );
      }
    }),
  );
  if (stale.length)
    await db.from("aurora_native_devices").delete().in("id", stale);
  return delivered;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (origin && !allowedOrigin(origin))
    return json(req, { error: "forbidden" }, 403);
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== "POST")
    return json(req, { error: "method_not_allowed" }, 405);

  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > 32 * 1024)
    return json(req, { error: "request_too_large" }, 413);

  try {
    const body = await req.json();
    const action = String(body?.action || "");
    if (!["subscribe_voip", "unsubscribe_voip", "notify_call"].includes(action))
      return json(req, { error: "unknown_action" }, 400);

    const userId = await currentUser(body?.p_token || body?.token || null);
    if (!userId) return json(req, { error: "unauthorized" }, 401);

    await limit(userId, action, action === "notify_call" ? 240 : 30);

    if (action === "subscribe_voip") {
      const deviceToken = String(body.device_token || "")
        .trim()
        .toLowerCase();
      if (!/^[0-9a-f]{32,512}$/.test(deviceToken))
        return json(req, { error: "invalid_device_token" }, 400);
      const pushEnvironment =
        body.push_environment === "development" ? "development" : "production";
      const { error } = await db.from("aurora_native_devices").upsert(
        {
          user_id: userId,
          platform: "ios_voip",
          device_token: deviceToken,
          push_environment: pushEnvironment,
          installation_id:
            String(body.installation_id || "").slice(0, 200) || null,
          app_version: String(body.app_version || "").slice(0, 80) || null,
          device_model: String(body.device_model || "").slice(0, 200) || null,
          updated_at: new Date().toISOString(),
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "device_token" },
      );
      if (error) throw error;
      return json(req, { ok: true });
    }

    if (action === "unsubscribe_voip") {
      const deviceToken = String(body.device_token || "")
        .trim()
        .toLowerCase();
      if (deviceToken) {
        await db
          .from("aurora_native_devices")
          .delete()
          .eq("device_token", deviceToken.slice(0, 512))
          .eq("platform", "ios_voip")
          .eq("user_id", userId);
      }
      return json(req, { ok: true });
    }

    const callId = String(body.call_id || "");
    const recipientId = String(body.p_to || "");
    if (
      !/^[0-9a-f-]{36}$/i.test(callId) ||
      !/^[0-9a-f-]{36}$/i.test(recipientId)
    ) {
      return json(req, { error: "invalid_call" }, 400);
    }

    const { data: call } = await db
      .from("call_history")
      .select("call_id,caller_id,callee_id,mode,status")
      .eq("call_id", callId)
      .eq("caller_id", userId)
      .eq("callee_id", recipientId)
      .in("status", ["started", "answered"])
      .maybeSingle();
    if (!call) return json(req, { error: "call_not_found" }, 404);

    const { data: sender } = await db
      .from("call_users")
      .select("username")
      .eq("id", userId)
      .maybeSingle();
    const delivered = await sendIncomingCallPush(
      recipientId,
      callId,
      sender?.username || "Aurora Call",
      call.mode || "audio",
    );
    return json(req, { ok: true, delivered });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    if (message.includes("rate_limited"))
      return json(req, { error: "rate_limited" }, 429);
    if (message === "apns_not_configured")
      return json(req, { error: "apns_not_configured" }, 503);
    console.error("aurora_apns_failed", message);
    return json(req, { error: "apns_failed" }, 500);
  }
});
