import assert from "node:assert/strict";
import test from "node:test";

import { parseHTML } from "linkedom";

const { document, window } = parseHTML(
  "<!doctype html><html><body></body></html>",
);

globalThis.document = document;
globalThis.window = window;
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: { vibrate: () => true },
});

const { showIncomingCall } = await import("../src/incoming-call.js");

test("incoming call actions run once and repeated polls reuse the same prompt", async () => {
  const call = {
    id: "00000000-0000-4000-8000-0000000000c1",
    from_id: "00000000-0000-4000-8000-0000000000e5",
    from_name: "volna_preview",
    mode: "video",
  };
  let accepted = 0;
  let declined = 0;
  const handlers = {
    onAccept: async (received) => {
      assert.equal(received, call);
      accepted += 1;
    },
    onDecline: async () => {
      declined += 1;
    },
  };

  const firstPrompt = showIncomingCall(call, handlers);
  const repeatedPoll = showIncomingCall(call, handlers);

  assert.equal(repeatedPoll, firstPrompt);
  assert.equal(document.querySelectorAll("#incoming-call-layer").length, 1);
  assert.match(
    document.querySelector("#incoming-call-layer").textContent,
    /volna_preview/,
  );

  document.querySelector("[data-incoming-accept]").click();
  assert.equal(await firstPrompt, true);
  assert.equal(accepted, 1);
  assert.equal(declined, 0);
  assert.equal(document.querySelector("#incoming-call-layer"), null);

  const secondCall = { ...call, id: "00000000-0000-4000-8000-0000000000c2" };
  const declinePrompt = showIncomingCall(secondCall, handlers);
  document.querySelector("[data-incoming-decline]").click();
  assert.equal(await declinePrompt, false);
  assert.equal(accepted, 1);
  assert.equal(declined, 1);
});
