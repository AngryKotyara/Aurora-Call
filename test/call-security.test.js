import assert from "node:assert/strict";
import test from "node:test";
import { callVerificationCode } from "../src/call-security.js";

const fingerprint = (byte) => Array(32).fill(byte).join(":");
const sdp = (value) =>
  `v=0\r\na=fingerprint:sha-256 ${value}\r\na=setup:actpass\r\n`;

test("both ends derive the same code from the DTLS fingerprints", async () => {
  const alice = sdp(fingerprint("AA"));
  const bob = sdp(fingerprint("12"));
  const code = await callVerificationCode(alice, bob);
  assert.equal(code, "6208 0921 3124");
  assert.equal(await callVerificationCode(bob, alice), code);
  assert.notEqual(
    await callVerificationCode(alice, sdp(fingerprint("13"))),
    code,
  );
  assert.equal(await callVerificationCode(alice.toLowerCase(), bob), code);
});

test("missing, invalid, or conflicting fingerprints do not produce a code", async () => {
  const valid = sdp(fingerprint("AA"));
  assert.equal(await callVerificationCode(valid, "v=0\r\n"), null);
  assert.equal(await callVerificationCode(valid, sdp("AA:BB")), null);
  assert.equal(
    await callVerificationCode(
      valid,
      sdp(fingerprint("AA")) + sdp(fingerprint("BB")),
    ),
    null,
  );
  assert.ok(await callVerificationCode(valid + valid, sdp(fingerprint("BB"))));
});
