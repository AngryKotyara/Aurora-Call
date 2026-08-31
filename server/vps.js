import http from "node:http";
import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import authAdopt from "../api/auth-adopt.js";
import authLogin from "../api/auth-login.js";
import authLogout from "../api/auth-logout.js";
import registerEmail from "../api/register-email.js";
import functionProxy from "../api/functions/[name].js";
import rpcProxy from "../api/rpc/[name].js";

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || "0.0.0.0";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const MAX_BODY_BYTES = 2 * 1024 * 1024;

const MIME = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".ico", "image/x-icon"],
  [".woff2", "font/woff2"],
  [".mp4", "video/mp4"],
  [".webm", "video/webm"],
]);

function harden(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Permissions-Policy", "geolocation=(), payment=(), usb=()");
}

function decorateResponse(res) {
  harden(res);
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (payload) => {
    if (!res.headersSent)
      res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(payload));
    return res;
  };
  res.send = (payload = "") => {
    if (Buffer.isBuffer(payload) || payload instanceof Uint8Array) {
      res.end(payload);
    } else {
      res.end(String(payload));
    }
    return res;
  };
  return res;
}

async function parseBody(req) {
  if (!(
    req.method === "POST" ||
    req.method === "PUT" ||
    req.method === "PATCH"
  )) {
    req.body = undefined;
    return;
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES)
      throw Object.assign(new Error("payload_too_large"), { statusCode: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) {
    req.body = undefined;
    return;
  }
  const text = Buffer.concat(chunks).toString("utf8");
  const type = String(req.headers["content-type"] || "").toLowerCase();
  if (type.includes("application/json")) {
    try {
      req.body = JSON.parse(text);
    } catch {
      throw Object.assign(new Error("invalid_json"), { statusCode: 400 });
    }
  } else {
    req.body = text;
  }
}

async function runHandler(handler, req, res, query = {}) {
  req.query = query;
  await parseBody(req);
  await handler(req, decorateResponse(res));
}

function safeStaticPath(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const relative = decoded.replace(/^\/+/, "");
  const candidate = path.resolve(DIST, relative || "index.html");
  return candidate === DIST || candidate.startsWith(`${DIST}${path.sep}`)
    ? candidate
    : null;
}

async function serveFile(res, filePath, cacheControl) {
  const info = await stat(filePath);
  if (!info.isFile()) return false;
  harden(res);
  const contentType =
    MIME.get(path.extname(filePath).toLowerCase()) ||
    "application/octet-stream";
  res.statusCode = 200;
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Length", String(info.size));
  res.setHeader("Cache-Control", cacheControl);
  createReadStream(filePath).pipe(res);
  return true;
}

async function serveStatic(req, res, pathname) {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  const candidate = safeStaticPath(pathname);
  if (candidate) {
    try {
      await access(candidate);
      const cache = pathname.startsWith("/assets/")
        ? "public, max-age=31536000, immutable"
        : "no-cache";
      return await serveFile(res, candidate, cache);
    } catch {
      // SPA fallback below.
    }
  }
  try {
    return await serveFile(res, path.join(DIST, "index.html"), "no-cache");
  } catch {
    return false;
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(
      req.url || "/",
      `http://${req.headers.host || "localhost"}`,
    );
    const pathname = url.pathname;

    if (pathname === "/healthz") {
      harden(res);
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify({ ok: true, service: "aurora-call" }));
      return;
    }

    if (pathname === "/api/auth-login")
      return void (await runHandler(authLogin, req, res));
    if (pathname === "/api/auth-logout")
      return void (await runHandler(authLogout, req, res));
    if (pathname === "/api/auth-adopt")
      return void (await runHandler(authAdopt, req, res));
    if (pathname === "/api/register-email")
      return void (await runHandler(registerEmail, req, res));

    const rpcMatch = pathname.match(/^\/api\/rpc\/([a-z0-9_]{1,80})$/);
    if (rpcMatch)
      return void (await runHandler(rpcProxy, req, res, { name: rpcMatch[1] }));

    const functionMatch = pathname.match(
      /^\/api\/functions\/([a-z0-9_-]{1,80})$/,
    );
    if (functionMatch)
      return void (await runHandler(functionProxy, req, res, {
        name: functionMatch[1],
      }));

    if (pathname.startsWith("/api/")) {
      decorateResponse(res).status(404).json({ error: "not_found" });
      return;
    }

    if (!(await serveStatic(req, res, pathname))) {
      decorateResponse(res).status(404).send("Not found");
    }
  } catch (error) {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    const status = Number(error?.statusCode || 500);
    console.error(
      "aurora_vps_request_failed",
      error instanceof Error ? error.message : error,
    );
    decorateResponse(res)
      .status(status >= 400 && status <= 599 ? status : 500)
      .json({
        error:
          status === 413
            ? "payload_too_large"
            : status === 400
              ? "invalid_request"
              : "server_error",
      });
  }
});

server.keepAliveTimeout = 65_000;
server.headersTimeout = 70_000;
server.requestTimeout = 30_000;
server.listen(PORT, HOST, () => {
  console.log(`Aurora Call VPS server listening on ${HOST}:${PORT}`);
});
