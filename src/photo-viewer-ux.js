import {
  clampPhotoScale,
  clampPhotoTranslation,
  focalZoomTranslation,
  MAX_PHOTO_SCALE,
  MIN_PHOTO_SCALE,
  touchDistance,
  touchMidpoint,
} from "./photo-zoom.js";

const SWIPE_CLOSE_DISTANCE = 90;
const SWIPE_AXIS_RATIO = 1.25;
const DOUBLE_TAP_DELAY = 320;
const DOUBLE_TAP_DISTANCE = 36;
const DOUBLE_TAP_SCALE = 2.5;

const VIEWER_STYLES = `
.chat-viewer {
  padding-top: calc(76px + env(safe-area-inset-top));
  padding-right: max(16px, env(safe-area-inset-right));
  padding-bottom: calc(28px + env(safe-area-inset-bottom));
  padding-left: max(16px, env(safe-area-inset-left));
  overflow: hidden;
  touch-action: none;
  overscroll-behavior: contain;
  user-select: none;
  -webkit-user-select: none;
}
.chat-viewer img {
  max-width: 100%;
  max-height: 100%;
  border-radius: 12px;
  transform-origin: 50% 50%;
  transition: transform 180ms ease, opacity 180ms ease;
  will-change: transform, opacity;
  touch-action: none;
  -webkit-user-drag: none;
}
.chat-viewer.is-zoomed img {
  cursor: grab;
}
.chat-viewer.is-interacting img,
.chat-viewer.is-swipe-closing img {
  transition: none;
}
.chat-viewer.is-interacting img {
  cursor: grabbing;
}
.chat-viewer-close {
  position: fixed;
  top: calc(12px + env(safe-area-inset-top));
  right: max(14px, env(safe-area-inset-right));
  z-index: 3;
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
.chat-viewer-hint {
  position: fixed;
  left: 50%;
  bottom: calc(16px + env(safe-area-inset-bottom));
  z-index: 2;
  transform: translateX(-50%);
  width: max-content;
  max-width: calc(100vw - 24px);
  margin: 0;
  padding: 7px 12px;
  border-radius: 14px;
  background: rgba(24, 26, 32, 0.72);
  color: rgba(255, 255, 255, 0.68);
  font-size: 12px;
  text-align: center;
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
@media (prefers-reduced-motion: reduce) {
  .chat-viewer img {
    transition: none;
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

  const image = viewer.querySelector("img");
  if (!image) return;
  image.draggable = false;

  const hint = document.createElement("p");
  hint.className = "chat-viewer-hint";
  hint.textContent = "Разведите пальцы для увеличения";
  viewer.append(hint);

  let scale = MIN_PHOTO_SCALE;
  let translateX = 0;
  let translateY = 0;
  let gesture = null;
  let mouseGesture = null;
  let lastTap = null;
  let lastTouchAt = 0;
  let cleanedUp = false;
  let removalObserver = null;

  const availableViewport = () => {
    const style = window.getComputedStyle(viewer);
    const horizontal =
      (Number.parseFloat(style.paddingLeft) || 0) +
      (Number.parseFloat(style.paddingRight) || 0);
    const vertical =
      (Number.parseFloat(style.paddingTop) || 0) +
      (Number.parseFloat(style.paddingBottom) || 0);
    return {
      width: Math.max(0, viewer.clientWidth - horizontal),
      height: Math.max(0, viewer.clientHeight - vertical),
    };
  };

  const panBounds = (nextScale = scale) => {
    const viewport = availableViewport();
    return {
      x: Math.max(0, (image.offsetWidth * nextScale - viewport.width) / 2),
      y: Math.max(0, (image.offsetHeight * nextScale - viewport.height) / 2),
    };
  };

  const clampPan = () => {
    const bounds = panBounds();
    translateX = clampPhotoTranslation(translateX, bounds.x);
    translateY = clampPhotoTranslation(translateY, bounds.y);
    if (scale <= MIN_PHOTO_SCALE + 0.001) {
      translateX = 0;
      translateY = 0;
    }
  };

  const render = () => {
    image.style.transform = `translate3d(${translateX}px, ${translateY}px, 0) scale(${scale})`;
    image.style.opacity = "";
    viewer.classList.toggle("is-zoomed", scale > MIN_PHOTO_SCALE + 0.001);
    viewer.dataset.photoScale = scale.toFixed(2);
    hint.textContent =
      scale > MIN_PHOTO_SCALE + 0.001
        ? "Перемещайте фото одним пальцем"
        : "Разведите пальцы для увеличения";
  };

  const baseCenter = () => {
    const rect = image.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2 - translateX,
      y: rect.top + rect.height / 2 - translateY,
    };
  };

  const viewerCenter = () => {
    const rect = viewer.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  };

  const setScale = (value, focalPoint = viewerCenter()) => {
    const nextScale = clampPhotoScale(value);
    const center = baseCenter();
    const translation = focalZoomTranslation({
      centerX: center.x,
      centerY: center.y,
      focalX: focalPoint.x,
      focalY: focalPoint.y,
      startScale: scale,
      startX: translateX,
      startY: translateY,
      nextScale,
    });
    scale = nextScale;
    translateX = translation.x;
    translateY = translation.y;
    clampPan();
    render();
  };

  const resetZoom = () => {
    scale = MIN_PHOTO_SCALE;
    translateX = 0;
    translateY = 0;
    render();
  };

  const resetSwipeVisual = () => {
    viewer.classList.remove("is-swipe-closing");
    render();
  };

  const registerTap = (point) => {
    const now = Date.now();
    if (
      lastTap &&
      now - lastTap.time <= DOUBLE_TAP_DELAY &&
      Math.hypot(point.x - lastTap.x, point.y - lastTap.y) <=
        DOUBLE_TAP_DISTANCE
    ) {
      lastTap = null;
      if (scale > MIN_PHOTO_SCALE + 0.001) resetZoom();
      else setScale(DOUBLE_TAP_SCALE, point);
      return;
    }
    lastTap = { ...point, time: now };
  };

  const isControl = (target) =>
    target instanceof Element && Boolean(target.closest(".chat-viewer-close"));

  // Safari exposes its own pinch gesture on top of touch events. Keep that
  // native page zoom disabled only inside the open viewer; our touch handlers
  // below apply every scale and translation exclusively to the photo element.
  const preventNativePageZoom = (event) => event.preventDefault();
  const nativeGestureEvents = ["gesturestart", "gesturechange", "gestureend"];
  nativeGestureEvents.forEach((eventName) => {
    viewer.addEventListener(eventName, preventNativePageZoom, {
      passive: false,
    });
  });

  viewer.addEventListener(
    "touchstart",
    (event) => {
      if (isControl(event.target)) return;
      lastTouchAt = Date.now();

      if (event.touches.length >= 2) {
        event.preventDefault();
        const first = event.touches[0];
        const second = event.touches[1];
        const midpoint = touchMidpoint(first, second);
        const center = baseCenter();
        gesture = {
          type: "pinch",
          startDistance: Math.max(1, touchDistance(first, second)),
          startScale: scale,
          center,
          localX: (midpoint.x - center.x - translateX) / scale,
          localY: (midpoint.y - center.y - translateY) / scale,
        };
        viewer.classList.remove("is-swipe-closing");
        viewer.classList.add("is-interacting");
        return;
      }

      if (event.touches.length !== 1) return;
      event.preventDefault();
      const touch = event.touches[0];
      gesture = {
        type: scale > MIN_PHOTO_SCALE + 0.001 ? "pan" : "swipe",
        startX: touch.clientX,
        startY: touch.clientY,
        startTranslateX: translateX,
        startTranslateY: translateY,
        deltaY: 0,
        swipeActive: false,
        moved: false,
      };
      if (gesture.type === "pan") viewer.classList.add("is-interacting");
    },
    { passive: false },
  );

  viewer.addEventListener(
    "touchmove",
    (event) => {
      if (!gesture || isControl(event.target)) return;

      if (gesture.type === "pinch" && event.touches.length >= 2) {
        event.preventDefault();
        const first = event.touches[0];
        const second = event.touches[1];
        const midpoint = touchMidpoint(first, second);
        scale = clampPhotoScale(
          gesture.startScale *
            (touchDistance(first, second) / gesture.startDistance),
        );
        translateX = midpoint.x - gesture.center.x - scale * gesture.localX;
        translateY = midpoint.y - gesture.center.y - scale * gesture.localY;
        clampPan();
        render();
        return;
      }

      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      const deltaX = touch.clientX - gesture.startX;
      const deltaY = touch.clientY - gesture.startY;
      gesture.moved = Math.hypot(deltaX, deltaY) > 8;

      if (gesture.type === "pan") {
        event.preventDefault();
        translateX = gesture.startTranslateX + deltaX;
        translateY = gesture.startTranslateY + deltaY;
        clampPan();
        render();
        return;
      }

      const downward = Math.max(0, deltaY);
      if (downward <= 0 || downward < Math.abs(deltaX) * SWIPE_AXIS_RATIO) {
        gesture.deltaY = 0;
        gesture.swipeActive = false;
        resetSwipeVisual();
        return;
      }

      event.preventDefault();
      gesture.deltaY = downward;
      gesture.swipeActive = true;
      const closeScale = Math.max(0.92, 1 - downward / 1600);
      const opacity = Math.max(0.52, 1 - downward / 420);
      viewer.classList.add("is-swipe-closing");
      image.style.transform = `translate3d(0, ${downward}px, 0) scale(${closeScale})`;
      image.style.opacity = String(opacity);
    },
    { passive: false },
  );

  const finishTouch = (event, cancelled = false) => {
    if (!gesture) return;
    const completed = gesture;
    gesture = null;
    viewer.classList.remove("is-interacting");

    if (
      !cancelled &&
      completed.type === "swipe" &&
      completed.swipeActive &&
      completed.deltaY >= SWIPE_CLOSE_DISTANCE
    ) {
      closeViewer(viewer);
      return;
    }

    resetSwipeVisual();
    clampPan();
    render();

    if (!cancelled && completed.type !== "pinch" && !completed.moved) {
      const touch = event.changedTouches?.[0];
      if (touch) registerTap({ x: touch.clientX, y: touch.clientY });
    }
  };

  viewer.addEventListener("touchend", (event) => finishTouch(event));
  viewer.addEventListener("touchcancel", (event) => finishTouch(event, true));

  viewer.addEventListener("dblclick", (event) => {
    if (Date.now() - lastTouchAt < 700 || isControl(event.target)) return;
    event.preventDefault();
    if (scale > MIN_PHOTO_SCALE + 0.001) resetZoom();
    else setScale(DOUBLE_TAP_SCALE, { x: event.clientX, y: event.clientY });
  });

  viewer.addEventListener(
    "wheel",
    (event) => {
      if (isControl(event.target)) return;
      event.preventDefault();
      setScale(scale * Math.exp(-event.deltaY * 0.0015), {
        x: event.clientX,
        y: event.clientY,
      });
    },
    { passive: false },
  );

  image.addEventListener("mousedown", (event) => {
    if (event.button !== 0 || scale <= MIN_PHOTO_SCALE + 0.001) return;
    event.preventDefault();
    mouseGesture = {
      startX: event.clientX,
      startY: event.clientY,
      startTranslateX: translateX,
      startTranslateY: translateY,
    };
    viewer.classList.add("is-interacting");
  });

  const onMouseMove = (event) => {
    if (!mouseGesture) return;
    translateX =
      mouseGesture.startTranslateX + event.clientX - mouseGesture.startX;
    translateY =
      mouseGesture.startTranslateY + event.clientY - mouseGesture.startY;
    clampPan();
    render();
  };

  const onMouseUp = () => {
    if (!mouseGesture) return;
    mouseGesture = null;
    viewer.classList.remove("is-interacting");
    clampPan();
    render();
  };

  const onKeyDown = (event) => {
    if (!viewer.isConnected) return;
    if (event.key === "Escape") {
      closeViewer(viewer);
      return;
    }
    if (["+", "="].includes(event.key)) {
      event.preventDefault();
      setScale(scale + 0.5);
    } else if (event.key === "-") {
      event.preventDefault();
      setScale(scale - 0.5);
    } else if (event.key === "0") {
      event.preventDefault();
      resetZoom();
    }
  };

  const onResize = () => {
    clampPan();
    render();
  };

  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseup", onMouseUp);
  window.addEventListener("resize", onResize);
  document.addEventListener("keydown", onKeyDown);

  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
    window.removeEventListener("resize", onResize);
    document.removeEventListener("keydown", onKeyDown);
    nativeGestureEvents.forEach((eventName) => {
      viewer.removeEventListener(eventName, preventNativePageZoom);
    });
    removalObserver?.disconnect();
  };

  removalObserver = new MutationObserver(() => {
    if (!viewer.isConnected) cleanup();
  });
  removalObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  image.addEventListener("load", onResize, { once: true });
  render();
}

function scan() {
  document.querySelectorAll(".chat-viewer").forEach(enhanceViewer);
}

installStyles();
const observer = new MutationObserver(scan);
observer.observe(document.documentElement, { childList: true, subtree: true });
scan();
