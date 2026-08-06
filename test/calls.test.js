import assert from "node:assert/strict";
import test from "node:test";

import { parseHTML } from "linkedom";

const { document, window } = parseHTML(
  '<!doctype html><html><body><div id="root"></div></body></html>',
);
const storage = new Map();
const audioTrack = {
  enabled: true,
  stopCalled: false,
  stop() {
    this.stopCalled = true;
  },
};
const videoTrack = {
  enabled: true,
  stopCalled: false,
  stop() {
    this.stopCalled = true;
  },
};
const mediaStream = {
  getTracks: () => [audioTrack, videoTrack],
  getAudioTracks: () => [audioTrack],
  getVideoTracks: () => [videoTrack],
};

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
    },
  },
});
globalThis.fetch = async () => ({
  ok: true,
  text: async () => "",
});

class PeerConnectionMock {
  connectionState = "connecting";

  addTrack() {}

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

test("call controls update the real media tracks and their visual state", async () => {
  state.session = { token: "test-token", username: "aurora_preview" };
  state.selectedFriend = {
    id: "00000000-0000-4000-8000-0000000000e5",
    name: "volna_preview",
  };

  await startCall("video");

  const microphoneButton = document.querySelector("#toggle-mic");
  const cameraButton = document.querySelector("#toggle-camera");

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

  await endCall({ notifyPeer: false });
  assert.equal(audioTrack.stopCalled, true);
  assert.equal(videoTrack.stopCalled, true);
  assert.equal(document.querySelector("#call-modal"), null);
});
