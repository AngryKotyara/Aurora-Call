#!/usr/bin/env bash
set -euo pipefail

PUSH_DOMAIN="${PUSH_DOMAIN:-push.auroracall.net}"
TURN_DOMAIN="${TURN_DOMAIN:-turn.auroracall.net}"
AURORA_INFRA_DIR="${AURORA_INFRA_DIR:-/opt/aurora-call-infra}"
TURN_RELAY_MIN_PORT="${TURN_RELAY_MIN_PORT:-49160}"
TURN_RELAY_MAX_PORT="${TURN_RELAY_MAX_PORT:-49260}"

require() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required environment variable: ${name}" >&2
    exit 2
  fi
}

require TURN_SHARED_SECRET
require NTFY_DISTRIBUTOR_PASSWORD
require CERTBOT_EMAIL

if [[ ${#TURN_SHARED_SECRET} -lt 32 ]]; then
  echo "TURN_SHARED_SECRET must be at least 32 characters" >&2
  exit 2
fi

if [[ ${#NTFY_DISTRIBUTOR_PASSWORD} -lt 16 ]]; then
  echo "NTFY_DISTRIBUTOR_PASSWORD must be at least 16 characters" >&2
  exit 2
fi

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root (or with sudo -E)." >&2
  exit 2
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

if [[ ! -f "${REPO_ROOT}/infra/ntfy/docker-compose.yml" || ! -f "${REPO_ROOT}/infra/coturn/docker-compose.yml" ]]; then
  echo "Run from a complete Aurora Call repository checkout." >&2
  exit 2
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends \
  ca-certificates \
  certbot \
  curl \
  docker.io \
  docker-compose-v2 \
  dnsutils \
  openssl \
  ufw

systemctl enable --now docker

PUBLIC_IP="${TURN_EXTERNAL_IP:-}"
if [[ -z "${PUBLIC_IP}" ]]; then
  PUBLIC_IP="$(curl -4fsS --max-time 10 https://api.ipify.org || true)"
fi
if [[ -z "${PUBLIC_IP}" ]]; then
  echo "Unable to determine public IPv4. Set TURN_EXTERNAL_IP explicitly." >&2
  exit 2
fi
TURN_RELAY_IP="${TURN_RELAY_IP:-${PUBLIC_IP}}"

check_dns() {
  local domain="$1"
  local resolved
  resolved="$(dig +short A "${domain}" | tail -n1)"
  if [[ "${resolved}" != "${PUBLIC_IP}" ]]; then
    echo "DNS check failed: ${domain} resolves to '${resolved:-nothing}', expected ${PUBLIC_IP}." >&2
    exit 3
  fi
}

check_dns "${PUSH_DOMAIN}"
check_dns "${TURN_DOMAIN}"

install -d -m 0755 "${AURORA_INFRA_DIR}"
rm -rf "${AURORA_INFRA_DIR}/ntfy" "${AURORA_INFRA_DIR}/coturn"
cp -a "${REPO_ROOT}/infra/ntfy" "${AURORA_INFRA_DIR}/ntfy"
cp -a "${REPO_ROOT}/infra/coturn" "${AURORA_INFRA_DIR}/coturn"

ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw allow 3478/tcp
ufw allow 3478/udp
ufw allow 5349/tcp
ufw allow "${TURN_RELAY_MIN_PORT}:${TURN_RELAY_MAX_PORT}/udp"
ufw --force enable

# Obtain the TURN TLS certificate before Caddy binds port 80.
if [[ ! -f "/etc/letsencrypt/live/${TURN_DOMAIN}/fullchain.pem" ]]; then
  certbot certonly \
    --standalone \
    --non-interactive \
    --agree-tos \
    --no-eff-email \
    --email "${CERTBOT_EMAIL}" \
    -d "${TURN_DOMAIN}"
fi

cat >"${AURORA_INFRA_DIR}/coturn/.env" <<EOF
TURN_SHARED_SECRET=${TURN_SHARED_SECRET}
TURN_EXTERNAL_IP=${PUBLIC_IP}
TURN_RELAY_IP=${TURN_RELAY_IP}
TURN_CERT_DIR=/etc/letsencrypt/live/${TURN_DOMAIN}
EOF
chmod 0600 "${AURORA_INFRA_DIR}/coturn/.env"

cd "${AURORA_INFRA_DIR}/ntfy"
docker compose pull
docker compose up -d

# ntfy supports NTFY_PASSWORD for non-interactive user password management.
if docker compose exec -T ntfy ntfy user list 2>/dev/null | grep -q "aurora-mobile"; then
  docker compose exec -T -e NTFY_PASSWORD="${NTFY_DISTRIBUTOR_PASSWORD}" ntfy \
    ntfy user change-pass aurora-mobile
else
  docker compose exec -T -e NTFY_PASSWORD="${NTFY_DISTRIBUTOR_PASSWORD}" ntfy \
    ntfy user add aurora-mobile
fi

docker compose exec -T ntfy ntfy access aurora-mobile 'up*' read-only
docker compose exec -T ntfy ntfy access '*' 'up*' write-only

cd "${AURORA_INFRA_DIR}/coturn"
docker compose pull
docker compose up -d

# Renewal hook: stop Caddy only while Certbot uses port 80, then restart it.
install -d -m 0755 /etc/letsencrypt/renewal-hooks/pre /etc/letsencrypt/renewal-hooks/post
cat >/etc/letsencrypt/renewal-hooks/pre/aurora-stop-caddy.sh <<EOF
#!/usr/bin/env bash
cd '${AURORA_INFRA_DIR}/ntfy'
docker compose stop caddy
EOF
cat >/etc/letsencrypt/renewal-hooks/post/aurora-restart-services.sh <<EOF
#!/usr/bin/env bash
cd '${AURORA_INFRA_DIR}/ntfy'
docker compose up -d caddy
cd '${AURORA_INFRA_DIR}/coturn'
docker compose restart coturn
EOF
chmod 0755 \
  /etc/letsencrypt/renewal-hooks/pre/aurora-stop-caddy.sh \
  /etc/letsencrypt/renewal-hooks/post/aurora-restart-services.sh

curl -fsS "https://${PUSH_DOMAIN}/v1/health" >/dev/null

docker compose -f "${AURORA_INFRA_DIR}/coturn/docker-compose.yml" ps

echo
printf 'Aurora infrastructure is running.\n'
printf 'Push: https://%s\n' "${PUSH_DOMAIN}"
printf 'TURN: %s (%s)\n' "${TURN_DOMAIN}" "${PUBLIC_IP}"
printf 'Keep TURN_SHARED_SECRET synchronized with Supabase aurora_push_config.\n'
