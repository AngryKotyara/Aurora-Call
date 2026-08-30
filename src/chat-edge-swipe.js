export const CHAT_BACK_EDGE_PX = 48;
export const CHAT_BACK_SETTLE_MS = 210;

const DRAG_INTENT_PX = 5;
const HORIZONTAL_AXIS_RATIO = 1.08;
const FLING_DISTANCE_PX = 28;
const FLING_VELOCITY_PX_MS = 0.34;

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
  return Math.min(96, Math.max(64, width * 0.2));
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
  {
    visualTarget = eventSurface,
    getVisualTarget = null,
    host = visualTarget?.parentElement,
    canStart = () => true,
  } = {},
) {
  if (!eventSurface?.addEventListener || typeof onBack !== "function") return;

  let gesture = null;
  let animationFrame = null;
  let pendingProgress = null;
  let settleTimer = null;

  const resolveTarget = () => getVisualTarget?.() || visualTarget;
  const resolveHost = (target) =>
    typeof host === "function" ? host(target) : host || target?.parentElement;
  const requestFrame = (callback) =>
    window.requestAnimationFrame?.(callback) ?? window.setTimeout(callback, 16);
  const cancelFrame = (frame) => {
    if (window.cancelAnimationFrame) window.cancelAnimationFrame(frame);
    else window.clearTimeout(frame);
  };

  const clearVisuals = (target, targetHost) => {
    if (!target) return;
    target.classList.remove("is-edge-back-swiping", "is-edge-back-settling");
    target.style.removeProperty("--edge-back-x");
    targetHost?.classList.remove("edge-back-gesture-active");
    targetHost?.style.removeProperty("--edge-back-progress");
  };

  const setProgress = (target, targetHost, distance) => {
    const width = Math.max(1, target.clientWidth || window.innerWidth || 1);
    const visibleDistance = Math.min(width, Math.max(0, distance));
    const progress = Math.min(1, visibleDistance / chatBackThreshold(width));
    target.style.setProperty("--edge-back-x", `${visibleDistance}px`);
    targetHost?.style.setProperty("--edge-back-progress", progress.toFixed(3));
  };

  const flushProgress = () => {
    if (!pendingProgress) return;
    const update = pendingProgress;
    pendingProgress = null;
    if (animationFrame !== null) cancelFrame(animationFrame);
    animationFrame = null;
    setProgress(update.target, update.host, update.distance);
  };

  const queueProgress = (target, targetHost, distance) => {
    pendingProgress = { target, host: targetHost, distance };
    if (animationFrame !== null) return;
    animationFrame = requestFrame(() => {
      animationFrame = null;
      flushProgress();
    });
  };

  const settle = (complete) => {
    if (!gesture?.active) {
      gesture = null;
      return;
    }

    const completed = gesture;
    gesture = null;
    flushProgress();

    const { target, host: targetHost } = completed;
    const width = Math.max(1, target.clientWidth || window.innerWidth || 1);
    target.classList.remove("is-edge-back-swiping");
    target.classList.add("is-edge-back-settling");
    target.getBoundingClientRect?.();

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      window.clearTimeout(settleTimer);
      target.removeEventListener("transitionend", onTransitionEnd);
      if (!complete) {
        clearVisuals(target, targetHost);
        return;
      }
      Promise.resolve()
        .then(onBack)
        .catch((error) => console.error("Swipe back navigation failed", error))
        .finally(() => clearVisuals(target, targetHost));
    };
    const onTransitionEnd = (event) => {
      if (event.target === target && event.propertyName === "transform")
        finish();
    };
    target.addEventListener("transitionend", onTransitionEnd);
    settleTimer = window.setTimeout(finish, CHAT_BACK_SETTLE_MS + 80);
    requestFrame(() => setProgress(target, targetHost, complete ? width : 0));
  };

  eventSurface.addEventListener(
    "touchstart",
    (event) => {
      const target = resolveTarget();
      const targetHost = resolveHost(target);
      if (
        event.touches.length !== 1 ||
        !target?.classList ||
        !canStart() ||
        target.classList.contains("is-edge-back-settling") ||
        document.querySelector(
          ".chat-viewer, .chat-message-menu-backdrop, .call-screen, .modal:not([hidden])",
        )
      )
        return;

      const touch = event.touches[0];
      if (!isChatBackEdgeStart(touch)) return;
      window.clearTimeout(settleTimer);
      gesture = {
        target,
        host: targetHost,
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
      if (!gesture) return;
      if (event.touches.length !== 1) {
        settle(false);
        return;
      }
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
        gesture.target.classList.add("is-edge-back-swiping");
        gesture.host?.classList.add("edge-back-gesture-active");
      }

      event.preventDefault();
      gesture.distance = Math.max(0, deltaX);
      queueProgress(gesture.target, gesture.host, gesture.distance);
    },
    { passive: false },
  );

  eventSurface.addEventListener("touchend", (event) => {
    if (!gesture) return;
    const touch = event.changedTouches?.[0];
    if (touch) {
      const finalX = Math.max(0, touch.clientX - gesture.startX);
      gesture.distance = Math.max(gesture.distance, finalX);
      if (gesture.active)
        queueProgress(gesture.target, gesture.host, gesture.distance);
    }
    const complete = shouldCompleteChatBackSwipe({
      distance: gesture.distance,
      duration: Date.now() - gesture.startedAt,
      viewportWidth: gesture.target.clientWidth || window.innerWidth,
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
