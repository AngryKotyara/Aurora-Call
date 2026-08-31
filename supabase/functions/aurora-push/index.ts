import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";
import webpush from "npm:web-push@3.6.7";

const PROD_ORIGIN =
  Deno.env.get("AURORA_APP_ORIGIN") || "https://auroracall.net";
const LEGACY_ORIGIN = "https://aurora-call.vercel.app";
const APP_ICON = `${PROD_ORIGIN}/aurora-call-logo.png`;

function allowedOrigin(origin: string) {
  return (
    origin === PROD_ORIGIN ||
    origin === LEGACY_ORIGIN ||
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

type NotificationData = {
  type: "call" | "message" | "call_end";
  url: string;
  call_id?: string;
  friend_id?: string;
  friend_name?: string;
  caller_name?: string;
  mode?: string;
};

type UnifiedPushRegistration = {
  endpoint: string;
  p256dh: string;
  auth: string;
  temporary: boolean;
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

async function configureWebPush() {
  const keys = await vapidKeys();
  webpush.setVapidDetails(
    "mailto:support@auroracall.net",
    keys.vapid_public_key,
    keys.vapid_private_key,
  );
}

async function sendWebPushToUser(
  userId: string,
  payload: Record<string, unknown>,
  ttl: number,
) {
  await configureWebPush();
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

function decodeBase64Url(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const normalized = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized);
  return new TextDecoder().decode(
    Uint8Array.from(binary, (char) => char.charCodeAt(0)),
  );
}

function parseUnifiedPushToken(value: string): UnifiedPushRegistration | null {
  try {
    const parsed = JSON.parse(decodeBase64Url(value));
    if (parsed?.provider !== "unifiedpush" || parsed?.v !== 1) return null;
    const endpoint = String(parsed.endpoint || "");
    const p256dh = String(parsed.p256dh || "");
    const auth = String(parsed.auth || "");
    if (
      endpoint.length < 20 ||
      endpoint.length > 1200 ||
      p256dh.length < 40 ||
      p256dh.length > 200 ||
      auth.length < 16 ||
      auth.length > 200
    )
      return null;
    return {
      endpoint,
      p256dh,
      auth,
      temporary: Boolean(parsed.temporary),
    };
  } catch {
    return null;
  }
}

async function unifiedPushEndpointAllowed(endpoint: string) {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password) return false;
  const values = await configValues(["unifiedpush_allowed_hosts"]);
  const allowed = String(values.unifiedpush_allowed_hosts || "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  if (!allowed.length) return false;
  return allowed.includes(url.hostname.toLowerCase());
}

async function sendNativeToUser(
  userId: string,
  data: NotificationData,
  ttl: number,
) {
  await configureWebPush();
  const { data: devices, error } = await db
    .from("aurora_native_devices")
    .select("id,push_endpoint,p256dh,auth")
    .eq("user_id", userId)
    .eq("platform", "android")
    .eq("push_provider", "unifiedpush")
    .gt("session_expires_at", new Date().toISOString());
  if (error) throw error;
  const stale: string[] = [];
  let delivered = 0;
  await Promise.all(
    (devices ?? []).map(async (device) => {
      if (!device.push_endpoint || !device.p256dh || !device.auth) {
        stale.push(device.id);
        return;
      }
      try {
        await webpush.sendNotification(
          {
            endpoint: device.push_endpoint,
            keys: { p256dh: device.p256dh, auth: device.auth },
          },
          JSON.stringify(data),
          { TTL: ttl },
        );
        delivered += 1;
      } catch (error: any) {
        if (error?.statusCode === 404 || error?.statusCode === 410)
          stale.push(device.id);
        else
          console.error(
            "aurora_unifiedpush_send_failed",
            error?.statusCode || "unknown",
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
) {
  const [web, native] = await Promise.all([
    sendWebPushToUser(userId, webPayload, ttl),
    sendNativeToUser(userId, nativeData, ttl),
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
      const registration = parseUnifiedPushToken(deviceToken);
      if (
        !registration ||
        !(await unifiedPushEndpointAllowed(registration.endpoint))
      )
        return json(req, { error: "invalid_unifiedpush_endpoint" }, 400);
      const { error } = await db.from("aurora_native_devices").upsert(
        {
          user_id: userId,
          platform: "android",
          push_provider: "unifiedpush",
          device_token: deviceToken,
          push_endpoint: registration.endpoint,
          p256dh: registration.p256dh,
          auth: registration.auth,
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
      return json(req, { ok: true, provider: "unifiedpush" });
    }

    if (action === "unsubscribe_native") {
      const deviceToken = String(body.device_token || "").trim();
      if (deviceToken)
        await db
          .from("aurora_native_devices")
          .delete()
          .eq("device_token", deviceToken.slice(0, 4096))
          .eq("user_id", userId)
          .eq("platform", "android");
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
