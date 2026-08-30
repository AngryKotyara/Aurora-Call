export const CHAT_BACK_EDGE_PX = 32;
export const CHAT_BACK_SETTLE_MS = 180;

const DRAG_INTENT_PX = 8;
const HORIZONTAL_AXIS_RATIO = 1.25;
const FLING_DISTANCE_PX = 38;
const FLING_VELOCITY_PX_MS = 0.5;

export function isChatBackEdgeStart(point, edgeSize = CHAT_BACK_EDGE_PX) {
  const x = Number(point?.clientX);
  return Number.isFinite(x) && x >= 0 && x <= edgeSize;
}

export function isChatBackIntent(deltaX, deltaY) {
  const x = Number(deltaX) || 0;
  const y = Math.abs(Number(deltaY) || 0);
  return x >= DRAG_INTENT_PX && x > y * HORIZONTAL_AXIS_RATIO;
}

export function chatBackThreshold(viewportWidth) {
  const width = Math.max(0, Number(viewportWidth) || 0);
  return Math.min(112, Math.max(76, width * 0.26));
}

export function shouldCompleteChatBackSwipe({
  distance,
  duration,
  viewportWidth,
}) {
  const safeDistance = Math.max(0, Number(distance) || 0);
  const safeDuration = Math.max(1, Number(duration) || 0);
  const velocity = safeDistance / safeDuration;
  return (
    safeDistance >= chatBackThreshold(viewportWidth) ||
    (safeDistance >= FLING_DISTANCE_PX && velocity >= FLING_VELOCITY_PX_MS)
  );
}

export function installChatEdgeSwipe(target, onBack) {
  if (!(target instanceof HTMLElement) || typeof onBack !== "function") return;

  const layer = target.closest(".chat-layer");
  let gesture = null;
  let navigationTimer = null;

  const clearVisuals = () => {
    target.classList.remove("is-chat-edge-swiping", "is-chat-edge-settling");
    target.style.removeProperty("--chat-back-x");
    layer?.classList.remove("chat-back-gesture-active");
    layer?.style.removeProperty("--chat-back-progress");
  };

  const setProgress = (distance) => {
    const width = Math.max(1, target.clientWidth || window.innerWidth || 1);
    const visibleDistance = Math.min(width, Math.max(0, distance));
    const progress = Math.min(1, visibleDistance / chatBackThreshold(width));
    target.style.setProperty("--chat-back-x", `${visibleDistance}px`);
    layer?.style.setProperty("--chat-back-progress", progress.toFixed(3));
  };

  const settle = (complete) => {
    if (!gesture?.active) {
      gesture = null;
      return;
    }

    const width = Math.max(1, target.clientWidth || window.innerWidth || 1);
    gesture = null;
    target.classList.remove("is-chat-edge-swiping");
    target.classList.add("is-chat-edge-settling");

    if (!complete) {
      setProgress(0);
      navigationTimer = window.setTimeout(clearVisuals, CHAT_BACK_SETTLE_MS);
      return;
    }

    target.style.setProperty("--chat-back-x", `${width}px`);
    layer?.style.setProperty("--chat-back-progress", "1");
    navigationTimer = window.setTimeout(() => {
      Promise.resolve()
        .then(onBack)
        .catch((error) => console.error("Chat swipe back failed", error))
        .finally(clearVisuals);
    }, CHAT_BACK_SETTLE_MS);
  };

  target.addEventListener(
    "touchstart",
    (event) => {
      if (
        event.touches.length !== 1 ||
        target.classList.contains("is-chat-edge-settling") ||
        document.querySelector(
          ".chat-viewer, .chat-message-menu-backdrop, .call-screen",
        )
      )
        return;

      const touch = event.touches[0];
      if (!isChatBackEdgeStart(touch)) return;
      window.clearTimeout(navigationTimer);
      gesture = {
        startX: touch.clientX,
        startY: touch.clientY,
        startedAt: Date.now(),
        distance: 0,
        active: false,
      };
    },
    { passive: true },
  );

  target.addEventListener(
    "touchmove",
    (event) => {
      if (!gesture || event.touches.length !== 1) return;
      const touch = event.touches[0];
      const deltaX = touch.clientX - gesture.startX;
      const deltaY = touch.clientY - gesture.startY;

      if (!gesture.active) {
        if (Math.abs(deltaY) > 12 && Math.abs(deltaY) > Math.max(0, deltaX)) {
          gesture = null;
          return;
        }
        if (!isChatBackIntent(deltaX, deltaY)) return;
        gesture.active = true;
        target.classList.add("is-chat-edge-swiping");
        layer?.classList.add("chat-back-gesture-active");
      }

      event.preventDefault();
      gesture.distance = Math.max(0, deltaX);
      setProgress(gesture.distance);
    },
    { passive: false },
  );

  target.addEventListener("touchend", () => {
    if (!gesture) return;
    const complete = shouldCompleteChatBackSwipe({
      distance: gesture.distance,
      duration: Date.now() - gesture.startedAt,
      viewportWidth: target.clientWidth || window.innerWidth,
    });
    settle(complete);
  });

  target.addEventListener("touchcancel", () => settle(false));
}
