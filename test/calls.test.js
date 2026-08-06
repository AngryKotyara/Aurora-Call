import assert from "node:assert/strict";
import test from "node:test";

import { parseHTML } from "linkedom";

const { document, window } = parseHTML(
  '<!doctype html><html><body><div id="root"></div></body></html>',
);
const storage = new Map();
const audioTrack = {
  kind: "audio",
  enabled: true,
  stopCalled: false,
  stop() {
    this.stopCalled = true;
  },
};
const videoTrack = {
  kind: "video",
  enabled: true,
  stopCalled: false,
  stop() {
    this.stopCalled = true;
  },
};
const screenTrackListeners = new Map();
const screenTrack = {
  kind: "video",
  contentHint: "",
  stopCalled: false,
  stop() {
    this.stopCalled = true;
  },
  addEventListener(type, listener) {
    screenTrackListeners.set(type, listener);
  },
  removeEventListener(type, listener) {
    if (screenTrackListeners.get(type) === listener)
      screenTrackListeners.delete(type);
  },
  end() {
    screenTrackListeners.get("ended")?.();
  },
};
const mediaStream = {
  getTracks: () => [audioTrack, videoTrack],
  getAudioTracks: () => [audioTrack],
  getVideoTracks: () => [videoTrack],
};
const screenStream = {
  getTracks: () => [screenTrack],
  getVideoTracks: () => [screenTrack],
};
let displayMediaConstraints = null;

globalThis.document = document;
globalThis.window = window;
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: (key) => storage.delete(key),
};
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: {
    mediaDevices: {
      getUserMedia: async () => mediaStream,
      getDisplayMedia: async (constraints) => {
        displayMediaConstraints = constraints;
        return screenStream;
      },
    },
  },
});
globalThis.fetch = async () => ({
  ok: true,
  text: async () => "",
});

class PeerConnectionMock {
  connectionState = "connecting";
  senders = [];

  addTrack(track) {
    const sender = {
      track,
      replacements: [],
      async replaceTrack(replacement) {
        this.track = replacement;
        this.replacements.push(replacement);
      },
    };
    this.senders.push(sender);
    return sender;
  }

  getSenders() {
    return this.senders;
  }

  async createOffer() {
    return { type: "offer", sdp: "test-offer" };
  }

  async setLocalDescription(description) {
    this.localDescription = description;
  }

  close() {
    this.connectionState = "closed";
  }
}

globalThis.RTCPeerConnection = PeerConnectionMock;

const { endCall, startCall } = await import("../src/calls.js");
const { state } = await import("../src/state.js");

test("call controls update media tracks and restore the camera after screen sharing", async () => {
  state.session = { token: "test-token", username: "aurora_preview" };
  state.selectedFriend = {
    id: "00000000-0000-4000-8000-0000000000e5",
    name: "volna_preview",
  };

  await startCall("video");

  const microphoneButton = document.querySelector("#toggle-mic");
  const cameraButton = document.querySelector("#toggle-camera");
  const screenShareButton = document.querySelector("#toggle-screen-share");

  microphoneButton.click();
  cameraButton.click();

  assert.equal(audioTrack.enabled, false);
  assert.equal(videoTrack.enabled, false);
  assert.equal(microphoneButton.dataset.enabled, "false");
  assert.equal(cameraButton.dataset.enabled, "false");
  assert.ok(
    document
      .querySelector("#local-preview")
      .classList.contains("is-camera-off"),
  );

  microphoneButton.click();
  cameraButton.click();

  assert.equal(audioTrack.enabled, true);
  assert.equal(videoTrack.enabled, true);
  assert.equal(microphoneButton.dataset.enabled, "true");
  assert.equal(cameraButton.dataset.enabled, "true");

  screenShareButton.click();
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(displayMediaConstraints, { video: true, audio: false });
  assert.equal(state.videoSender.track, screenTrack);
  assert.equal(screenTrack.contentHint, "detail");
  assert.equal(screenShareButton.dataset.active, "true");
  assert.equal(screenShareButton.getAttribute("aria-pressed"), "true");
  assert.match(screenShareButton.getAttribute("aria-label"), /Остановить/);
  assert.equal(
    document.querySelector("#call-modal").dataset.localScreenSharing,
    "true",
  );

  screenTrack.end();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(state.videoSender.track, videoTrack);
  assert.equal(screenTrack.stopCalled, true);
  assert.equal(screenShareButton.dataset.active, "false");
  assert.equal(screenShareButton.getAttribute("aria-pressed"), "false");

  screenTrack.stopCalled = false;
  screenShareButton.click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(state.screenStream, screenStream);

  await endCall({ notifyPeer: false });
  assert.equal(audioTrack.stopCalled, true);
  assert.equal(videoTrack.stopCalled, true);
  assert.equal(screenTrack.stopCalled, true);
  assert.equal(state.screenStream, null);
  assert.equal(state.videoSender, null);
  assert.equal(document.querySelector("#call-modal"), null);
});
