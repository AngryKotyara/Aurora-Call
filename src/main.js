// Aurora Call browser entrypoint.
// Keep startup order explicit: core app first, then UI/features that observe it.
import "./media-compression-hook.js";
import "./resumable-media.js?v=20260830-media3";
import "./app.js?v=20260830-perf1";
import "./auth-screen.js?v=20260831-icon2";
import "./auth-screen-polish.js?v=20260831-icon2";
import "./android-auth-bridge.js?v=20260818-android-auth2";
import "./hero-copy-polish.js";
import "./home-fullscreen-flow.js";
import "./home-call-buttons.js";
import "./voice-messages-v2.js";
import "./voice-playback-polish.js?v=20260830-voice1";
import "./photo-optimistic-handoff.js?v=20260830-photo4";
import "./storage-media-hydrator.js?v=20260830-chat9";
import "./photo-viewer-ux.js?v=20260830-photo3";
import "./chat-polish.js?v=20260829-chat3";
import "./chat-call-priority.js?v=20260829-chat4";
import "./chat-delete-resilience.js";
import "./chat-presence.css";
import { initChatPresence } from "./chat-presence.js?v=20260831-presence1";
import "./interaction-polish.js";
import "./permission-check-animation.js?v=20260815-permissions2";
import { initPushNotifications } from "./push-notifications.js?v=20260831-android1";

function syncPageActivity() {
  document.documentElement.classList.toggle(
    "app-backgrounded",
    document.visibilityState === "hidden",
  );
}

document.addEventListener("visibilitychange", syncPageActivity);
syncPageActivity();
initChatPresence();
initPushNotifications();

if ("serviceWorker" in navigator && location.protocol === "https:") {
  window.addEventListener("load", async () => {
    try {
      await window.navigator.serviceWorker.register("/sw.js?v=20260831-push2");
    } catch (error) {
      console.warn("Service worker unavailable", error);
    }
  });
}
