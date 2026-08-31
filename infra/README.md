# Aurora Call self-hosted infrastructure

This directory contains the Google-free production infrastructure for Android push delivery and WebRTC relay.

## Services

- `push.auroracall.net` — private ntfy server used as a UnifiedPush distributor.
- `turn.auroracall.net` — coturn STUN/TURN server using short-lived REST/HMAC credentials.

Both hostnames are intended to resolve to the same Ubuntu 24.04 VPS, although they may be split later.

## Automated deployment

The GitHub Actions workflow `.github/workflows/infra-deploy.yml` uploads only the `infra/` bundle and a temporary protected secrets file. The secrets file is removed from the VPS after the bootstrap command exits.

Required GitHub Actions secrets:

```text
AURORA_VPS_HOST
AURORA_VPS_USER
AURORA_VPS_SSH_KEY
AURORA_VPS_KNOWN_HOSTS
AURORA_TURN_SHARED_SECRET
AURORA_NTFY_DISTRIBUTOR_PASSWORD
```

Optional secrets:

```text
AURORA_CERTBOT_EMAIL
AURORA_TURN_EXTERNAL_IP
```

`AURORA_VPS_KNOWN_HOSTS` must contain a pinned SSH host-key line collected independently from the VPS console/provider. Do not replace this with `StrictHostKeyChecking=no`.

The VPS account must be able to run `sudo` non-interactively. The bootstrap installs Docker, Docker Compose, Certbot and UFW, then starts ntfy/Caddy and coturn.

## DNS

Before running the workflow, create A records for both names pointing at the VPS public IPv4 address:

```text
push.auroracall.net -> VPS IPv4
turn.auroracall.net -> VPS IPv4
```

The bootstrap deliberately refuses to continue if DNS does not match the target public address. This avoids requesting certificates for the wrong machine or deploying TURN on an unintended host.

## Network policy

The bootstrap permits only the service ports needed by this stack:

```text
TCP 22       SSH (via the OpenSSH UFW profile)
TCP 80       ACME HTTP challenge / HTTPS redirect
TCP 443      ntfy HTTPS
UDP 443      HTTP/3 for Caddy
TCP/UDP 3478 STUN/TURN
TCP 5349     TURN over TLS
UDP 49160-49260 TURN relay allocation range
```

If SSH uses a non-standard port, adjust the firewall rule before enabling the workflow.

## Secret separation

`AURORA_TURN_SHARED_SECRET` must be identical on coturn and in the protected Supabase `aurora_push_config` row `turn_shared_secret`. It is never sent to web or Android clients. Clients receive only short-lived HMAC credentials from `aurora-turn-credentials`.

`AURORA_NTFY_DISTRIBUTOR_PASSWORD` belongs only to the `aurora-mobile` ntfy account. The application server publishes anonymously only to high-entropy `up*` UnifiedPush topics; the distributor account has read-only access to those topics.

Never commit either secret or the generated coturn `.env` file.

## Verification

The deployment workflow fails unless:

1. `https://push.auroracall.net/v1/health` is reachable over valid TLS.
2. `turn.auroracall.net:5349` presents a certificate trusted for `turn.auroracall.net`.

After infrastructure deployment, perform the device test with ntfy Android acting as the UnifiedPush distributor and Aurora Call 1.2+ installed without Firebase.
