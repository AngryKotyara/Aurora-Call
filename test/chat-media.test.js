import assert from "node:assert/strict";
import test from "node:test";
import { parseHTML } from "linkedom";

const { document } = parseHTML(`<!doctype html><html><body><div id="chat-layer">
  <button class="chat-media-open" data-chat-media-id="18" data-media-kind="image" data-media-name="photo.jpg">
    <div class="chat-media-skeleton"><small>Загрузка</small></div><img hidden>
  </button>
  <div data-chat-media-id="19" data-storage-media="true"></div>
</div></body></html>`);
globalThis.document = document;
globalThis.localStorage = {
  getItem: () => null,
  removeItem: () => {},
  setItem: () => {},
};
const { state } = await import("../src/state.js");
const { clearMediaCache, hydrateMedia, removeCachedMedia } =
  await import("../src/chat/media.js");

test("legacy media loads once, keeps storage media separate, and releases its cached URL", async () => {
  const originalFetch = globalThis.fetch;
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  const revoked = [];
  let calls = 0;
  state.session = { token: "session" };
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(
      JSON.stringify([{ media_base64: "YQ==", media_mime: "image/jpeg" }]),
      { status: 200 },
    );
  };
  URL.createObjectURL = () => "blob:test-image";
  URL.revokeObjectURL = (url) => revoked.push(url);
  try {
    await hydrateMedia();
    const frame = document.querySelector('[data-chat-media-id="18"]');
    frame.querySelector("img").onload();
    assert.equal(frame.dataset.hydrated, "true");
    assert.equal(frame.querySelector("img").hidden, false);
    assert.equal(
      document.querySelector('[data-chat-media-id="19"]').dataset.hydrated,
      undefined,
    );
    document
      .querySelector("#chat-layer")
      .insertAdjacentHTML(
        "beforeend",
        `<button data-chat-media-id="18" data-media-kind="image"><div class="chat-media-skeleton"></div><img hidden></button>`,
      );
    await hydrateMedia();
    assert.equal(calls, 1);
    removeCachedMedia(18);
    assert.deepEqual(revoked, ["blob:test-image"]);
    clearMediaCache();
    assert.deepEqual(revoked, ["blob:test-image"]);
  } finally {
    globalThis.fetch = originalFetch;
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    state.session = null;
    clearMediaCache();
  }
});
