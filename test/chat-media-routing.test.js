import assert from "node:assert/strict";
import test from "node:test";

import { parseHTML } from "linkedom";

import {
  LEGACY_MEDIA_FRAME_SELECTOR,
  mediaRoutingAttribute,
  STORAGE_MEDIA_FRAME_SELECTOR,
} from "../src/chat-media-routing.js";

globalThis.localStorage = {
  getItem: () => null,
  removeItem: () => {},
  setItem: () => {},
};

const { mediaMarkup } = await import("../src/chat.js");

test("storage-backed chat media is routed only to the storage loader", () => {
  const storageAttribute = mediaRoutingAttribute(
    "storage:aurora-chat-media-v2/user/photo.png",
  );
  const { document } = parseHTML(
    `<main><button data-chat-media-id="28"${storageAttribute}></button><button data-chat-media-id="18"></button></main>`,
  );

  assert.equal(storageAttribute, ' data-storage-media="true"');
  assert.deepEqual(
    [...document.querySelectorAll(STORAGE_MEDIA_FRAME_SELECTOR)].map(
      (frame) => frame.dataset.chatMediaId,
    ),
    ["28"],
  );
  assert.deepEqual(
    [...document.querySelectorAll(LEGACY_MEDIA_FRAME_SELECTOR)].map(
      (frame) => frame.dataset.chatMediaId,
    ),
    ["18"],
  );
});

test("inline and direct media stay on the legacy loader", () => {
  assert.equal(mediaRoutingAttribute("secure:18"), "");
  assert.equal(mediaRoutingAttribute("data:image/png;base64,AA=="), "");
  assert.equal(mediaRoutingAttribute("https://example.com/photo.png"), "");
  assert.equal(mediaRoutingAttribute(null), "");
});

test("rendered storage messages carry the routing marker after a reload", () => {
  const storageMarkup = mediaMarkup({
    id: 28,
    kind: "image",
    media_data:
      "storage:aurora-chat-media-v2/user/a146e142-e745-44e4-b153-cb1f05cc6bd2.png",
    media_name: "photo.png",
  });
  const legacyMarkup = mediaMarkup({
    id: 18,
    kind: "image",
    media_data: "secure:18",
    media_name: "old-photo.jpg",
  });

  assert.match(storageMarkup, /data-storage-media="true"/);
  assert.doesNotMatch(legacyMarkup, /data-storage-media/);
});
