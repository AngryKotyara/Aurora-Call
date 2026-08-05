import assert from "node:assert/strict";
import test from "node:test";

import {
  escapeHtml,
  generateAccessKey,
  hashSecret,
  isValidUsername,
} from "../src/utils.js";

test("escapeHtml escapes text rendered through templates", () => {
  assert.equal(
    escapeHtml('<script data-test="x">&</script>'),
    "&lt;script data-test=&quot;x&quot;&gt;&amp;&lt;/script&gt;",
  );
});

test("usernames support letters, numbers, and underscores", () => {
  assert.equal(isValidUsername("Аврора_24"), true);
  assert.equal(isValidUsername("ab"), false);
  assert.equal(isValidUsername("not allowed"), false);
});

test("hashSecret returns a stable SHA-256 digest", async () => {
  assert.equal(
    await hashSecret("aurora"),
    "9b89025ce7a6d932b28f6e15132a70d402f723874a425e9b4c7cc3b179fa66ce",
  );
});

test("generateAccessKey creates eight non-empty segments", () => {
  assert.equal(generateAccessKey().split("-").filter(Boolean).length, 8);
});
