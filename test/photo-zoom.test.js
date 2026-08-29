import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  clampPhotoScale,
  clampPhotoTranslation,
  focalZoomTranslation,
  touchDistance,
  touchMidpoint,
} from "../src/photo-zoom.js";

test("photo zoom stays between 1x and 4x", () => {
  assert.equal(clampPhotoScale(0.2), 1);
  assert.equal(clampPhotoScale(2.5), 2.5);
  assert.equal(clampPhotoScale(8), 4);
  assert.equal(clampPhotoScale(Number.NaN), 1);
});

test("photo pan is clamped to the visible bounds", () => {
  assert.equal(clampPhotoTranslation(80, 50), 50);
  assert.equal(clampPhotoTranslation(-80, 50), -50);
  assert.equal(clampPhotoTranslation(25, 50), 25);
  assert.equal(clampPhotoTranslation(10, 0), 0);
});

test("pinch helpers measure the midpoint and distance", () => {
  const first = { clientX: 10, clientY: 20 };
  const second = { clientX: 40, clientY: 60 };
  assert.equal(touchDistance(first, second), 50);
  assert.deepEqual(touchMidpoint(first, second), { x: 25, y: 40 });
});

test("zooming around a touch keeps that point under the fingers", () => {
  const input = {
    centerX: 200,
    centerY: 400,
    focalX: 260,
    focalY: 470,
    startScale: 1,
    startX: 0,
    startY: 0,
    nextScale: 2.5,
  };
  const translated = focalZoomTranslation(input);
  const localX = (input.focalX - input.centerX) / input.startScale;
  const localY = (input.focalY - input.centerY) / input.startScale;

  assert.equal(
    input.centerX + translated.x + input.nextScale * localX,
    input.focalX,
  );
  assert.equal(
    input.centerY + translated.y + input.nextScale * localY,
    input.focalY,
  );
});

test("pinch zoom transforms only the photo and blocks Safari page zoom", () => {
  const source = readFileSync(
    new URL("../src/photo-viewer-ux.js", import.meta.url),
    "utf8",
  );

  assert.match(source, /image\.style\.transform/);
  assert.doesNotMatch(source, /viewer\.style\.transform/);
  assert.match(source, /\["gesturestart", "gesturechange", "gestureend"\]/);
  assert.match(source, /preventNativePageZoom/);
});
