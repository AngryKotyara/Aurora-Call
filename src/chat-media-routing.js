const STORAGE_PREFIX = "storage:";

export const STORAGE_MEDIA_FRAME_SELECTOR =
  '[data-chat-media-id][data-storage-media="true"]';
export const LEGACY_MEDIA_FRAME_SELECTOR =
  '[data-chat-media-id]:not([data-storage-media="true"])';

export function mediaRoutingAttribute(mediaData) {
  return typeof mediaData === "string" && mediaData.startsWith(STORAGE_PREFIX)
    ? ' data-storage-media="true"'
    : "";
}
