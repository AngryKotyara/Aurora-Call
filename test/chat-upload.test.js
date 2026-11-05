import assert from "node:assert/strict";
import test from "node:test";
import { parseHTML } from "linkedom";

const { document, window } = parseHTML(
  '<!doctype html><html><body><div class="chat-messages"></div></body></html>',
);
globalThis.document = document;
globalThis.window = window;
globalThis.localStorage = {
  getItem: () => null,
  removeItem: () => {},
  setItem: () => {},
};
const { state } = await import("../src/state.js");
const { sendMedia } = await import("../src/chat/upload.js");

test("upload preserves recipient, file metadata, push notification, and preview cleanup", async () => {
  const originals = {
    fetch: globalThis.fetch,
    reader: globalThis.FileReader,
    create: URL.createObjectURL,
    revoke: URL.revokeObjectURL,
  };
  const requests = [],
    revoked = [];
  let refreshed = 0;
  state.session = { token: "session" };
  globalThis.FileReader = class {
    readAsDataURL() {
      this.result = "data:image/jpeg;base64,YQ==";
      queueMicrotask(() => this.onload());
    }
  };
  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), body: JSON.parse(options.body) });
    return new Response(JSON.stringify(42), { status: 200 });
  };
  URL.createObjectURL = () => "blob:preview";
  URL.revokeObjectURL = (url) => revoked.push(url);
  try {
    await sendMedia(
      { name: "photo.jpg", type: "image/jpeg", size: 1 },
      {
        getOpenedFriend: () => ({ id: "friend" }),
        renderConversation: async () => {
          refreshed += 1;
        },
      },
    );
    const upload = requests.find((request) =>
      request.url.endsWith("/upload_chat_media"),
    );
    assert.deepEqual(upload.body, {
      p_token: "session",
      p_to: "friend",
      p_kind: "image",
      p_body: null,
      p_media_mime: "image/jpeg",
      p_media_name: "photo.jpg",
      p_media_base64: "YQ==",
    });
    assert.ok(
      requests.some(
        (request) =>
          request.url.endsWith("/aurora-push") &&
          request.body.action === "notify_message",
      ),
    );
    assert.equal(refreshed, 1);
    assert.deepEqual(revoked, ["blob:preview"]);
    assert.match(
      document.querySelector(".chat-upload-ring b").textContent,
      /^\d+%$/,
    );
  } finally {
    globalThis.fetch = originals.fetch;
    globalThis.FileReader = originals.reader;
    URL.createObjectURL = originals.create;
    URL.revokeObjectURL = originals.revoke;
    state.session = null;
  }
});
