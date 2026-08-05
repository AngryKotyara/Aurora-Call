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
