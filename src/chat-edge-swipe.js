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

export function installEdgeSwipeBack(
  eventSurface,
  onBack,
  { visualTarget = eventSurface, host = visualTarget?.parentElement } = {},
) {
  if (
    !eventSurface?.addEventListener ||
    !visualTarget?.classList ||
    typeof onBack !== "function"
  )
    return;

  let gesture = null;
  let navigationTimer = null;

  const clearVisuals = () => {
    visualTarget.classList.remove(
      "is-edge-back-swiping",
      "is-edge-back-settling",
    );
    visualTarget.style.removeProperty("--edge-back-x");
    host?.classList.remove("edge-back-gesture-active");
    host?.style.removeProperty("--edge-back-progress");
  };

  const setProgress = (distance) => {
    const width = Math.max(
      1,
      visualTarget.clientWidth || window.innerWidth || 1,
    );
    const visibleDistance = Math.min(width, Math.max(0, distance));
    const progress = Math.min(1, visibleDistance / chatBackThreshold(width));
    visualTarget.style.setProperty("--edge-back-x", `${visibleDistance}px`);
    host?.style.setProperty("--edge-back-progress", progress.toFixed(3));
  };

  const settle = (complete) => {
    if (!gesture?.active) {
      gesture = null;
      return;
    }

    const width = Math.max(
      1,
      visualTarget.clientWidth || window.innerWidth || 1,
    );
    gesture = null;
    visualTarget.classList.remove("is-edge-back-swiping");
    visualTarget.classList.add("is-edge-back-settling");

    if (!complete) {
      setProgress(0);
      navigationTimer = window.setTimeout(clearVisuals, CHAT_BACK_SETTLE_MS);
      return;
    }

    visualTarget.style.setProperty("--edge-back-x", `${width}px`);
    host?.style.setProperty("--edge-back-progress", "1");
    navigationTimer = window.setTimeout(() => {
      Promise.resolve()
        .then(onBack)
        .catch((error) => console.error("Swipe back navigation failed", error))
        .finally(clearVisuals);
    }, CHAT_BACK_SETTLE_MS);
  };

  eventSurface.addEventListener(
    "touchstart",
    (event) => {
      if (
        event.touches.length !== 1 ||
        visualTarget.classList.contains("is-edge-back-settling") ||
        document.querySelector(
          ".chat-viewer, .chat-message-menu-backdrop, .call-screen, .modal",
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

  eventSurface.addEventListener(
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
        visualTarget.classList.add("is-edge-back-swiping");
        host?.classList.add("edge-back-gesture-active");
      }

      event.preventDefault();
      gesture.distance = Math.max(0, deltaX);
      setProgress(gesture.distance);
    },
    { passive: false },
  );

  eventSurface.addEventListener("touchend", () => {
    if (!gesture) return;
    const complete = shouldCompleteChatBackSwipe({
      distance: gesture.distance,
      duration: Date.now() - gesture.startedAt,
      viewportWidth: visualTarget.clientWidth || window.innerWidth,
    });
    settle(complete);
  });

  eventSurface.addEventListener("touchcancel", () => settle(false));
}

export function installChatEdgeSwipe(target, onBack) {
  return installEdgeSwipeBack(target, onBack, {
    visualTarget: target,
    host: target?.closest?.(".chat-layer"),
  });
}
