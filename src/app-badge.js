export function normalizeBadgeCount(value) {
  const count = Math.floor(Number(value));
  if (!Number.isFinite(count) || count <= 0) return 0;
  return Math.min(count, 999);
}

export async function setAppBadgeCount(
  value,
  badgeTarget = globalThis.navigator,
) {
  const count = normalizeBadgeCount(value);
  try {
    if (count > 0 && typeof badgeTarget?.setAppBadge === "function") {
      await badgeTarget.setAppBadge(count);
      return true;
    }
    if (count === 0 && typeof badgeTarget?.clearAppBadge === "function") {
      await badgeTarget.clearAppBadge();
      return true;
    }
    if (count === 0 && typeof badgeTarget?.setAppBadge === "function") {
      await badgeTarget.setAppBadge(0);
      return true;
    }
  } catch {
    // Badging is best-effort and can be disabled independently on iOS.
  }
  return false;
}
