import assert from "node:assert/strict";
import test from "node:test";

import { getSquareCrop, validateAvatarFile } from "../src/profile-avatar.js";

test("square crop centers landscape and portrait images", () => {
  assert.deepEqual(getSquareCrop(1600, 900), {
    sx: 350,
    sy: 0,
    size: 900,
  });
  assert.deepEqual(getSquareCrop(900, 1600), {
    sx: 0,
    sy: 350,
    size: 900,
  });
});

test("avatar validation rejects non-images and oversized source files", () => {
  assert.throws(
    () => validateAvatarFile({ type: "text/plain", size: 100 }),
    /invalid_avatar_type/,
  );
  assert.throws(
    () => validateAvatarFile({ type: "image/jpeg", size: 8 * 1024 * 1024 + 1 }),
    /avatar_too_large/,
  );
  assert.doesNotThrow(() =>
    validateAvatarFile({ type: "image/png", size: 1024 }),
  );
});
