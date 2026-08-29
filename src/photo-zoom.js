export const MIN_PHOTO_SCALE = 1;
export const MAX_PHOTO_SCALE = 4;

export function clampPhotoScale(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return MIN_PHOTO_SCALE;
  return Math.min(MAX_PHOTO_SCALE, Math.max(MIN_PHOTO_SCALE, number));
}

export function clampPhotoTranslation(value, limit) {
  const safeLimit = Math.max(0, Number(limit) || 0);
  return Math.min(safeLimit, Math.max(-safeLimit, Number(value) || 0));
}

export function touchDistance(first, second) {
  return Math.hypot(
    Number(second?.clientX || 0) - Number(first?.clientX || 0),
    Number(second?.clientY || 0) - Number(first?.clientY || 0),
  );
}

export function touchMidpoint(first, second) {
  return {
    x: (Number(first?.clientX || 0) + Number(second?.clientX || 0)) / 2,
    y: (Number(first?.clientY || 0) + Number(second?.clientY || 0)) / 2,
  };
}

export function focalZoomTranslation({
  centerX,
  centerY,
  focalX,
  focalY,
  startScale,
  startX,
  startY,
  nextScale,
}) {
  const safeStartScale = Math.max(MIN_PHOTO_SCALE, Number(startScale) || 1);
  const localX =
    (Number(focalX) - Number(centerX) - Number(startX || 0)) / safeStartScale;
  const localY =
    (Number(focalY) - Number(centerY) - Number(startY || 0)) / safeStartScale;

  return {
    x: Number(focalX) - Number(centerX) - Number(nextScale) * localX,
    y: Number(focalY) - Number(centerY) - Number(nextScale) * localY,
  };
}
