# Aurora Call security model

## Current trust boundaries

- Browser UI is untrusted from the database perspective.
- Supabase publishable key is public and must never be treated as a secret.
- Aurora session tokens authorize RPC operations and therefore must be treated as bearer credentials.
- Authorization for calls, friends, messages and media is enforced inside database RPC functions.
- WebRTC media transport is handled by the browser; signaling passes through the backend.

## Implemented hardening

- RLS is enabled on Aurora public tables.
- Secure media retrieval verifies that the active Aurora session belongs to the sender or recipient.
- Legacy unauthenticated `get_chat_media(bigint)` execution is revoked from browser roles.
- `PUBLIC` execution is revoked from sensitive chat RPC functions while explicit browser-role grants remain.
- New media records no longer advertise the legacy unauthenticated media RPC path.
- Production sends CSP, frame protection, MIME sniffing protection, referrer policy and restrictive Permissions-Policy headers through Vercel.
- User-visible text should pass through HTML escaping helpers before insertion into HTML templates.

## Remaining high-priority work

1. Replace long-lived bearer tokens in `localStorage` with a server-managed authentication/session design using HttpOnly, Secure, SameSite cookies or Supabase Auth.
2. Add rate limiting and abuse controls to login, registration, friend invitations, signaling and media creation.
3. Move all new browser-accessible authorization to a consistent identity model; reduce the number of `SECURITY DEFINER` functions callable by `anon`.
4. Add application-layer end-to-end encryption for chat content/media if the product promises private messaging beyond transport encryption.
5. Add TURN infrastructure with short-lived credentials and TLS/TCP fallback for restrictive networks.
6. Add centralized security/error telemetry with secret and personal-data scrubbing.
7. Add automated dependency, secret, SAST and migration checks in CI before production deploys.
8. Define backup/restore objectives for Postgres and chat media and test restores regularly.

## Incident response

If a browser session token is suspected to be stolen, invalidate its row in `call_sessions`. For broad incidents, revoke active sessions, rotate privileged backend credentials, preserve relevant logs, patch the authorization boundary, and only then restore service.

Never commit Supabase service-role keys, database passwords, TURN shared secrets, signing secrets or private certificates to this repository.
