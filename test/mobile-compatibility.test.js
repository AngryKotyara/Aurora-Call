import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { parseHTML } from "linkedom";

const { document, window } = parseHTML(
  '<!doctype html><html><body><div id="root"></div></body></html>',
);
globalThis.document = document;
globalThis.window = window;
globalThis.HTMLCanvasElement = window.HTMLCanvasElement;
globalThis.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

const { getScreenShareSupport } = await import("../src/calls.js");

test("mobile screen sharing reports platform-specific support instead of a dead control", () => {
  const ios = getScreenShareSupport({
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
    mediaDevices: {},
  });
  const android = getScreenShareSupport({
    userAgent:
      "Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36",
    mediaDevices: {},
  });
  const desktop = getScreenShareSupport({
    userAgent: "Desktop Chrome",
    mediaDevices: { getDisplayMedia: async () => ({}) },
  });

  assert.equal(ios.available, false);
  assert.match(ios.reason, /iPhone/);
  assert.equal(android.available, false);
  assert.match(android.reason, /Android/);
  assert.deepEqual(desktop, { available: true, reason: "" });
});

test("PWA and viewport metadata allow rotation, safe areas, and user zoom", () => {
  const manifest = JSON.parse(
    readFileSync(new URL("../public/manifest.webmanifest", import.meta.url)),
  );
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const styles = readFileSync(
    new URL("../src/styles.css", import.meta.url),
    "utf8",
  );
  const chatStyles = readFileSync(
    new URL("../src/chat-overrides.css", import.meta.url),
    "utf8",
  );
  const serviceWorker = readFileSync(
    new URL("../public/sw.js", import.meta.url),
    "utf8",
  );
  const icon = readFileSync(
    new URL("../public/aurora-call-logo.png", import.meta.url),
  );

  assert.equal(manifest.orientation, "any");
  assert.equal(manifest.icons[0].src, "/aurora-call-logo.png");
  assert.equal(manifest.icons[0].sizes, "1254x1254");
  assert.equal(icon.readUInt32BE(16), 1254);
  assert.equal(icon.readUInt32BE(20), 1254);
  assert.match(serviceWorker, /icon: "\/aurora-call-logo\.png"/);
  assert.match(serviceWorker, /badge: "\/aurora-call-logo\.png"/);
  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /href="\/aurora-call-logo\.png"/);
  assert.doesNotMatch(html, /user-scalable=no/);
  assert.doesNotMatch(html, /maximum-scale/);
  assert.match(styles, /safe-area-inset-bottom/);
  assert.match(styles, /input,\s*textarea,\s*select\s*\{\s*font-size:\s*16px/);
  assert.match(chatStyles, /\.chat-input,[\s\S]*font-size:\s*16px/);
});

test("video calls do not render the audio-only backdrop over remote video", () => {
  const callStyles = readFileSync(
    new URL("../src/call-screen.css", import.meta.url),
    "utf8",
  );

  assert.match(
    callStyles,
    /\.call-screen \.call-audio-backdrop\s*\{[\s\S]*?display:\s*none;/,
  );
  assert.match(
    callStyles,
    /\.call-screen\.audio-call \.call-audio-backdrop\s*\{\s*display:\s*grid;/,
  );
});

test("chat call icon polish cannot trigger its MutationObserver forever", () => {
  const source = readFileSync(
    new URL("../src/chat-polish.js", import.meta.url),
    "utf8",
  );
  const guard = source.indexOf('button.dataset.modernCallIcon === "true"');
  const mark = source.indexOf('button.dataset.modernCallIcon = "true"');
  const replaceChildren = source.indexOf("button.innerHTML = CALL_ICONS[mode]");

  assert.ok(guard >= 0);
  assert.ok(mark > guard);
  assert.ok(replaceChildren > mark);
});

test("authentication controls keep a mobile-sized password visibility target", () => {
  const authScreen = readFileSync(
    new URL("../src/auth-screen.js", import.meta.url),
    "utf8",
  );

  assert.match(authScreen, /\.auth-v2-eye\{[^}]*width:44px;[^}]*height:44px/);
});

test("native iOS wrapper keeps media permission, background audio, atomic ReplayKit frames, and a trusted-origin boundary", () => {
  const viewController = readFileSync(
    new URL("../ios/AuroraCall/ViewController.swift", import.meta.url),
    "utf8",
  );
  const appDelegate = readFileSync(
    new URL("../ios/AuroraCall/AppDelegate.swift", import.meta.url),
    "utf8",
  );
  const info = readFileSync(
    new URL("../ios/AuroraCall/Info.plist", import.meta.url),
    "utf8",
  );
  const sampleHandler = readFileSync(
    new URL(
      "../ios/BroadcastUploadExtension/SampleHandler.swift",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(viewController, /WKUIDelegate/);
  assert.match(viewController, /requestMediaCapturePermissionFor/);
  assert.match(
    viewController,
    /decisionHandler\(isTrusted \? \.grant : \.deny\)/,
  );
  assert.match(viewController, /message\.frameInfo\.isMainFrame/);
  assert.match(viewController, /message\.frameInfo\.securityOrigin/);
  assert.match(
    viewController,
    /isTrustedOrigin\(scheme: origin\.protocol, host: origin\.host\)/,
  );
  assert.match(viewController, /decidePolicyFor navigationAction/);
  assert.match(viewController, /if isTrustedWebURL\(url\)/);
  assert.match(viewController, /decisionHandler\(\.cancel\)/);
  assert.match(appDelegate, /\.playAndRecord/);
  assert.match(appDelegate, /mode: \.videoChat/);
  assert.match(
    info,
    /<key>UIBackgroundModes<\/key>[\s\S]*<string>audio<\/string>/,
  );
  assert.ok(
    sampleHandler.indexOf("metadataData.write") <
      sampleHandler.indexOf("jpeg.write"),
  );
});
