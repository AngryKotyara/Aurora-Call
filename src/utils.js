export function query(selector) {
  return document.querySelector(selector);
}

export function escapeHtml(value) {
  const entities = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };

  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) => entities[character],
  );
}

export function isValidUsername(username) {
  return /^[\p{L}0-9_]{3,24}$/u.test(username);
}

export async function hashSecret(secret) {
  const encoded = new TextEncoder().encode(secret);
  const digest = await crypto.subtle.digest("SHA-256", encoded);

  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export function generateAccessKey() {
  return [...crypto.getRandomValues(new Uint32Array(8))]
    .map((value) => value.toString(36))
    .join("-");
}

function padDatePart(value) {
  return String(value).padStart(2, "0");
}

export function formatCallDate(value, now = new Date()) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "Дата неизвестна";

  const startOfDate = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const dayDifference = Math.round(
    (startOfToday.getTime() - startOfDate.getTime()) / 86_400_000,
  );
  const time = `${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}`;

  if (dayDifference === 0) return `Сегодня, ${time}`;
  if (dayDifference === 1) return `Вчера, ${time}`;

  return `${padDatePart(date.getDate())}.${padDatePart(date.getMonth() + 1)}.${date.getFullYear()}, ${time}`;
}

export function downloadAccessKey(username, accessKey) {
  const link = document.createElement("a");
  const file = new Blob([`Aurora Call\nИмя: ${username}\nКлюч: ${accessKey}`]);
  const objectUrl = URL.createObjectURL(file);

  link.href = objectUrl;
  link.download = `aurora-${username}-key.txt`;
  link.click();
  URL.revokeObjectURL(objectUrl);
}

export function showToast(message, isSuccess = false) {
  query(".toast")?.remove();
  document.body.insertAdjacentHTML(
    "beforeend",
    `<div class="toast ${isSuccess ? "ok" : ""}" role="status">${escapeHtml(message)}</div>`,
  );
  window.setTimeout(() => query(".toast")?.remove(), 3_000);
}
