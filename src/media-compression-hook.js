import { compressMediaForUpload } from "./media-compress.js";

let processing = false;

document.addEventListener(
  "change",
  async (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;
    if (!input.classList.contains("chat-file")) return;
    if (input.dataset.compressionReady === "true") {
      delete input.dataset.compressionReady;
      return;
    }

    const source = input.files?.[0];
    if (!source || processing || !source.type.startsWith("image/")) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    processing = true;
    input.disabled = true;

    try {
      const result = await compressMediaForUpload(source);
      const transfer = new DataTransfer();
      transfer.items.add(result.file);
      input.files = transfer.files;
      input.dataset.compressionReady = "true";
      input.dispatchEvent(new Event("change", { bubbles: true }));
    } catch (error) {
      console.warn("Aurora compression hook fallback", error);
      input.dataset.compressionReady = "true";
      input.dispatchEvent(new Event("change", { bubbles: true }));
    } finally {
      input.disabled = false;
      processing = false;
    }
  },
  true,
);
