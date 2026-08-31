# Aurora Call: one VPS from Git

This is the production-oriented self-hosted path for Aurora Call. A clean Ubuntu 24.04 VPS checks out the repository under `/opt/aurora-call`, builds the web/API image from that exact Git commit, and runs the application, private UnifiedPush distributor, Caddy TLS proxy, and coturn on the same VPS.

## DNS

Create A records pointing to the VPS public IPv4:

- `auroracall.net`
- `push.auroracall.net`
- `turn.auroracall.net`

The bootstrap refuses to continue if any of those records does not resolve to the VPS. This prevents certificates and services from being deployed against the wrong host.

## Services

- `app`: built from the repository `Dockerfile`; serves the Vite application and same-origin API compatibility layer on port 8080 internally.
- `caddy`: public HTTPS for `auroracall.net` and `push.auroracall.net`.
- `ntfy`: private UnifiedPush distributor with deny-all default ACLs.
- `coturn`: STUN/TURN with REST-style temporary HMAC credentials and a narrow relay UDP range.

The current database/function upstream remains configurable through `AURORA_SUPABASE_URL` and `AURORA_SUPABASE_PUBLISHABLE_KEY`. Their defaults keep the existing production backend working. A later self-hosted backend migration therefore does not require an Android or web-client rewrite; only server environment values change.

## GitHub Actions secrets

The workflow `.github/workflows/infra-deploy.yml` expects:

- `AURORA_VPS_HOST`
- `AURORA_VPS_USER`
- `AURORA_VPS_SSH_KEY`
- `AURORA_VPS_KNOWN_HOSTS`
- `AURORA_TURN_SHARED_SECRET`
- `AURORA_NTFY_DISTRIBUTOR_PASSWORD`
- `AURORA_CERTBOT_EMAIL`

Optional overrides:

- `AURORA_TURN_EXTERNAL_IP`
- `AURORA_SUPABASE_URL`
- `AURORA_SUPABASE_PUBLISHABLE_KEY`

The SSH user must be able to run `sudo` non-interactively for deployment commands.

## First deploy

1. Put the deployment public key in the VPS user's `~/.ssh/authorized_keys`.
2. Pin the VPS host key in `AURORA_VPS_KNOWN_HOSTS` rather than using `ssh-keyscan` inside CI.
3. Add the workflow secrets.
4. Run **Deploy Aurora VPS from Git** from GitHub Actions.

The workflow pulls the exact triggering Git SHA on the VPS and runs `infra/vps/bootstrap.sh`. The bootstrap is idempotent and performs DNS checks, firewall configuration, TURN TLS issuance, Docker build/start, ntfy ACL setup, certificate-renewal hooks, and health checks.

## Android

Android 1.3+ accepts the web origin at build time through `AURORA_WEB_URL`. The default remains the currently deployed Aurora address so debug builds are immediately installable. For a VPS release build use:

```bash
AURORA_WEB_URL=https://auroracall.net gradle :app:assembleRelease :app:bundleRelease
```

The trusted WebView origin and host are derived at build time from the same HTTPS URL, so changing the deployment host does not require editing Java source.
