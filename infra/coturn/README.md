# Aurora Call self-hosted TURN/STUN

Aurora Call uses its own coturn endpoint at `turn.auroracall.net`; Google STUN is not required.

The stack pins coturn 4.17.2 and uses the TURN REST authentication model (`use-auth-secret`) so the application can receive short-lived credentials instead of shipping a permanent TURN password in JavaScript.

## DNS and firewall

Point `turn.auroracall.net` to the TURN host. Allow inbound:

- UDP/TCP 3478 — STUN/TURN;
- TCP 5349 — TURN over TLS;
- UDP 49160-49260 — relay allocation range.

A separate public IP is preferable if you later want TURN/TLS on TCP 443, because a web reverse proxy normally occupies 443 on the push/web host.

## Certificate

Provision a valid certificate for `turn.auroracall.net`, for example with Certbot, and set `TURN_CERT_DIR` to the directory containing `fullchain.pem` and `privkey.pem`.

## Runtime configuration

```bash
cd infra/coturn
cp .env.example .env
```

Set:

- `TURN_EXTERNAL_IP` to the server's public IPv4 address;
- `TURN_RELAY_IP` to the local relay/listening address (on a directly addressed VPS this is commonly the same public address);
- `TURN_SHARED_SECRET` to a cryptographically random secret of at least 32 bytes;
- `TURN_CERT_DIR` to the certificate directory.

The exact same shared secret must be configured only in the Aurora server-side TURN credential issuer. Never expose it to the browser or commit it to Git.

Start:

```bash
docker compose up -d
```

The configuration blocks relaying to loopback and common private/link-local IPv4 ranges, disables the coturn CLI, and restricts relay allocations to a small explicit UDP range for firewalling.

## Credential model

Coturn's secret-based REST model uses a time-limited username such as `<unix-expiry>:<user-id>` and a password generated as Base64(HMAC-SHA1(shared-secret, username)). Aurora's backend should mint these for an authenticated Aurora session with a short TTL (for example 10 minutes). This keeps permanent TURN credentials out of the client bundle.
