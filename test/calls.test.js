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
const rpcRequests = [];
let incomingCalls = [];
let polledSignals = [];

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
globalThis.fetch = async (url, options = {}) => {
  const functionName = String(url).split("/").pop();
  if (options.body) {
    rpcRequests.push({ functionName, body: JSON.parse(options.body) });
  }
  const result =
    functionName === "start_call"
      ? "00000000-0000-4000-8000-0000000000c1"
      : functionName === "poll_incoming_calls"
        ? incomingCalls
        : functionName === "poll_call_signals"
          ? polledSignals
          : true;
  return {
    ok: true,
    text: async () => JSON.stringify(result),
  };
};

class MediaStreamMock {
  tracks = [];

  addTrack(track) {
    this.tracks.push(track);
  }

  getTracks() {
    return this.tracks;
  }
}

globalThis.MediaStream = MediaStreamMock;

class PeerConnectionMock {
  connectionState = "connecting";
  senders = [];

  constructor(configuration) {
    this.configuration = configuration;
    PeerConnectionMock.lastConfiguration = configuration;
  }

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

  async setRemoteDescription(description) {
    this.remoteDescription = description;
  }

  async createAnswer() {
    return { type: "answer", sdp: "test-answer" };
  }

  async addIceCandidate(candidate) {
    this.iceCandidate = candidate;
  }

  close() {
    this.connectionState = "closed";
  }
}

globalThis.RTCPeerConnection = PeerConnectionMock;

const { hangupCall, openIncomingCallFromPush, pollSignalsOnce, startCall } =
  await import("../src/calls.js");
const { state } = await import("../src/state.js");

test("call controls update media tracks and restore the camera after screen sharing", async () => {
  state.session = { token: "test-token", username: "aurora_preview" };
  state.selectedFriend = {
    id: "00000000-0000-4000-8000-0000000000e5",
    name: "volna_preview",
  };

  await startCall("video");

  assert.deepEqual(PeerConnectionMock.lastConfiguration, {
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });

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

  state.peer.onicecandidate({
    candidate: { toJSON: () => ({ candidate: "test-ice" }) },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(
    rpcRequests.some(
      (request) =>
        request.functionName === "send_call_signal" &&
        request.body.p_kind === "ice",
    ),
  );

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

  await hangupCall();
  assert.equal(audioTrack.stopCalled, true);
  assert.equal(videoTrack.stopCalled, true);
  assert.equal(screenTrack.stopCalled, true);
  assert.equal(state.screenStream, null);
  assert.equal(state.videoSender, null);
  assert.equal(document.querySelector("#call-modal"), null);
});

test("signals use the backend cursor and an early offer is handled after accepting", async () => {
  state.lastSignalId = 0;
  state.session = { token: "receiver-token", username: "volna_preview" };
  incomingCalls = [
    {
      id: "00000000-0000-4000-8000-0000000000c2",
      from_id: "00000000-0000-4000-8000-0000000000e5",
      from_name: "aurora_preview",
      mode: "video",
    },
  ];
  polledSignals = [
    {
      id: 42,
      call_id: "00000000-0000-4000-8000-0000000000c2",
      kind: "offer",
      payload: { type: "offer", sdp: "early-offer" },
    },
  ];

  await pollSignalsOnce();

  const pollRequest = rpcRequests.find(
    (request) => request.functionName === "poll_call_signals",
  );
  assert.equal(pollRequest.body.p_after, 0);
  assert.equal(state.lastSignalId, 42);
  assert.ok(document.querySelector("#incoming-call-layer"));

  document.querySelector("[data-incoming-accept]").click();
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.deepEqual(state.peer.remoteDescription, {
    type: "offer",
    sdp: "early-offer",
  });
  assert.ok(
    rpcRequests.some(
      (request) =>
        request.functionName === "answer_call" &&
        request.body.p_accept === true,
    ),
  );
  assert.ok(
    rpcRequests.some(
      (request) =>
        request.functionName === "send_call_signal" &&
        request.body.p_kind === "answer",
    ),
  );

  incomingCalls = [];
  polledSignals = [];
  await hangupCall();
});

test("a remote hangup dismisses an unanswered incoming call", async () => {
  const callId = "00000000-0000-4000-8000-0000000000c3";
  state.session = { token: "receiver-token", username: "volna_preview" };
  incomingCalls = [
    {
      id: callId,
      from_id: "00000000-0000-4000-8000-0000000000e5",
      from_name: "aurora_preview",
      mode: "audio",
    },
  ];
  polledSignals = [
    {
      id: 43,
      call_id: callId,
      kind: "hangup",
      payload: {},
    },
  ];

  await pollSignalsOnce();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(document.querySelector("#incoming-call-layer"), null);
  assert.equal(state.callId, null);
  incomingCalls = [];
  polledSignals = [];
});

test("a call push opens the matching active incoming call", async () => {
  const callId = "00000000-0000-4000-8000-0000000000c4";
  state.session = { token: "receiver-token", username: "volna_preview" };
  incomingCalls = [
    {
      id: callId,
      from_id: "00000000-0000-4000-8000-0000000000e5",
      from_name: "aurora_preview",
      mode: "video",
    },
  ];

  assert.equal(await openIncomingCallFromPush(callId), true);
  assert.equal(
    document.querySelector("#incoming-call-layer")?.dataset.callId,
    callId,
  );

  document.querySelector("[data-incoming-decline]").click();
  await new Promise((resolve) => setImmediate(resolve));
  incomingCalls = [];
});
