import assert from "node:assert/strict";
import test from "node:test";
import { parseHTML } from "linkedom";
import { renderMessageMarkup, threadRow } from "../src/chat/markup.js";

test("message rendering preserves direction, read state, and escaped text", () => {
  const incoming = renderMessageMarkup(
    {
      id: 1,
      sender_id: "friend",
      kind: "text",
      body: "<script>bad()</script>",
      created_at: "2026-11-04T12:00:00Z",
    },
    "friend",
  );
  const outgoing = renderMessageMarkup(
    {
      id: 2,
      sender_id: "self",
      kind: "text",
      body: "Привет",
      edited_at: "2026-11-04",
      read_at: "2026-11-04",
      created_at: "2026-11-04T12:00:00Z",
    },
    "friend",
  );
  const { document } = parseHTML(`<main>${incoming}${outgoing}</main>`);
  assert.equal(document.querySelectorAll("script").length, 0);
  assert.equal(
    document.querySelector(".incoming .chat-message-text").textContent,
    "<script>bad()</script>",
  );
  assert.equal(document.querySelector(".incoming").dataset.messageOwn, "false");
  assert.equal(document.querySelector(".outgoing").dataset.messageOwn, "true");
  assert.ok(document.querySelector(".outgoing .chat-checks.read"));
  assert.ok(document.querySelector(".outgoing .chat-edited"));
});

test("thread previews remain escaped and unread counts stay capped", () => {
  const markup = threadRow({
    friend_id: "friend",
    username: "<img src=x>",
    last_message: "<b>message</b>",
    unread_count: 150,
  });
  const { document } = parseHTML(`<main>${markup}</main>`);
  assert.equal(document.querySelectorAll("img, b b").length, 0);
  assert.equal(document.querySelector(".chat-unread").textContent, "99+");
  assert.match(
    document.querySelector(".chat-thread").textContent,
    /<b>message<\/b>/,
  );
});
