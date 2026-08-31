import assert from "node:assert/strict";
import test from "node:test";

import { normalizeBadgeCount, setAppBadgeCount } from "../src/app-badge.js";

test("app badge count is normalized and capped", () => {
  assert.equal(normalizeBadgeCount(null), 0);
  assert.equal(normalizeBadgeCount(-5), 0);
  assert.equal(normalizeBadgeCount(4.9), 4);
  assert.equal(normalizeBadgeCount(5000), 999);
});

test("app badge is set and cleared through the platform API", async () => {
  const calls = [];
  const target = {
    setAppBadge: async (count) => calls.push(["set", count]),
    clearAppBadge: async () => calls.push(["clear"]),
  };

  assert.equal(await setAppBadgeCount(7, target), true);
  assert.equal(await setAppBadgeCount(0, target), true);
  assert.deepEqual(calls, [["set", 7], ["clear"]]);
});
