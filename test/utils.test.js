import assert from "node:assert/strict";
import test from "node:test";

import {
  escapeHtml,
  formatCallDate,
  formatCallDuration,
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

test("formatCallDate uses readable labels for recent calls", () => {
  const now = new Date(2026, 7, 6, 12, 0);

  assert.equal(
    formatCallDate(new Date(2026, 7, 6, 9, 5), now),
    "Сегодня, 09:05",
  );
  assert.equal(
    formatCallDate(new Date(2026, 7, 5, 23, 7), now),
    "Вчера, 23:07",
  );
  assert.equal(formatCallDate("not-a-date", now), "Дата неизвестна");
});

test("formatCallDuration formats short and long calls", () => {
  assert.equal(formatCallDuration(null), "");
  assert.equal(formatCallDuration("invalid"), "");
  assert.equal(formatCallDuration(0), "0:00");
  assert.equal(formatCallDuration(65.9), "1:05");
  assert.equal(formatCallDuration(3725), "1:02:05");
});
