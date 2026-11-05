# Aurora Call architecture

## Repository boundaries

- `index.html` declares the web shell, ordered stylesheets, and the single browser entrypoint, `src/main.js`.
- `src/` contains the website's browser code. The Android and iOS wrappers also load the web interface, so changes here must preserve their existing contracts.
- `api/` contains same-origin serverless endpoints for authentication, RPC, and backend functions.
- `server/` contains shared request/session handling and the alternative self-hosted HTTP adapter.
- `supabase/` contains database migrations and Edge Functions. Authorization remains server-side.
- `public/` contains the service worker, manifest, icons, and other static assets.
- `test/` contains Node tests covering the browser modules, API boundaries, and native-wrapper compatibility.

## Browser startup and shared state

`src/main.js` imports `app.js` and the existing enhancement modules in a deliberate order, then starts presence, push, and TURN maintenance. Several enhancement modules observe or modify DOM created by other modules; retain this order when editing startup. The stylesheets declared in `index.html` also depend on their existing cascade order.

- `app.js` orchestrates authentication, navigation, contacts, calls, and screen rendering.
- `state.js` owns session and active-call state; `config.js` contains public configuration only.
- `api.js` sends RPC, login, and registration requests. `network.js` supplies request timeout and retry handling.
- `push/rpc-notifications.js` sends the existing push events after successful call or chat RPCs; `push-notifications.js` manages notification subscriptions and settings.
- `utils.js`, `branding.js`, `polling-policy.js`, and `media-permissions.js` provide shared utilities.

## Views

- `ui.js` renders the authentication and main screens and binds their actions.
- `views/components.js` holds the HTML fragments for navigation, contacts, call history, branding, and media permissions.
- `auth-screen.js` and its polish module adapt the authentication presentation; keep their existing registration and login event contracts intact.
- `profile-avatar.js`, `xperia-flow.js`, and the home/navigation polish modules provide focused presentation features.

## Calls

- `calls.js` owns the WebRTC connection, call lifecycle, signaling, and polling.
- `calls/pending-signals.js` buffers early call signals until a peer is ready, with the existing limits.
- `calls/screen-share.js` manages screen-sharing tracks and restores the camera when sharing ends.
- `call-ui.js`, `call-picker.js`, and `incoming-call.js` provide the call controls, contact picker, and incoming-call screen.
- `call-security.js`, `call-privacy.js`, and `turn-credentials.js` contain website call verification, optional relay policy, and TURN credential handling.
- `android-native.js` and `ios-screen-share.js` bridge existing wrapper capabilities; their browser-facing contracts must remain compatible.

## Chat and media

- `chat.js` owns chat navigation, conversation state, message actions, and refresh scheduling.
- `chat/markup.js` renders chat icons, threads, messages, and media placeholders. `chat.js` continues to export `mediaMarkup` for existing callers.
- `chat/media.js` loads legacy media, manages its object-URL cache, and opens the media viewer.
- `chat/upload.js` handles the existing photo/video upload flow and progress display.
- `chat-media-routing.js` distinguishes legacy media from Storage-backed media; `storage-media-hydrator.js` handles the latter.
- `resumable-media.js`, the compression/photo helpers, and the voice-message modules retain their existing integration points.
- `chat-edge-swipe.js`, `chat-presence.js`, and the chat polish modules provide navigation, presence, and presentation behavior.

## Validation

Run `npm test` and `npm run build` after changes. For call, media, authentication, and notification changes, also exercise the affected flows and their failure paths. Local browser mocks do not replace real-device testing when a change affects WebRTC, media permissions, or native bridges.

## Security and compatibility rules

1. Keep database authorization server-side. Browser state is never an authorization boundary.
2. Escape user-provided text inserted into HTML templates.
3. Authorize media access against the active Aurora session and message participation.
4. Never put service-role keys or private secrets in browser code.
5. Make database schema/function changes through migrations; do not make ad-hoc production edits.
6. Preserve public module exports, browser events, API payloads, storage keys, and the existing registration flow unless a change explicitly requires otherwise.
7. Treat native wrappers, service-worker caching, and the order of stylesheet and startup imports as compatibility boundaries.
