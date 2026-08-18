// Aurora Call browser entrypoint.
// Keep startup order explicit: core app first, then UI/features that observe it.
import "./media-compression-hook.js";
import "./resumable-media.js";
import "./app.js?v=20260818-android-auth1";
import "./auth-screen.js?v=20260818-android-auth1";
import "./auth-screen-polish.js?v=20260818-android-auth1";
import "./hero-copy-polish.js";
import "./home-fullscreen-flow.js";
import "./home-call-buttons.js";
import "./voice-messages-v2.js";
import "./storage-media-hydrator.js";
import "./chat-delete-resilience.js";
import "./interaction-polish.js";
import "./permission-check-animation.js?v=20260815-permissions2";
import { initPushNotifications } from "./push-notifications.js?v=20260815-push1";

if ("serviceWorker" in navigator && location.protocol === "https:") {
  window.addEventListener("load", async () => {
    try {
      await window.navigator.serviceWorker.register("/sw.js?v=20260815-push1");
      initPushNotifications();
    } catch (error) {
      console.warn("Service worker unavailable", error);
    }
  });
}
