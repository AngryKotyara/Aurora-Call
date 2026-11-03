import assert from "node:assert/strict";
import test from "node:test";
import adopt from "../api/auth-adopt.js";
import proxy from "../api/rpc/[name].js";
import {
  hasTurnServer,
  relayOnlyEnabled,
  setRelayOnlyEnabled,
} from "../src/call-privacy.js";

function response() {
  return {
    headers: {},
    statusCode: 200,
    setHeader(k, v) {
      this.headers[k] = v;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    send(body) {
      this.body = body;
      return this;
    },
  };
}
const token = "00000000-0000-4000-8000-000000000000";
const headers = { host: "example.test", origin: "https://example.test" };

test("adoption rejects an invalid token even if upstream returns an empty success", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response("[]", { status: 200 });
  try {
    const res = response();
    await adopt({ method: "POST", headers, body: { token } }, res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.headers["Set-Cookie"], undefined);
  } finally {
    globalThis.fetch = original;
  }
});
test("adoption accepts a validated profile", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ user_id: token, username: "test" }), {
      status: 200,
    });
  try {
    const res = response();
    await adopt({ method: "POST", headers, body: { token } }, res);
    assert.equal(res.statusCode, 200);
    assert.match(res.headers["Set-Cookie"], /HttpOnly/);
  } finally {
    globalThis.fetch = original;
  }
});
test("proxy rejects unrelated and legacy RPC names", async () => {
  for (const name of [
    "login_call_user",
    "wedding_admin_login",
    "unknown_rpc",
  ]) {
    const res = response();
    await proxy({ method: "POST", headers, query: { name }, body: {} }, res);
    assert.equal(res.statusCode, 404);
  }
});
test("relay-only mode is optional and requires TURN credentials", () => {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => store.get(k),
    setItem: (k, v) => store.set(k, v),
  };
  assert.equal(relayOnlyEnabled(), false);
  setRelayOnlyEnabled(true);
  assert.equal(relayOnlyEnabled(), true);
  assert.equal(hasTurnServer([{ urls: "stun:example" }]), false);
  assert.equal(hasTurnServer([{ urls: ["turn:example"] }]), true);
});
