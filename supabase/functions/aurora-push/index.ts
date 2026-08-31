import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";
import webpush from "npm:web-push@3.6.7";

const PROD_ORIGIN = "https://aurora-call.vercel.app";
const APP_ICON = `${PROD_ORIGIN}/aurora-call-logo.png`;

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
      p_bucket: `push:${action}:${userId}`,
      p_limit: count,
      p_window: "1 hour",
    })
    .throwOnError();
}

async function vapidKeys() {
  const { data, error } = await db
    .from("aurora_push_config")
    .select("key,value")
    .in("key", ["vapid_public_key", "vapid_private_key"]);
  if (error) throw error;
  const values = Object.fromEntries(
    (data ?? []).map((row) => [row.key, row.value]),
  );
  if (!values.vapid_public_key || !values.vapid_private_key)
    throw new Error("vapid_not_configured");
  return values;
}

type NotificationData = {
  type: "call" | "message";
  url: string;
  call_id?: string;
  friend_id?: string;
  friend_name?: string;
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
    // Flat fields keep existing service workers working until iOS installs the
    // updated worker. New WebKit versions consume the declarative block.
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

async function sendToUser(
  userId: string,
  payload: ReturnType<typeof declarativePayload>,
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
      !["subscribe", "unsubscribe", "notify_call", "notify_message"].includes(
        action,
      )
    )
      return json(req, { error: "unknown_action" }, 400);

    const userId = await currentUser(body?.p_token || null);
    if (!userId) return json(req, { error: "unauthorized" }, 401);

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
      const delivered = await sendToUser(
        recipientId,
        declarativePayload({
          title: `${senderName} звонит вам`,
          body:
            call.mode === "video"
              ? "Видеозвонок Aurora Call"
              : "Аудиозвонок Aurora Call",
          tag: `call-${callId}`,
          data: {
            type: "call",
            url: `/?push=call&call_id=${encodeURIComponent(callId)}`,
            call_id: callId,
            mode: call.mode,
          },
        }),
        120,
      );
      return json(req, { ok: true, delivered });
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
    const delivered = await sendToUser(
      recipientId,
      declarativePayload({
        title: senderName,
        body: "Новое сообщение",
        tag: `message-${message.id}`,
        appBadge: unread,
        data: {
          type: "message",
          url: `/?push=message&friend_id=${encodeURIComponent(userId)}&friend_name=${encodeURIComponent(senderName)}`,
          friend_id: userId,
          friend_name: senderName,
        },
      }),
      86_400,
    );
    return json(req, { ok: true, delivered });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    if (message.includes("rate_limited"))
      return json(req, { error: "rate_limited" }, 429);
    console.error("aurora_push_failed", message);
    return json(req, { error: "push_failed" }, 500);
  }
});
