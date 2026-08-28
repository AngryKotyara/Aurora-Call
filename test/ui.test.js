import assert from "node:assert/strict";
import test from "node:test";

import { parseHTML } from "linkedom";

const { document, window } = parseHTML(
  '<!doctype html><html><body><div id="root"></div></body></html>',
);

globalThis.document = document;
globalThis.window = window;

const {
  renderCallModal,
  removeCallModal,
  setRemoteScreenShareActive,
  setScreenShareActive,
} = await import("../src/call-ui.js");
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
    /aurora-call-logo\.png$/,
  );
  assert.ok(document.querySelector(".xperia-flow svg"));
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

test("granted media access can be switched off in settings", () => {
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
  assert.equal(document.querySelector("[data-request-media]").disabled, false);
  assert.match(document.querySelector(".media-access").textContent, /сохранён/);
  assert.match(
    document.querySelector("[data-request-media]").textContent,
    /Выключить/,
  );
});

test("video calls use a full-screen stage with screen sharing controls", async () => {
  let microphoneEnabled = true;
  let cameraEnabled = true;
  let screenShareActive = false;
  let hangups = 0;

  renderCallModal({
    friendName: "volna_preview",
    mode: "video",
    onToggleMic: () => (microphoneEnabled = !microphoneEnabled),
    onToggleCamera: () => (cameraEnabled = !cameraEnabled),
    onToggleScreenShare: async () => (screenShareActive = !screenShareActive),
    canShareScreen: true,
    onHangup: () => {
      hangups += 1;
    },
  });

  const callScreen = document.querySelector("#call-modal");
  const localPreview = document.querySelector("#local-preview");
  const microphoneButton = document.querySelector("#toggle-mic");
  const cameraButton = document.querySelector("#toggle-camera");
  const screenShareButton = document.querySelector("#toggle-screen-share");

  assert.ok(callScreen.classList.contains("call-screen"));
  assert.ok(callScreen.classList.contains("video-call"));
  assert.equal(callScreen.getAttribute("aria-modal"), "true");
  assert.match(localPreview.getAttribute("aria-label"), /Перетащите/);
  assert.equal(localPreview.getAttribute("tabindex"), "0");
  assert.equal(document.body.classList.contains("call-active"), true);
  assert.equal(screenShareButton.dataset.active, "false");
  assert.equal(screenShareButton.getAttribute("aria-pressed"), "false");

  let boundaryWidth = 390;
  let boundaryHeight = 844;
  callScreen.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    right: boundaryWidth,
    bottom: boundaryHeight,
    width: boundaryWidth,
    height: boundaryHeight,
  });
  localPreview.getBoundingClientRect = () => {
    const left = Number.parseFloat(localPreview.style.left) || 16;
    const top = Number.parseFloat(localPreview.style.top) || 590;
    const width = 120;
    const height = 160;

    return {
      left,
      top,
      right: left + width,
      bottom: top + height,
      width,
      height,
    };
  };

  const pointerEvent = (type, properties) =>
    Object.assign(new window.Event(type, { bubbles: true }), properties);

  localPreview.dispatchEvent(
    pointerEvent("pointerdown", {
      button: 0,
      pointerId: 1,
      clientX: 76,
      clientY: 670,
    }),
  );
  window.dispatchEvent(
    pointerEvent("pointermove", {
      pointerId: 1,
      clientX: 340,
      clientY: 180,
    }),
  );
  window.dispatchEvent(pointerEvent("pointerup", { pointerId: 1 }));

  assert.equal(localPreview.style.left, "258px");
  assert.equal(localPreview.style.top, "100px");

  boundaryWidth = 200;
  boundaryHeight = 300;
  window.dispatchEvent(new window.Event("resize"));
  assert.equal(localPreview.style.left, "68px");
  assert.equal(localPreview.style.top, "100px");

  microphoneButton.click();
  assert.equal(microphoneButton.dataset.enabled, "false");
  assert.equal(microphoneButton.getAttribute("aria-pressed"), "true");
  assert.match(microphoneButton.getAttribute("aria-label"), /Включить/);

  cameraButton.click();
  assert.equal(cameraButton.dataset.enabled, "false");
  assert.ok(cameraButton.classList.contains("is-off"));
  assert.ok(localPreview.classList.contains("is-camera-off"));

  screenShareButton.click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(screenShareButton.dataset.active, "true");
  assert.ok(screenShareButton.classList.contains("is-active"));
  assert.match(screenShareButton.getAttribute("aria-label"), /Остановить/);
  assert.equal(callScreen.dataset.localScreenSharing, "true");
  assert.match(
    document.querySelector("#screen-share-status").textContent,
    /Вы показываете экран/,
  );

  setScreenShareActive(false);
  setRemoteScreenShareActive(true);
  assert.equal(callScreen.dataset.remoteScreenSharing, "true");
  assert.match(
    document.querySelector("#screen-share-status").textContent,
    /Собеседник показывает экран/,
  );

  document.querySelector("#hangup").click();
  assert.equal(hangups, 1);

  removeCallModal();
  assert.equal(document.querySelector("#call-modal"), null);
  assert.equal(document.body.classList.contains("call-active"), false);
});

test("audio calls keep the full-screen layout without a camera control", () => {
  renderCallModal({
    friendName: "volna_preview",
    mode: "audio",
    onToggleMic: () => false,
    onToggleCamera: () => false,
    onHangup: () => {},
  });

  assert.ok(
    document.querySelector("#call-modal").classList.contains("audio-call"),
  );
  assert.equal(document.querySelector("#local-preview"), null);
  assert.equal(document.querySelector("#toggle-camera"), null);
  assert.equal(document.querySelector("#toggle-screen-share"), null);

  removeCallModal();
});

test("unsupported browsers keep a disabled screen sharing button", () => {
  renderCallModal({
    friendName: "volna_preview",
    mode: "video",
    onToggleMic: () => true,
    onToggleCamera: () => true,
    canShareScreen: false,
    onHangup: () => {},
  });

  const screenShareButton = document.querySelector("#toggle-screen-share");
  assert.equal(screenShareButton.disabled, false);
  assert.equal(screenShareButton.getAttribute("aria-disabled"), "true");
  assert.match(screenShareButton.getAttribute("aria-label"), /недоступна/);
  assert.match(
    document.querySelector(".screen-share-unavailable").textContent,
    /недоступна/,
  );

  removeCallModal();
});
