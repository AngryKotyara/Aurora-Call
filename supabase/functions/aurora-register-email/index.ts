import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";

const DEFAULT_ORIGIN = "https://auroracall.net";
const PROD_ORIGIN = Deno.env.get("AURORA_APP_ORIGIN") || DEFAULT_ORIGIN;

function allowedOrigin(origin: string) {
  return (
    origin === PROD_ORIGIN ||
    origin === "https://aurora-call.vercel.app" ||
    /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)
  );
}

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": allowedOrigin(origin) ? origin : PROD_ORIGIN,
    "Access-Control-Allow-Headers": "content-type,apikey,x-client-info",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    Vary: "Origin",
    "X-Content-Type-Options": "nosniff",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: cors(req) });
}

function normalizeUsername(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeEmail(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function validUsername(value: string) {
  return /^[\p{L}\p{N}_]{3,24}$/u.test(value);
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

function generateAccessKey() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
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
  const origin = req.headers.get("origin");
  if (origin && !allowedOrigin(origin)) {
    return json(req, { error: "forbidden" }, 403);
  }
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors(req) });
  }
  if (req.method !== "POST") {
    return json(req, { error: "method_not_allowed" }, 405);
  }

  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > 4096) {
    return json(req, { error: "request_too_large" }, 413);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail =
    Deno.env.get("AURORA_FROM_EMAIL") || "Aurora Call <noreply@auroracall.net>";
  if (!resendKey) return json(req, { error: "mail_not_configured" }, 503);

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json(req, { error: "invalid_json" }, 400);
  }

  const username = normalizeUsername(payload.username);
  const email = normalizeEmail(payload.email);
  if (!validUsername(username)) {
    return json(req, { error: "invalid_username" }, 400);
  }
  if (!validEmail(email)) return json(req, { error: "invalid_email" }, 400);

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
        p_bucket: `register-ip:${addressHash}`,
        p_limit: 20,
        p_window: "1 hour",
      })
      .throwOnError();
    await db
      .rpc("aurora_rate_limit", {
        p_bucket: `register-email:${email}`,
        p_limit: 5,
        p_window: "30 minutes",
      })
      .throwOnError();
    await db
      .rpc("aurora_rate_limit", {
        p_bucket: `register-name:${username}`,
        p_limit: 5,
        p_window: "30 minutes",
      })
      .throwOnError();
  } catch {
    return json(req, { error: "rate_limited" }, 429);
  }

  const accessKey = generateAccessKey();
  const accessHash = await sha256(accessKey);
  const { data: user, error: insertError } = await db
    .from("call_users")
    .insert({ username, email, access_hash: accessHash })
    .select("id")
    .single();

  if (insertError) {
    if (insertError.code === "23505") {
      return json(req, { error: "registration_unavailable" }, 409);
    }
    console.error("aurora_registration_insert_failed", insertError.code);
    return json(req, { error: "registration_failed" }, 500);
  }

  const mailResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [email],
      subject: "Ваш пароль Aurora Call",
      html: `<!doctype html><html><body style="margin:0;background:#07070c;color:#fff;font-family:Arial,sans-serif"><div style="max-width:560px;margin:0 auto;padding:40px 24px"><div style="font-size:26px;font-weight:700;margin-bottom:28px">Aurora Call</div><h1 style="font-size:25px;margin:0 0 14px">Регистрация завершена</h1><p style="color:#b9b9c7;line-height:1.6">Здравствуйте, ${username}. Используйте этот пароль для входа в Aurora Call:</p><div style="margin:24px 0;padding:18px 20px;border-radius:16px;background:#151520;border:1px solid #343449;font-family:monospace;font-size:18px;letter-spacing:.04em;word-break:break-all">${accessKey}</div><p style="color:#8f90a0;font-size:13px;line-height:1.6">Сохраните пароль в безопасном месте. Aurora Call хранит только его криптографический хэш.</p></div></body></html>`,
      text: `Aurora Call\n\nЗдравствуйте, ${username}.\n\nВаш пароль для входа: ${accessKey}\n\nСохраните его в безопасном месте.`,
    }),
  });

  if (!mailResponse.ok) {
    console.error("aurora_email_delivery_failed", mailResponse.status);
    await db.from("call_users").delete().eq("id", user.id);
    return json(req, { error: "email_delivery_failed" }, 502);
  }

  return json(req, { ok: true, email });
});
