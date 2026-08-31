import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";
import webpush from "npm:web-push@3.6.7";

const PROD_ORIGIN = "https://aurora-call.vercel.app";
const APP_ICON = `${PROD_ORIGIN}/aurora-call-logo.png`;
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const FIREBASE_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";

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

type AuroraSession = {
  userId: string;
  expiresAt: string;
};

async function currentSession(
  token: string | null,
): Promise<AuroraSession | null> {
  if (!token || !/^[0-9a-f-]{36}$/i.test(token)) return null;
  const { data } = await db
    .from("call_sessions")
    .select("user_id,expires_at")
    .eq("token", token)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (!data?.user_id || !data?.expires_at) return null;
  return {
    userId: String(data.user_id),
    expiresAt: String(data.expires_at),
  };
}

async function limit(userId: string, action: string, count: number) {
  await db
    .rpc("aurora_rate_limit", {
      p_bucket: `push:${action}:${userId}`,
      p_limit: count,
      p_window: "1 hour",
    })
    .throwOnError();
}

async function configValues(keys: string[]) {
  const { data, error } = await db
    .from("aurora_push_config")
    .select("key,value")
    .in("key", keys);
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((row) => [row.key, row.value]));
}

async function vapidKeys() {
  const values = await configValues(["vapid_public_key", "vapid_private_key"]);
  if (!values.vapid_public_key || !values.vapid_private_key)
    throw new Error("vapid_not_configured");
  return values;
}

type FirebaseServiceAccount = {
  project_id: string;
  client_email: string;
  private_key: string;
};

async function firebaseServiceAccount(): Promise<FirebaseServiceAccount | null> {
  const values = await configValues(["firebase_service_account_json"]);
  if (!values.firebase_service_account_json) return null;
  try {
    const parsed = JSON.parse(values.firebase_service_account_json);
    if (!parsed?.project_id || !parsed?.client_email || !parsed?.private_key)
      return null;
    return {
      project_id: String(parsed.project_id),
      client_email: String(parsed.client_email),
      private_key: String(parsed.private_key),
    };
  } catch {
    return null;
  }
}

function base64UrlBytes(bytes: Uint8Array) {
  let binary = "";
  for (const value of bytes) binary += String.fromCharCode(value);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function base64UrlText(value: string) {
  return base64UrlBytes(new TextEncoder().encode(value));
}

async function importPrivateKey(pem: string) {
  const raw = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const binary = atob(raw);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    bytes,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

let cachedGoogleAccessToken = "";
let cachedGoogleAccessTokenUntil = 0;

async function googleAccessToken(account: FirebaseServiceAccount) {
  if (
    cachedGoogleAccessToken &&
    cachedGoogleAccessTokenUntil > Date.now() + 30_000
  )
    return cachedGoogleAccessToken;

  const issuedAt = Math.floor(Date.now() / 1000);
  const header = base64UrlText(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64UrlText(
    JSON.stringify({
      iss: account.client_email,
      scope: FIREBASE_SCOPE,
      aud: GOOGLE_TOKEN_URL,
      iat: issuedAt,
      exp: issuedAt + 3600,
    }),
  );
  const unsigned = `${header}.${claims}`;
  const privateKey = await importPrivateKey(account.private_key);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(unsigned),
  );
  const assertion = `${unsigned}.${base64UrlBytes(new Uint8Array(signature))}`;
  const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!tokenResponse.ok) throw new Error("firebase_auth_failed");
  const tokenPayload = await tokenResponse.json();
  if (!tokenPayload?.access_token) throw new Error("firebase_auth_failed");
  cachedGoogleAccessToken = String(tokenPayload.access_token);
  const expiresIn = Math.max(60, Number(tokenPayload.expires_in) || 3600);
  cachedGoogleAccessTokenUntil = Date.now() + (expiresIn - 60) * 1000;
  return cachedGoogleAccessToken;
}

type NotificationData = {
  type: "call" | "message" | "call_end";
  url: string;
  call_id?: string;
  friend_id?: string;
  friend_name?: string;
  caller_name?: string;
  mode?: string;
};

function declarativePayload({
  title,
  body,
  tag,
  data,
  appBadge,
}: {
  title: string;
  body: string;
  tag: string;
  data: NotificationData;
  appBadge?: number;
}) {
  return {
    title,
    body,
    tag,
    ...data,
    web_push: 8030,
    notification: {
      title,
      body,
      navigate: new URL(data.url, PROD_ORIGIN).href,
      tag,
      lang: "ru",
      dir: "auto",
      silent: false,
      icon: APP_ICON,
      badge: APP_ICON,
      ...(Number.isFinite(appBadge)
        ? { app_badge: String(Math.max(0, Math.min(999, appBadge!))) }
        : {}),
      data,
    },
  };
}

async function sendWebPushToUser(
  userId: string,
  payload: Record<string, unknown>,
  ttl: number,
) {
  const keys = await vapidKeys();
  webpush.setVapidDetails(
    "mailto:support@auroracall.net",
    keys.vapid_public_key,
    keys.vapid_private_key,
  );
  const { data: subscriptions, error } = await db
    .from("aurora_push_subscriptions")
    .select("id,endpoint,p256dh,auth")
    .eq("user_id", userId);
  if (error) throw error;
  const stale: string[] = [];
  let delivered = 0;
  await Promise.all(
    (subscriptions ?? []).map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify(payload),
          { TTL: ttl },
        );
        delivered += 1;
      } catch (error: any) {
        if (error?.statusCode === 404 || error?.statusCode === 410)
          stale.push(sub.id);
        else
          console.error(
            "aurora_push_send_failed",
            error?.statusCode || "unknown",
          );
      }
    }),
  );
  if (stale.length)
    await db.from("aurora_push_subscriptions").delete().in("id", stale);
  return delivered;
}

function stringData(data: NotificationData) {
  return Object.fromEntries(
    Object.entries(data)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [key, String(value)]),
  );
}

async function sendNativeToUser(
  userId: string,
  data: NotificationData,
  ttl: number,
  highPriority: boolean,
) {
  const account = await firebaseServiceAccount();
  if (!account) return 0;
  const { data: devices, error } = await db
    .from("aurora_native_devices")
    .select("id,device_token")
    .eq("user_id", userId)
    .eq("platform", "android")
    .gt("session_expires_at", new Date().toISOString());
  if (error) throw error;
  if (!devices?.length) return 0;

  const accessToken = await googleAccessToken(account);
  const stale: string[] = [];
  let delivered = 0;
  await Promise.all(
    devices.map(async (device) => {
      try {
        const response = await fetch(
          `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(account.project_id)}/messages:send`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              message: {
                token: device.device_token,
                data: stringData(data),
                android: {
                  priority: highPriority ? "HIGH" : "NORMAL",
                  ttl: `${Math.max(0, Math.floor(ttl))}s`,
                },
              },
            }),
          },
        );
        if (response.ok) {
          delivered += 1;
          return;
        }
        const responseText = await response.text().catch(() => "");
        if (responseText.includes("UNREGISTERED")) stale.push(device.id);
        else
          console.error(
            "aurora_fcm_send_failed",
            response.status,
            responseText.slice(0, 500),
          );
      } catch (error) {
        console.error(
          "aurora_fcm_send_failed",
          error instanceof Error ? error.message : "unknown",
        );
      }
    }),
  );
  if (stale.length)
    await db.from("aurora_native_devices").delete().in("id", stale);
  return delivered;
}

async function deliverToUser(
  userId: string,
  webPayload: Record<string, unknown>,
  nativeData: NotificationData,
  ttl: number,
  highPriority: boolean,
) {
  const [web, native] = await Promise.all([
    sendWebPushToUser(userId, webPayload, ttl),
    sendNativeToUser(userId, nativeData, ttl, highPriority),
  ]);
  return { web, native, total: web + native };
}

async function unreadMessageCount(userId: string) {
  const { count, error } = await db
    .from("chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", userId)
    .is("read_at", null);
  if (error) throw error;
  return Math.max(0, Math.min(999, count ?? 0));
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
  if (contentLength > 64 * 1024)
    return json(req, { error: "request_too_large" }, 413);

  try {
    const body = await req.json();
    const action = String(body?.action || "");
    if (
      ![
        "subscribe",
        "unsubscribe",
        "subscribe_native",
        "unsubscribe_native",
        "notify_call",
        "notify_message",
        "notify_call_end",
      ].includes(action)
    )
      return json(req, { error: "unknown_action" }, 400);

    const session = await currentSession(body?.p_token || null);
    if (!session) return json(req, { error: "unauthorized" }, 401);
    const userId = session.userId;

    await limit(userId, action, action.startsWith("notify_") ? 240 : 30);

    if (action === "subscribe") {
      const sub = body.subscription;
      if (
        !sub?.endpoint ||
        !sub?.keys?.p256dh ||
        !sub?.keys?.auth ||
        String(sub.endpoint).length > 2048
      )
        return json(req, { error: "invalid_subscription" }, 400);
      const { error } = await db.from("aurora_push_subscriptions").upsert(
        {
          user_id: userId,
          endpoint: String(sub.endpoint),
          p256dh: String(sub.keys.p256dh).slice(0, 512),
          auth: String(sub.keys.auth).slice(0, 512),
          user_agent: String(body.user_agent || "").slice(0, 500),
          updated_at: new Date().toISOString(),
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "endpoint" },
      );
      if (error) throw error;
      return json(req, { ok: true });
    }

    if (action === "unsubscribe") {
      if (body.endpoint)
        await db
          .from("aurora_push_subscriptions")
          .delete()
          .eq("endpoint", String(body.endpoint).slice(0, 2048))
          .eq("user_id", userId);
      return json(req, { ok: true });
    }

    if (action === "subscribe_native") {
      const deviceToken = String(body.device_token || "").trim();
      if (deviceToken.length < 20 || deviceToken.length > 4096)
        return json(req, { error: "invalid_device_token" }, 400);
      const { error } = await db.from("aurora_native_devices").upsert(
        {
          user_id: userId,
          platform: "android",
          device_token: deviceToken,
          installation_id:
            String(body.installation_id || "").slice(0, 200) || null,
          app_version: String(body.app_version || "").slice(0, 80) || null,
          device_model: String(body.device_model || "").slice(0, 200) || null,
          session_expires_at: session.expiresAt,
          updated_at: new Date().toISOString(),
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "device_token" },
      );
      if (error) throw error;
      return json(req, { ok: true });
    }

    if (action === "unsubscribe_native") {
      const deviceToken = String(body.device_token || "").trim();
      if (deviceToken)
        await db
          .from("aurora_native_devices")
          .delete()
          .eq("device_token", deviceToken.slice(0, 4096))
          .eq("user_id", userId);
      return json(req, { ok: true });
    }

    const { data: sender } = await db
      .from("call_users")
      .select("username")
      .eq("id", userId)
      .maybeSingle();
    const senderName = sender?.username || "Aurora Call";

    if (action === "notify_call") {
      const callId = body.call_id;
      const recipientId = body.p_to;
      const { data: call } = await db
        .from("call_history")
        .select("call_id,caller_id,callee_id,mode,status")
        .eq("call_id", callId)
        .eq("caller_id", userId)
        .eq("callee_id", recipientId)
        .in("status", ["started", "answered"])
        .maybeSingle();
      if (!call) return json(req, { error: "call_not_found" }, 404);
      const nativeData: NotificationData = {
        type: "call",
        url: `/?push=call&call_id=${encodeURIComponent(callId)}`,
        call_id: String(callId),
        caller_name: senderName,
        mode: call.mode,
      };
      const delivery = await deliverToUser(
        recipientId,
        declarativePayload({
          title: `${senderName} звонит вам`,
          body:
            call.mode === "video"
              ? "Видеозвонок Aurora Call"
              : "Аудиозвонок Aurora Call",
          tag: `call-${callId}`,
          data: nativeData,
        }),
        nativeData,
        120,
        true,
      );
      return json(req, {
        ok: true,
        delivered: delivery.total,
        web_delivered: delivery.web,
        native_delivered: delivery.native,
      });
    }

    if (action === "notify_call_end") {
      const callId = String(body.call_id || "");
      if (!/^[0-9a-f-]{36}$/i.test(callId))
        return json(req, { error: "invalid_call_id" }, 400);
      const { data: call } = await db
        .from("call_history")
        .select("call_id,caller_id,callee_id")
        .eq("call_id", callId)
        .or(`caller_id.eq.${userId},callee_id.eq.${userId}`)
        .maybeSingle();
      if (!call) return json(req, { error: "call_not_found" }, 404);
      const recipientId =
        call.caller_id === userId ? call.callee_id : call.caller_id;
      const nativeData: NotificationData = {
        type: "call_end",
        url: "/",
        call_id: callId,
      };
      const delivery = await deliverToUser(
        recipientId,
        nativeData,
        nativeData,
        120,
        true,
      );
      return json(req, {
        ok: true,
        delivered: delivery.total,
        web_delivered: delivery.web,
        native_delivered: delivery.native,
      });
    }

    const messageId = Number(body.message_id);
    const recipientId = body.p_to;
    const { data: message } = await db
      .from("chat_messages")
      .select("id,sender_id,recipient_id,kind")
      .eq("id", messageId)
      .eq("sender_id", userId)
      .eq("recipient_id", recipientId)
      .maybeSingle();
    if (!message) return json(req, { error: "message_not_found" }, 404);
    const unread = await unreadMessageCount(recipientId);
    const nativeData: NotificationData = {
      type: "message",
      url: `/?push=message&friend_id=${encodeURIComponent(userId)}&friend_name=${encodeURIComponent(senderName)}`,
      friend_id: userId,
      friend_name: senderName,
    };
    const delivery = await deliverToUser(
      recipientId,
      declarativePayload({
        title: senderName,
        body: "Новое сообщение",
        tag: `message-${message.id}`,
        appBadge: unread,
        data: nativeData,
      }),
      nativeData,
      86_400,
      true,
    );
    return json(req, {
      ok: true,
      delivered: delivery.total,
      web_delivered: delivery.web,
      native_delivered: delivery.native,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    if (message.includes("rate_limited"))
      return json(req, { error: "rate_limited" }, 429);
    console.error("aurora_push_failed", message);
    return json(req, { error: "push_failed" }, 500);
  }
});
