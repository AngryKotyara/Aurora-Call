# Aurora Call architecture

## Entry point

`src/main.js` is the only browser entrypoint. It imports the core application first and then feature/UI modules in an explicit order. `index.html` should not accumulate feature scripts.

## Core

- `config.js` — public runtime configuration only. Never place service-role keys or private secrets here.
- `api.js` — the only generic PostgREST RPC transport.
- `state.js` — in-memory application/session state.
- `app.js` — authentication, navigation orchestration, initial data loading and feature bootstrap.
- `utils.js` — small dependency-free helpers.

## Calling

- `calls.js` — WebRTC lifecycle and signaling.
- `call-ui.js` — active-call presentation and controls.
- `call-picker.js` — contact selection before a call.
- `incoming-call.js` — incoming call alerting.
- `ios-screen-share.js` — iOS-specific screen-sharing bridge.

## Chat

- `chat.js` — conversations, messages, media hydration and message actions.
- `voice-messages-v2.js` — voice recording/playback enhancement.
- `resumable-media.js` — large resumable media uploads.
- `media-compression-hook.js` — client-side media compression.
- `storage-media-hydrator.js` — secure Storage-backed media hydration.
- `chat-delete-resilience.js` — deletion recovery behavior.

## Home/UI

- `ui.js` — primary application views.
- `xperia-flow.js` / `xperia-flow.css` — animated home background.
- `home-fullscreen-flow.js` — fullscreen home presentation.
- `home-call-buttons.js` — call-button presentation enhancement.
- `hero-copy-polish.js` — hero copy presentation.
- `interaction-polish.js` / `nav-polish.js` — interaction/navigation finishing layer.

## Rules for future changes

1. New functionality belongs in the owning feature module; do not add a new global patch script unless there is no safe alternative.
2. Keep database authorization server-side. Browser state is never an authorization boundary.
3. All user-provided text rendered through HTML templates must be escaped.
4. All media access must be authorized against the active Aurora session and message ownership/participation.
5. Avoid service secrets in browser code. The Supabase publishable key is public by design; privileged keys are not.
6. Database schema/function changes must be migrations, not ad-hoc production edits.
7. Keep `index.html` declarative: metadata, styles, root element and the single `src/main.js` entrypoint.
