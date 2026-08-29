import "./photo-viewer-ux.css";

const SWIPE_CLOSE_DISTANCE = 90;
const SWIPE_AXIS_RATIO = 1.25;

function closeViewer(viewer) {
  viewer.remove();
}

function enhanceViewer(viewer) {
  if (!(viewer instanceof HTMLElement)) return;
  if (!viewer.classList.contains("chat-viewer")) return;
  if (viewer.dataset.closeUxBound === "true") return;
  viewer.dataset.closeUxBound = "true";

  const close = viewer.querySelector(".chat-viewer-close");
  if (close) close.textContent = "Закрыть";

  const hint = document.createElement("p");
  hint.className = "chat-viewer-hint";
  hint.textContent = "Смахните вниз, чтобы закрыть";
  viewer.append(hint);

  const image = viewer.querySelector("img");
  let startX = 0;
  let startY = 0;
  let deltaY = 0;
  let tracking = false;

  const resetImage = () => {
    viewer.classList.remove("is-dragging");
    if (!image) return;
    image.style.transform = "";
    image.style.opacity = "";
  };

  viewer.addEventListener(
    "touchstart",
    (event) => {
      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      deltaY = 0;
      tracking = true;
    },
    { passive: true },
  );

  viewer.addEventListener(
    "touchmove",
    (event) => {
      if (!tracking || event.touches.length !== 1) return;
      const touch = event.touches[0];
      const deltaX = touch.clientX - startX;
      deltaY = Math.max(0, touch.clientY - startY);
      if (deltaY <= 0 || deltaY < Math.abs(deltaX) * SWIPE_AXIS_RATIO) return;

      viewer.classList.add("is-dragging");
      if (image) {
        const scale = Math.max(0.92, 1 - deltaY / 1600);
        const opacity = Math.max(0.52, 1 - deltaY / 420);
        image.style.transform = `translateY(${deltaY}px) scale(${scale})`;
        image.style.opacity = String(opacity);
      }
    },
    { passive: true },
  );

  viewer.addEventListener("touchend", () => {
    if (!tracking) return;
    tracking = false;
    if (deltaY >= SWIPE_CLOSE_DISTANCE) {
      closeViewer(viewer);
      return;
    }
    resetImage();
  });

  viewer.addEventListener("touchcancel", () => {
    tracking = false;
    resetImage();
  });

  const onKeyDown = (event) => {
    if (event.key === "Escape" && viewer.isConnected) closeViewer(viewer);
  };
  document.addEventListener("keydown", onKeyDown, { once: true });
}

function scan() {
  document.querySelectorAll(".chat-viewer").forEach(enhanceViewer);
}

const observer = new MutationObserver(scan);
observer.observe(document.documentElement, { childList: true, subtree: true });
scan();
