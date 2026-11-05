import { rpc } from "../api.js";
import { state } from "../state.js";
import { escapeHtml, showToast } from "../utils.js";

const MAX_MEDIA_BYTES = 250 * 1024 * 1024;

function readFileBase64(file, onProgress) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = (event) => {
      if (event.lengthComputable)
        onProgress(Math.min(65, Math.round((event.loaded / event.total) * 65)));
    };
    reader.onload = () => {
      onProgress(68);
      resolve(String(reader.result).split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function createUploadBubble(file) {
  const messagesEl = document.querySelector(".chat-messages");
  messagesEl?.querySelector(".chat-empty-conversation")?.remove();
  const article = document.createElement("article");
  article.className = "chat-bubble outgoing chat-upload-bubble";
  const preview = URL.createObjectURL(file),
    isImage = file.type.startsWith("image/");
  article.innerHTML = `<div class="chat-upload-preview">${isImage ? `<img src="${preview}" alt="${escapeHtml(file.name)}">` : `<video src="${preview}" muted playsinline></video>`}<div class="chat-upload-mask"><span class="chat-upload-ring" style="--p:0"><b>0%</b></span><small>Отправка ${isImage ? "фото" : "видео"}</small></div></div><div class="chat-message-meta"><span>${escapeHtml(file.name)}</span></div>`;
  messagesEl?.append(article);
  if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
  return {
    article,
    preview,
    update(value) {
      const ring = article.querySelector(".chat-upload-ring");
      if (ring) {
        ring.style.setProperty("--p", String(value));
        ring.querySelector("b").textContent = `${value}%`;
      }
    },
  };
}

export async function sendMedia(file, { getOpenedFriend, renderConversation }) {
  if (!file || !getOpenedFriend()) return;
  if (!file.type.startsWith("image/") && !file.type.startsWith("video/"))
    return showToast("Можно отправлять фото и видео");
  if (file.size > MAX_MEDIA_BYTES)
    return showToast("Файл слишком большой. Максимум 250 МБ");
  const upload = createUploadBubble(file);
  let fakeProgress = null;
  try {
    const base64 = await readFileBase64(file, (p) => upload.update(p));
    let p = 70;
    upload.update(p);
    fakeProgress = window.setInterval(() => {
      p = Math.min(94, p + Math.max(1, Math.round((95 - p) / 5)));
      upload.update(p);
    }, 180);
    await rpc("upload_chat_media", {
      p_token: state.session.token,
      p_to: getOpenedFriend().id,
      p_kind: file.type.startsWith("image/") ? "image" : "video",
      p_body: null,
      p_media_mime: file.type,
      p_media_name: file.name,
      p_media_base64: base64,
    });
    upload.update(100);
    await new Promise((resolve) => setTimeout(resolve, 180));
    await renderConversation();
  } catch (error) {
    console.error("Failed to send chat media", error);
    upload.article.classList.add("is-failed");
    upload.article.querySelector(".chat-upload-mask small").textContent =
      "Ошибка отправки";
    showToast("Не удалось отправить файл");
  } finally {
    if (fakeProgress) clearInterval(fakeProgress);
    URL.revokeObjectURL(upload.preview);
  }
}
