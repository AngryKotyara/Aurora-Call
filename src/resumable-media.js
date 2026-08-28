import { config } from "./config.js";
import { rpc } from "./api.js";
import { state } from "./state.js";
import { escapeHtml, showToast } from "./utils.js";

const EDGE_URL =
  "https://taqpirplpmjihmkztwlv.supabase.co/functions/v1/aurora-chat-media";
const CHUNK_SIZE = 6 * 1024 * 1024;
const MAX_BYTES = 1024 * 1024 * 1024;
const RETRIES = [0, 1000, 3000, 5000, 10000, 20000];
const FINALIZE_RETRIES = [0, 300, 800, 1600, 3000];

let activeFriend = null;
let inputObserver = null;

function rememberFriend(id, name = "") {
  if (!id) return;
  activeFriend = { id: String(id), name: String(name || "") };
}

document.addEventListener(
  "click",
  (event) => {
    const thread = event.target.closest?.("[data-chat-friend]");
    if (thread)
      rememberFriend(thread.dataset.chatFriend, thread.dataset.chatName);
    const button = event.target.closest?.("[data-message-friend]");
    if (button)
      rememberFriend(
        button.dataset.messageFriend,
        button.getAttribute("aria-label")?.replace(/^Написать\s+/, "") || "",
      );
  },
  true,
);

document.addEventListener("aurora-chat-open", (event) => {
  rememberFriend(event.detail?.id, event.detail?.name);
});

function b64(value) {
  const bytes = new TextEncoder().encode(String(value));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function metadata(ticket, file) {
  return [
    ["bucketName", ticket.bucket],
    ["objectName", ticket.path],
    ["contentType", file.type || "application/octet-stream"],
    ["cacheControl", "3600"],
  ]
    .map(([key, value]) => `${key} ${b64(value)}`)
    .join(",");
}

async function edge(body) {
  const response = await fetch(EDGE_URL, {
    method: "POST",
    headers: {
      apikey: config.supabasePublishableKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.ok)
    throw new Error(payload?.error || `edge_${response.status}`);
  return payload;
}

async function getTicket(file, friend) {
  return edge({
    action: "ticket",
    token: state.session?.token,
    to: friend.id,
    kind: file.type.startsWith("image/") ? "image" : "video",
    mime: file.type || "video/quicktime",
    name: file.name,
    size: file.size,
  });
}

async function sleep(ms) {
  if (ms) await new Promise((resolve) => setTimeout(resolve, ms));
}

function signedTusHeaders(ticket, extra = {}) {
  return {
    "Tus-Resumable": "1.0.0",
    "x-signature": ticket.signature,
    ...extra,
  };
}

async function headOffset(url, ticket) {
  const response = await fetch(url, {
    method: "HEAD",
    headers: signedTusHeaders(ticket),
  });
  if (!response.ok) throw new Error(`head_${response.status}`);
  return Number(response.headers.get("Upload-Offset") || 0);
}

async function createTusUpload(file, ticket) {
  const response = await fetch(ticket.endpoint, {
    method: "POST",
    headers: signedTusHeaders(ticket, {
      "Upload-Length": String(file.size),
      "Upload-Metadata": metadata(ticket, file),
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `tus_create_${response.status}${text ? `:${text.slice(0, 180)}` : ""}`,
    );
  }
  const location = response.headers.get("Location");
  if (!location) throw new Error("tus_missing_location");
  return new URL(location, ticket.endpoint).href;
}

async function patchChunk(url, ticket, blob, offset) {
  const response = await fetch(url, {
    method: "PATCH",
    headers: signedTusHeaders(ticket, {
      "Upload-Offset": String(offset),
      "Content-Type": "application/offset+octet-stream",
    }),
    body: blob,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `tus_patch_${response.status}${text ? `:${text.slice(0, 180)}` : ""}`,
    );
  }
  return Number(response.headers.get("Upload-Offset") || offset + blob.size);
}

function fingerprint(file, friend) {
  return `aurora_tus_${friend.id}_${file.name}_${file.size}_${file.lastModified}`;
}

async function resumableUpload(file, friend, onProgress) {
  const key = fingerprint(file, friend);
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(key) || "null");
  } catch {}

  let ticket = null;
  let uploadUrl = "";
  let offset = 0;

  if (saved?.url && saved?.signature && saved?.path && saved?.bucket) {
    ticket = saved;
    uploadUrl = saved.url;
    try {
      offset = await headOffset(uploadUrl, ticket);
    } catch {
      localStorage.removeItem(key);
      ticket = null;
      uploadUrl = "";
    }
  }

  if (!ticket) {
    ticket = await getTicket(file, friend);
    uploadUrl = await createTusUpload(file, ticket);
    ticket = { ...ticket, url: uploadUrl };
    localStorage.setItem(key, JSON.stringify(ticket));
  }

  onProgress(Math.min(96, Math.round((offset / file.size) * 96)));

  while (offset < file.size) {
    const end = Math.min(file.size, offset + CHUNK_SIZE);
    const chunk = file.slice(offset, end);
    let completed = false;
    let lastError = null;

    for (const delay of RETRIES) {
      try {
        await sleep(delay);
        offset = await patchChunk(uploadUrl, ticket, chunk, offset);
        completed = true;
        break;
      } catch (error) {
        lastError = error;
        try {
          offset = await headOffset(uploadUrl, ticket);
        } catch {}
        if (offset >= end) {
          completed = true;
          break;
        }
      }
    }

    if (!completed) throw lastError || new Error("upload_failed");
    onProgress(
      Math.min(96, Math.max(1, Math.round((offset / file.size) * 96))),
    );
  }

  return { ticket, key };
}

function createUploadBubble(file) {
  const messages = document.querySelector(".chat-messages");
  messages?.querySelector(".chat-empty-conversation")?.remove();
  const article = document.createElement("article");
  article.className = "chat-bubble outgoing chat-upload-bubble";
  const preview = URL.createObjectURL(file);
  const image = file.type.startsWith("image/");
  article.innerHTML = `<div class="chat-upload-preview">${image ? `<img src="${preview}" alt="${escapeHtml(file.name)}">` : `<video src="${preview}" muted playsinline></video>`}<div class="chat-upload-mask"><span class="chat-upload-ring" style="--p:0"><b>0%</b></span><small>Отправка ${image ? "фото" : "видео"}</small></div></div><div class="chat-message-meta"><span>${escapeHtml(file.name)}</span></div>`;
  messages?.append(article);
  if (messages) messages.scrollTop = messages.scrollHeight;
  return {
    article,
    preview,
    update(value, label = "") {
      const ring = article.querySelector(".chat-upload-ring");
      if (ring) {
        ring.style.setProperty("--p", String(value));
        const valueNode = ring.querySelector("b");
        if (valueNode) valueNode.textContent = `${value}%`;
      }
      if (label) {
        const labelNode = article.querySelector(".chat-upload-mask small");
        if (labelNode) labelNode.textContent = label;
      }
    },
  };
}

async function finalizeMessage(file, friend, ticket) {
  let lastError = null;
  for (const delay of FINALIZE_RETRIES) {
    try {
      await sleep(delay);
      return await rpc("complete_chat_storage_media", {
        p_token: state.session.token,
        p_to: friend.id,
        p_kind: file.type.startsWith("image/") ? "image" : "video",
        p_body: null,
        p_media_mime: file.type || "video/quicktime",
        p_media_name: file.name,
        p_object_path: ticket.path,
        p_size: file.size,
      });
    } catch (error) {
      lastError = error;
      console.warn("Aurora media finalize retry", error);
    }
  }
  throw lastError || new Error("finalize_failed");
}

export async function handleResumableMedia(file) {
  const friend = activeFriend;
  if (!friend?.id || !state.session?.token) {
    showToast("Откройте чат с другом и попробуйте снова");
    return;
  }
  const isImage = file.type.startsWith("image/");
  const isVideo =
    file.type.startsWith("video/") ||
    /\.(mov|mp4|m4v|webm)$/i.test(file.name || "");
  if (!(isImage || isVideo)) {
    showToast("Можно отправлять фото и видео");
    return;
  }
  if (file.size > MAX_BYTES) {
    showToast("Файл слишком большой. Максимум 1 ГБ");
    return;
  }

  const ui = createUploadBubble(file);
  try {
    const { ticket, key } = await resumableUpload(file, friend, (value) =>
      ui.update(value),
    );
    ui.update(97, "Сохраняем сообщение…");
    await finalizeMessage(file, friend, ticket);
    localStorage.removeItem(key);
    ui.update(100, "Отправлено");
    window.setTimeout(() => {
      ui.article.remove();
      document.dispatchEvent(new CustomEvent("aurora-chat-media-complete"));
    }, 450);
  } catch (error) {
    console.error("Resumable upload failed", error);
    ui.article.classList.add("is-failed");
    const ring = ui.article.querySelector(".chat-upload-ring b");
    const current = Number.parseInt(ring?.textContent || "0", 10) || 0;
    ui.update(
      current,
      current >= 96
        ? "Не удалось сохранить сообщение — повторите файл"
        : `Ошибка загрузки${error?.message ? ` (${String(error.message).slice(0, 32)})` : ""} — повторите файл`,
    );
    showToast(
      current >= 96
        ? "Видео загружено. Выберите тот же файл ещё раз — повторно загружать его не придётся."
        : "Не удалось отправить файл. Повторная попытка продолжит загрузку.",
    );
  } finally {
    URL.revokeObjectURL(ui.preview);
  }
}

function bindInput(input) {
  if (
    !(input instanceof HTMLInputElement) ||
    !input.classList.contains("chat-file")
  )
    return;
  if (input.dataset.resumableBound === "true") return;
  input.dataset.resumableBound = "true";
  input.onchange = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const file = input.files?.[0];
    if (!file) return;
    void handleResumableMedia(file);
    input.value = "";
  };
}

function bindInputs() {
  document.querySelectorAll("input.chat-file").forEach(bindInput);
}

document.addEventListener(
  "change",
  (event) => {
    const input = event.target;
    if (
      !(input instanceof HTMLInputElement) ||
      !input.classList.contains("chat-file")
    )
      return;
    const file = input.files?.[0];
    if (!file) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void handleResumableMedia(file);
    input.value = "";
  },
  true,
);

bindInputs();
inputObserver = new MutationObserver(bindInputs);
inputObserver.observe(document.documentElement, {
  childList: true,
  subtree: true,
});
window.auroraHandleResumableMedia = handleResumableMedia;
