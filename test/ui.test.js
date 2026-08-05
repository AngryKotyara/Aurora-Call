import assert from "node:assert/strict";
import test from "node:test";

import { parseHTML } from "linkedom";

const { document, window } = parseHTML(
  '<!doctype html><html><body><div id="root"></div></body></html>',
);

globalThis.document = document;
globalThis.window = window;

const { renderMain } = await import("../src/ui.js");

test("main screen renders the logo, waves, history, and friend removal controls", () => {
  const navigation = [];
  const deletedFriends = [];
  let mediaRequests = 0;

  renderMain({
    activeScreen: "home",
    session: { username: "aurora_preview" },
    friends: [
      {
        id: "00000000-0000-4000-8000-0000000000e5",
        username: "volna_preview",
      },
    ],
    callHistory: [
      {
        id: 1,
        peer_name: "volna_preview",
        mode: "video",
        direction: "incoming",
        status: "declined",
        created_at: "2026-08-05T10:00:00.000Z",
      },
    ],
    mediaPermission: { status: "prompt" },
    onNavigate: (screen) => navigation.push(screen),
    onSelectFriend: () => {},
    onCall: () => {},
    onGenerateInvite: () => {},
    onDeleteFriend: (friend) => deletedFriends.push(friend),
    onRequestMediaAccess: () => {
      mediaRequests += 1;
    },
    onLogout: () => {},
  });

  assert.match(
    document.querySelector(".brand-logo")?.getAttribute("src") || "",
    /^data:image\/png;base64,/,
  );
  assert.ok(document.querySelector(".aurora-waves svg"));
  assert.equal(document.querySelectorAll("[data-nav]").length, 4);
  assert.match(document.querySelector(".history-row").textContent, /Входящий/);
  assert.match(document.querySelector(".history-row").textContent, /Отклонён/);
  assert.equal(document.querySelectorAll("[data-request-media]").length, 2);

  document.querySelector('[data-nav="history"]').click();
  document.querySelector("[data-delete-friend]").click();
  document.querySelector("[data-request-media]").click();

  assert.deepEqual(navigation, ["history"]);
  assert.deepEqual(deletedFriends, [
    {
      id: "00000000-0000-4000-8000-0000000000e5",
      name: "volna_preview",
    },
  ]);
  assert.equal(mediaRequests, 1);
});

test("granted media access is kept as a disabled status in settings", () => {
  renderMain({
    activeScreen: "settings",
    session: { username: "aurora_preview" },
    friends: [],
    callHistory: [],
    mediaPermission: { status: "granted" },
    onNavigate: () => {},
    onSelectFriend: () => {},
    onCall: () => {},
    onGenerateInvite: () => {},
    onDeleteFriend: () => {},
    onRequestMediaAccess: () => {},
    onLogout: () => {},
  });

  assert.equal(document.querySelectorAll("[data-request-media]").length, 1);
  assert.equal(document.querySelector("[data-request-media]").disabled, true);
  assert.match(document.querySelector(".media-access").textContent, /сохранён/);
});
