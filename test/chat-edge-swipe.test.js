import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  chatBackThreshold,
  isChatBackEdgeStart,
  isChatBackIntent,
  shouldCompleteChatBackSwipe,
} from "../src/chat-edge-swipe.js";

test("chat back gesture starts only at the left screen edge", () => {
  assert.equal(isChatBackEdgeStart({ clientX: 0 }), true);
  assert.equal(isChatBackEdgeStart({ clientX: 31 }), true);
  assert.equal(isChatBackEdgeStart({ clientX: 40 }), false);
  assert.equal(isChatBackEdgeStart({ clientX: -1 }), false);
});

test("chat back gesture requires a clear movement to the right", () => {
  assert.equal(isChatBackIntent(28, 4), true);
  assert.equal(isChatBackIntent(7, 0), false);
  assert.equal(isChatBackIntent(24, 30), false);
  assert.equal(isChatBackIntent(-28, 2), false);
});

test("chat back completes by distance or a deliberate quick flick", () => {
  const viewportWidth = 390;
  assert.equal(chatBackThreshold(viewportWidth), 101.4);
  assert.equal(
    shouldCompleteChatBackSwipe({
      distance: 106,
      duration: 600,
      viewportWidth,
    }),
    true,
  );
  assert.equal(
    shouldCompleteChatBackSwipe({
      distance: 48,
      duration: 80,
      viewportWidth,
    }),
    true,
  );
  assert.equal(
    shouldCompleteChatBackSwipe({
      distance: 48,
      duration: 500,
      viewportWidth,
    }),
    false,
  );
});

test("chat list and conversation both install the edge back gesture", () => {
  const source = readFileSync(
    new URL("../src/chat.js", import.meta.url),
    "utf8",
  );

  assert.match(
    source,
    /installChatEdgeSwipe\(layer\.querySelector\("\.chat-list-view"\), closeChat\)/,
  );
  assert.match(
    source,
    /installChatEdgeSwipe\([\s\S]*?\.chat-conversation-view[\s\S]*?returnToThreads/,
  );
});
