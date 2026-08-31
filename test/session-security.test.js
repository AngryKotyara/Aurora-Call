import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("browser login uses the server endpoint instead of the legacy hash RPC", () => {
  const app = source("src/app.js");
  const api = source("src/api.js");

  assert.match(app, /loginByAccessKey\(username, accessKey\)/);
  assert.doesNotMatch(app, /login_call_user/);
  assert.doesNotMatch(app, /hashSecret\(accessKey\)/);
  assert.match(api, /"\/api\/auth-login"/);
});

test("session bearer is protected by a strict HttpOnly host cookie", () => {
  const server = source("server/aurora.js");
  const state = source("src/state.js");

  assert.match(server, /__Host-aurora_session/);
  assert.match(server, /HttpOnly; Secure; SameSite=Strict/);
  assert.match(state, /token: true/);
  assert.match(state, /migrateLegacySession/);
});

test("same-origin RPC proxy injects the cookie token and blocks legacy login", () => {
  const proxy = source("api/rpc/[name].js");

  assert.match(proxy, /readSessionToken\(req\)/);
  assert.match(proxy, /p_token: token/);
  assert.match(proxy, /"login_call_user"/);
  assert.match(proxy, /sameOriginRequest\(req\)/);
});

test("push proxy injects the HttpOnly session instead of trusting the browser", () => {
  const proxy = source("api/functions/[name].js");
  const client = source("src/push-notifications.js");

  assert.match(proxy, /readSessionToken\(req\)/);
  assert.match(proxy, /p_token: token/);
  assert.match(proxy, /sameOriginRequest\(req\)/);
  assert.doesNotMatch(client, /p_token:\s*state\.session\.token/);
});

test("an expired HttpOnly session returns to login instead of empty data", () => {
  const api = source("src/api.js");
  const app = source("src/app.js");

  assert.match(api, /response\.status === 401/);
  assert.match(api, /aurora-session-expired/);
  assert.match(app, /addEventListener\("aurora-session-expired"/);
  assert.match(app, /Сессия истекла\. Войдите снова/);
});
