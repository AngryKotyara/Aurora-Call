import { detachPushSubscriptions } from "./push-notifications.js?v=20260831-android1";

document.addEventListener("aurora-before-logout", (event) => {
  const task = detachPushSubscriptions();
  if (Array.isArray(event.detail?.tasks)) event.detail.tasks.push(task);
});
