# Aurora Call security model

## Current trust boundaries

- Browser UI is untrusted from the database perspective.
- Supabase publishable key is public and must never be treated as a secret.
- Aurora session bearer credentials are stored in a `__Host-` HttpOnly, Secure, SameSite=Strict cookie and are not exposed to application JavaScript after migration from the legacy session format.
- Authenticated browser RPC and Aurora Edge Function traffic goes through same-origin `/api` handlers that inject the server-held session token.
- Authorization for calls, friends, messages and media is enforced inside database RPC functions and authenticated Edge Functions.
- WebRTC media transport is handled by the browser; signaling passes through the backend.

## Implemented hardening

- RLS is enabled on Aurora public tables.
- Login verification runs server-side in `aurora-auth`; the browser no longer submits the stored access hash as a credential.
- Browser execution of the legacy `login_call_user(text, text)` RPC is revoked.
- Existing legacy browser sessions are adopted once into an HttpOnly cookie and the bearer UUID is then removed from `localStorage`.
- Logout revokes the active server session and clears the HttpOnly cookie.
- Session lifetime is limited to 24 hours and the number of reusable sessions per account is bounded.
- Same-origin API handlers reject cross-site requests and the session cookie uses `SameSite=Strict`.
- Secure media retrieval verifies that the active Aurora session belongs to the sender or recipient.
- Legacy unauthenticated `get_chat_media(bigint)` and `record_call_event(...)` execution is revoked from browser roles.
- `PUBLIC` execution is revoked from sensitive RPC functions while narrowly required custom-auth grants remain.
- Legacy public chat media storage is private; current media is served using authorization checks and short-lived signed URLs.
- Production sends HSTS, CSP, frame protection, MIME sniffing protection, referrer policy, cross-origin isolation headers and restrictive Permissions-Policy headers through Vercel.
- The iOS wrapper only exposes native ReplayKit/media privileges to the trusted HTTPS main-frame origin and blocks untrusted in-app navigation.
- User-visible text should pass through HTML escaping helpers before insertion into HTML templates.
- CI runs tests, formatting checks, high-severity dependency audit and a production build.

## Remaining high-priority work

1. Reduce the number of `SECURITY DEFINER` functions callable by `anon` by moving more authorization behind a consistent server identity boundary.
2. Add application-layer end-to-end encryption for chat content/media if the product promises private messaging beyond transport encryption.
3. Add TURN/TURNS infrastructure with short-lived credentials and TLS/TCP fallback for restrictive networks and an optional relay-only privacy mode.
4. Add centralized security/error telemetry with secret and personal-data scrubbing.
5. Add automated secret scanning, SAST, dependency update automation and migration policy checks to CI and repository protection.
6. Define backup/restore objectives for Postgres and chat media and test restores regularly.
7. Continue replacing legacy compatibility paths after active clients have migrated to the HttpOnly session flow.

## Incident response

If a browser session is suspected to be compromised, invalidate its row in `call_sessions`. For broad incidents, revoke active sessions, rotate privileged backend credentials, preserve relevant logs, patch the authorization boundary, and only then restore service.

Never commit Supabase service-role keys, database passwords, TURN shared secrets, signing secrets or private certificates to this repository.
