const MAX_IMAGE_EDGE = 2560;
const IMAGE_QUALITY = 0.82;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({ image, url });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image_decode_failed"));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

function compressedName(name, extension) {
  const base = String(name || "photo").replace(/\.[^.]+$/, "");
  return `${base}.${extension}`;
}

export async function compressMediaForUpload(file, onProgress = () => {}) {
  if (!file?.type?.startsWith("image/")) {
    return { file, compressed: false, originalSize: file?.size || 0 };
  }

  onProgress(4);
  try {
    const { image, url } = await loadImage(file);
    onProgress(10);

    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) throw new Error("canvas_unavailable");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, width, height);
    URL.revokeObjectURL(url);
    onProgress(18);

    const prefersAlpha = file.type === "image/png" || file.type === "image/webp";
    let type = prefersAlpha ? "image/webp" : "image/jpeg";
    let blob = await canvasToBlob(canvas, type, IMAGE_QUALITY);
    if (!blob) {
      type = "image/jpeg";
      blob = await canvasToBlob(canvas, type, IMAGE_QUALITY);
    }
    onProgress(24);

    if (!blob || blob.size >= file.size * 0.96) {
      return { file, compressed: false, originalSize: file.size };
    }

    const extension = type === "image/webp" ? "webp" : "jpg";
    return {
      file: new File([blob], compressedName(file.name, extension), {
        type,
        lastModified: Date.now(),
      }),
      compressed: true,
      originalSize: file.size,
    };
  } catch (error) {
    console.warn("Aurora media compression fallback", error);
    return { file, compressed: false, originalSize: file?.size || 0 };
  }
}
