// Aurora Call browser entrypoint.
// Keep startup order explicit: core app first, then UI/features that observe it.
import "./media-compression-hook.js";
import "./resumable-media.js";
import "./app.js";
import "./hero-copy-polish.js";
import "./home-fullscreen-flow.js";
import "./home-call-buttons.js";
import "./voice-messages-v2.js";
import "./storage-media-hydrator.js";
import "./chat-delete-resilience.js";
import "./interaction-polish.js";
