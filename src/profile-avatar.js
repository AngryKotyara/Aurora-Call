const MAX_SOURCE_BYTES = 8 * 1024 * 1024;
const MAX_AVATAR_DATA_URL_LENGTH = 330000;
const AVATAR_SIZE = 384;

export function getSquareCrop(width, height) {
  const safeWidth = Number(width);
  const safeHeight = Number(height);
  if (!(safeWidth > 0) || !(safeHeight > 0)) throw new Error("invalid_image");
  const size = Math.min(safeWidth, safeHeight);
  return {
    sx: (safeWidth - size) / 2,
    sy: (safeHeight - size) / 2,
    size,
  };
}

export function validateAvatarFile(file) {
  if (!file || !String(file.type || "").startsWith("image/")) {
    throw new Error("invalid_avatar_type");
  }
  if (Number(file.size || 0) > MAX_SOURCE_BYTES) {
    throw new Error("avatar_too_large");
  }
  return file;
}

async function decodeImage(file) {
  if (typeof globalThis.createImageBitmap === "function") {
    try {
      const bitmap = await globalThis.createImageBitmap(file, {
        imageOrientation: "from-image",
      });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => bitmap.close?.(),
      };
    } catch {
      try {
        const bitmap = await globalThis.createImageBitmap(file);
        return {
          source: bitmap,
          width: bitmap.width,
          height: bitmap.height,
          cleanup: () => bitmap.close?.(),
        };
      } catch {
        // Fall through to the HTMLImageElement path for WebViews without
        // reliable createImageBitmap support.
      }
    }
  }

  if (typeof URL === "undefined" || typeof Image === "undefined") {
    throw new Error("unsupported_image");
  }

  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = "async";
  image.src = objectUrl;

  try {
    if (typeof image.decode === "function") await image.decode();
    else {
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
      });
    }
  } catch {
    URL.revokeObjectURL(objectUrl);
    throw new Error("unsupported_image");
  }

  return {
    source: image,
    width: image.naturalWidth || image.width,
    height: image.naturalHeight || image.height,
    cleanup: () => URL.revokeObjectURL(objectUrl),
  };
}

export async function prepareAvatar(file) {
  validateAvatarFile(file);
  const decoded = await decodeImage(file);

  try {
    const { sx, sy, size } = getSquareCrop(decoded.width, decoded.height);
    const canvas = document.createElement("canvas");
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("avatar_processing_failed");

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(
      decoded.source,
      sx,
      sy,
      size,
      size,
      0,
      0,
      AVATAR_SIZE,
      AVATAR_SIZE,
    );

    for (const quality of [0.86, 0.72, 0.58]) {
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      if (
        dataUrl.startsWith("data:image/jpeg;base64,") &&
        dataUrl.length <= MAX_AVATAR_DATA_URL_LENGTH
      ) {
        return dataUrl;
      }
    }

    throw new Error("avatar_processing_failed");
  } finally {
    decoded.cleanup?.();
  }
}

function setAvatarVisual(target, username, avatar) {
  if (!target) return;
  target.replaceChildren();
  target.classList.toggle("has-avatar", Boolean(avatar));

  if (avatar) {
    const image = document.createElement("img");
    image.src = avatar;
    image.alt = "";
    image.draggable = false;
    target.append(image);
    return;
  }

  target.textContent = String(username || "?")[0]?.toUpperCase() || "?";
}

function installFriendAvatars(friends) {
  const friendById = new Map(
    (friends || []).map((friend) => [String(friend.id), friend]),
  );

  document.querySelectorAll("[data-select]").forEach((card) => {
    const friend = friendById.get(String(card.dataset.select || ""));
    if (friend)
      setAvatarVisual(card.querySelector(".av"), friend.username, friend.avatar);
  });

  document.querySelectorAll(".friend-row .av").forEach((avatar, index) => {
    const friend = friends?.[index];
    if (friend) setAvatarVisual(avatar, friend.username, friend.avatar);
  });
}

export function installProfileAvatar({ session, friends, onChange, onRemove }) {
  installFriendAvatars(friends);

  const settingsScreen = document.querySelector("#logout")?.closest(".screen");
  const profileCard = settingsScreen?.querySelector(".card");
  if (!profileCard) return;

  profileCard.classList.add("profile-card");
  profileCard.replaceChildren();

  const picker = document.createElement("label");
  picker.className = "profile-avatar-picker";
  picker.setAttribute("aria-label", "Изменить фото профиля");

  const avatar = document.createElement("span");
  avatar.className = "profile-avatar";
  setAvatarVisual(avatar, session?.username, session?.avatar);

  const editBadge = document.createElement("span");
  editBadge.className = "profile-avatar-edit";
  editBadge.setAttribute("aria-hidden", "true");
  editBadge.textContent = "✎";

  const input = document.createElement("input");
  input.id = "profile-avatar-input";
  input.type = "file";
  input.accept = "image/*";
  input.hidden = true;

  picker.append(avatar, editBadge, input);

  const copy = document.createElement("div");
  copy.className = "profile-avatar-copy";

  const eyebrow = document.createElement("span");
  eyebrow.className = "muted";
  eyebrow.textContent = "Профиль";

  const title = document.createElement("h2");
  title.textContent = session?.username || "Пользователь";

  const hint = document.createElement("p");
  hint.className = "muted profile-avatar-hint";
  hint.textContent =
    "Нажмите на фото. Изображение автоматически подстроится под круглую область.";

  const status = document.createElement("span");
  status.className = "profile-avatar-status muted";
  status.setAttribute("role", "status");

  copy.append(eyebrow, title, hint, status);

  let removeButton = null;
  if (session?.avatar) {
    removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "profile-avatar-remove";
    removeButton.textContent = "Удалить фото";
    copy.append(removeButton);
  }

  profileCard.append(picker, copy);

  const setBusy = (busy) => {
    input.disabled = busy;
    if (removeButton) removeButton.disabled = busy;
    picker.classList.toggle("is-busy", busy);
    picker.setAttribute("aria-busy", busy ? "true" : "false");
    status.textContent = busy ? "Обрабатываем фото…" : "";
  };

  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      await onChange?.(file);
    } finally {
      if (input.isConnected) setBusy(false);
    }
  });

  removeButton?.addEventListener("click", async () => {
    setBusy(true);
    try {
      await onRemove?.();
    } finally {
      if (removeButton.isConnected) setBusy(false);
    }
  });
}
