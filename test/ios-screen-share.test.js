import assert from "node:assert/strict";
import test from "node:test";

import { parseHTML } from "linkedom";

const { document, window } = parseHTML(
  "<!doctype html><html><body></body></html>",
);
const bridgeMessages = [];
const draws = [];
let stoppedTracks = 0;

globalThis.document = document;
globalThis.window = window;
globalThis.CustomEvent = window.CustomEvent;
globalThis.HTMLCanvasElement = window.HTMLCanvasElement;
globalThis.fetch = async () => ({ blob: async () => new Blob(["frame"]) });
globalThis.createImageBitmap = async () => ({
  width: 720,
  height: 1280,
  close() {},
});

Object.defineProperty(window, "webkit", {
  configurable: true,
  value: {
    messageHandlers: {
      auroraScreenShare: {
        postMessage(message) {
          bridgeMessages.push(message);
        },
      },
    },
  },
});

window.HTMLCanvasElement.prototype.getContext = () => ({
  drawImage(...args) {
    draws.push(args);
  },
});
window.HTMLCanvasElement.prototype.captureStream = () => {
  const track = {
    kind: "video",
    contentHint: "",
    stop() {
      stoppedTracks += 1;
    },
  };
  return {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  };
};

const {
  createIOSScreenStream,
  isIOSNativeScreenShareAvailable,
  isIOSScreenStream,
  stopIOSScreenShare,
} = await import("../src/ios-screen-share.js");

test("iOS ReplayKit bridge resolves on the first decoded frame", async () => {
  assert.equal(isIOSNativeScreenShareAvailable(), true);
  const pendingStream = createIOSScreenStream();
  assert.deepEqual(bridgeMessages.at(-1), { action: "start" });

  await window.__auroraReceiveScreenFrame("ZmFrZS1qcGVn", 720, 1280);
  const stream = await pendingStream;

  assert.equal(isIOSScreenStream(stream), true);
  assert.equal(stream.getVideoTracks()[0].contentHint, "detail");
  assert.equal(draws.length, 1);

  stopIOSScreenShare();
  assert.deepEqual(bridgeMessages.at(-1), { action: "stop" });
  assert.equal(stoppedTracks, 1);
});

test("iOS ReplayKit stop before the first frame rejects instead of hanging", async () => {
  const pendingStream = createIOSScreenStream();
  window.__auroraNativeScreenShareState("stopped");

  await assert.rejects(pendingStream, /ReplayKit stopped/);
  assert.equal(document.querySelector("canvas"), null);
});
