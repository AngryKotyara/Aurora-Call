import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const apnsSource = await readFile(
  new URL("../supabase/functions/aurora-apns/index.ts", import.meta.url),
  "utf8",
);
const apiSource = await readFile(new URL("../src/api.js", import.meta.url), "utf8");
const proxySource = await readFile(
  new URL("../api/functions/[name].js", import.meta.url),
  "utf8",
);

 test("iOS incoming calls use a dedicated APNs VoIP path", () => {
  assert.match(apnsSource, /"apns-push-type": "voip"/);
  assert.match(apnsSource, /"apns-priority": "10"/);
  assert.match(apnsSource, /"apns-expiration": "0"/);
  assert.match(apnsSource, /\.voip`/);
  assert.match(apnsSource, /platform", "ios_voip"/);
  assert.doesNotMatch(apnsSource, /notify_message/);
});

test("starting a call fans out to Web\/Android push and APNs", () => {
  assert.match(apiSource, /sendPushEvent\("notify_call", notification\)/);
  assert.match(apiSource, /sendAPNSEvent\("notify_call", notification\)/);
  assert.match(proxySource, /"aurora-apns"/);
});
