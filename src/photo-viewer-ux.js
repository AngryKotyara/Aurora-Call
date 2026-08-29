const SWIPE_CLOSE_DISTANCE = 90;
const SWIPE_AXIS_RATIO = 1.25;

const VIEWER_STYLES = `
.chat-viewer {
  padding-top: calc(76px + env(safe-area-inset-top));
  padding-right: max(16px, env(safe-area-inset-right));
  padding-bottom: calc(28px + env(safe-area-inset-bottom));
  padding-left: max(16px, env(safe-area-inset-left));
  touch-action: pan-y;
  overscroll-behavior: contain;
}
.chat-viewer img {
  max-width: 100%;
  max-height: 100%;
  border-radius: 12px;
  transition: transform 180ms ease, opacity 180ms ease;
  will-change: transform, opacity;
  touch-action: pan-y pinch-zoom;
}
.chat-viewer-close {
  position: fixed;
  top: calc(12px + env(safe-area-inset-top));
  right: max(14px, env(safe-area-inset-right));
  z-index: 2;
  width: auto;
  min-width: 96px;
  height: 48px;
  padding: 0 18px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 24px;
  background: rgba(30, 32, 39, 0.82);
  color: #fff;
  font: inherit;
  font-size: 15px;
  font-weight: 650;
  letter-spacing: 0.01em;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.28);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.chat-viewer-close::before {
  content: "×";
  font-size: 25px;
  font-weight: 400;
  line-height: 1;
  margin-top: -2px;
}
.chat-viewer-close:active {
  transform: scale(0.96);
}
.chat-viewer.is-dragging img {
  transition: none;
}
.chat-viewer-hint {
  position: fixed;
  left: 50%;
  bottom: calc(16px + env(safe-area-inset-bottom));
  transform: translateX(-50%);
  margin: 0;
  padding: 7px 12px;
  border-radius: 14px;
  background: rgba(24, 26, 32, 0.72);
  color: rgba(255, 255, 255, 0.68);
  font-size: 12px;
  pointer-events: none;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}
@media (max-width: 520px) {
  .chat-viewer {
    padding-left: 10px;
    padding-right: 10px;
  }
  .chat-viewer-close {
    min-width: 104px;
    height: 50px;
  }
}
`;

function installStyles() {
  if (document.querySelector("style[data-photo-viewer-ux]")) return;
  const style = document.createElement("style");
  style.dataset.photoViewerUx = "true";
  style.textContent = VIEWER_STYLES;
  document.head.append(style);
}

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

installStyles();
const observer = new MutationObserver(scan);
observer.observe(document.documentElement, { childList: true, subtree: true });
scan();
