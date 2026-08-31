# Aurora Call self-hosted push

Aurora Call Android 1.2+ uses UnifiedPush instead of Firebase Cloud Messaging. This stack runs a private ntfy distributor endpoint at `https://push.auroracall.net`.

## DNS and firewall

Point `push.auroracall.net` to the server and allow inbound TCP 80/443 plus UDP 443. Caddy obtains and renews the TLS certificate automatically.

## Start

```bash
cd infra/ntfy
docker compose up -d
```

The server defaults to `deny-all`. UnifiedPush needs anonymous applications to be able to publish encrypted payloads to random `up*` topics, while only the distributor account should be able to subscribe.

Create the distributor user interactively and install the ACLs:

```bash
docker compose exec ntfy ntfy user add aurora-mobile
docker compose exec ntfy ntfy access aurora-mobile 'up*' read-only
docker compose exec ntfy ntfy access '*' 'up*' write-only
```

Verify with:

```bash
docker compose exec ntfy ntfy access
```

## Android distributor

Install the ntfy Android application from F-Droid or the project's direct release if the device must remain Google-free. Add the server `https://push.auroracall.net`, sign in as `aurora-mobile`, and keep UnifiedPush enabled in ntfy. When Aurora Call enables notifications for the first time, Android/UnifiedPush will select that distributor and Aurora Call will register its encrypted Web Push endpoint with the backend.

The Aurora backend accepts UnifiedPush endpoints only on the allow-listed host `push.auroracall.net`; arbitrary push URLs are rejected to prevent SSRF.

## Privacy model

The application server publishes a standard encrypted Web Push payload. ntfy transports the encrypted bytes and does not possess Aurora Call's per-installation Web Push private key; decryption happens in the Aurora Call Android process through the UnifiedPush connector.
