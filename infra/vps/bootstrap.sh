#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root (sudo)." >&2
  exit 2
fi

if [[ -n "${AURORA_SECRETS_FILE:-}" ]]; then
  if [[ ! -f "${AURORA_SECRETS_FILE}" ]]; then
    echo "AURORA_SECRETS_FILE does not exist" >&2
    exit 2
  fi
  # shellcheck disable=SC1090
  source "${AURORA_SECRETS_FILE}"
fi

APP_DOMAIN="${APP_DOMAIN:-auroracall.net}"
PUSH_DOMAIN="${PUSH_DOMAIN:-push.auroracall.net}"
TURN_DOMAIN="${TURN_DOMAIN:-turn.auroracall.net}"
AURORA_ENV_DIR="${AURORA_ENV_DIR:-/etc/aurora-call}"
AURORA_ENV_FILE="${AURORA_ENV_FILE:-${AURORA_ENV_DIR}/aurora.env}"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"
COMPOSE_FILE="${REPO_ROOT}/infra/vps/docker-compose.yml"

require() {
  local key="$1"
  if [[ -z "${!key:-}" ]]; then
    echo "Missing required value: ${key}" >&2
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

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends \
  ca-certificates \
  certbot \
  curl \
  dnsutils \
  docker.io \
  docker-compose-v2 \
  git \
  openssl \
  ufw
systemctl enable --now docker

PUBLIC_IP="${TURN_EXTERNAL_IP:-}"
if [[ -z "${PUBLIC_IP}" ]]; then
  PUBLIC_IP="$(curl -4fsS --max-time 10 https://api.ipify.org || true)"
fi
if [[ -z "${PUBLIC_IP}" ]]; then
  echo "Unable to determine public IPv4; set TURN_EXTERNAL_IP." >&2
  exit 2
fi

LOCAL_RELAY_IP="${TURN_RELAY_IP:-}"
if [[ -z "${LOCAL_RELAY_IP}" ]]; then
  LOCAL_RELAY_IP="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i=1;i<=NF;i++) if ($i=="src") {print $(i+1); exit}}')"
fi
if [[ -z "${LOCAL_RELAY_IP}" ]]; then
  LOCAL_RELAY_IP="${PUBLIC_IP}"
fi

check_dns() {
  local domain="$1"
  if ! dig +short A "${domain}" | grep -Fxq "${PUBLIC_IP}"; then
    echo "DNS check failed: ${domain} must have an A record for ${PUBLIC_IP}." >&2
    exit 3
  fi
}

check_dns "${APP_DOMAIN}"
check_dns "${PUSH_DOMAIN}"
check_dns "${TURN_DOMAIN}"

ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw allow 3478/tcp
ufw allow 3478/udp
ufw allow 5349/tcp
ufw allow 49160:49260/udp
ufw --force enable

install -d -m 0700 "${AURORA_ENV_DIR}"
TURN_CERT_DIR="/etc/letsencrypt/live/${TURN_DOMAIN}"
cat >"${AURORA_ENV_FILE}" <<EOF
APP_DOMAIN=${APP_DOMAIN}
PUSH_DOMAIN=${PUSH_DOMAIN}
TURN_DOMAIN=${TURN_DOMAIN}
TURN_SHARED_SECRET=${TURN_SHARED_SECRET}
TURN_EXTERNAL_IP=${PUBLIC_IP}
TURN_RELAY_IP=${LOCAL_RELAY_IP}
TURN_CERT_DIR=${TURN_CERT_DIR}
AURORA_SUPABASE_URL=${AURORA_SUPABASE_URL:-https://taqpirplpmjihmkztwlv.supabase.co}
AURORA_SUPABASE_PUBLISHABLE_KEY=${AURORA_SUPABASE_PUBLISHABLE_KEY:-sb_publishable_ciRXzMnLGCYUm-u-esWIOA_v6XjUEuu}
EOF
chmod 0600 "${AURORA_ENV_FILE}"

compose() {
  docker compose --env-file "${AURORA_ENV_FILE}" -f "${COMPOSE_FILE}" "$@"
}

if [[ ! -f "${TURN_CERT_DIR}/fullchain.pem" ]]; then
  compose stop caddy >/dev/null 2>&1 || true
  certbot certonly \
    --standalone \
    --non-interactive \
    --agree-tos \
    --no-eff-email \
    --email "${CERTBOT_EMAIL}" \
    -d "${TURN_DOMAIN}"
fi

compose pull ntfy caddy coturn
compose build --pull app
compose up -d --remove-orphans

if compose exec -T ntfy ntfy user list 2>/dev/null | grep -q "aurora-mobile"; then
  compose exec -T -e NTFY_PASSWORD="${NTFY_DISTRIBUTOR_PASSWORD}" ntfy \
    ntfy user change-pass aurora-mobile
else
  compose exec -T -e NTFY_PASSWORD="${NTFY_DISTRIBUTOR_PASSWORD}" ntfy \
    ntfy user add aurora-mobile
fi
compose exec -T ntfy ntfy access aurora-mobile 'up*' read-only
compose exec -T ntfy ntfy access '*' 'up*' write-only

install -d -m 0755 /etc/letsencrypt/renewal-hooks/pre /etc/letsencrypt/renewal-hooks/post
cat >/etc/letsencrypt/renewal-hooks/pre/aurora-stop-caddy.sh <<EOF
#!/usr/bin/env bash
docker compose --env-file '${AURORA_ENV_FILE}' -f '${COMPOSE_FILE}' stop caddy
EOF
cat >/etc/letsencrypt/renewal-hooks/post/aurora-restart-services.sh <<EOF
#!/usr/bin/env bash
docker compose --env-file '${AURORA_ENV_FILE}' -f '${COMPOSE_FILE}' up -d caddy
docker compose --env-file '${AURORA_ENV_FILE}' -f '${COMPOSE_FILE}' restart coturn
EOF
chmod 0755 \
  /etc/letsencrypt/renewal-hooks/pre/aurora-stop-caddy.sh \
  /etc/letsencrypt/renewal-hooks/post/aurora-restart-services.sh

curl --fail --silent --show-error "https://${APP_DOMAIN}/healthz" >/dev/null
curl --fail --silent --show-error "https://${PUSH_DOMAIN}/v1/health" >/dev/null
timeout 15 openssl s_client \
  -connect "${TURN_DOMAIN}:5349" \
  -servername "${TURN_DOMAIN}" \
  -verify_return_error \
  </dev/null 2>&1 | grep -q "Verify return code: 0 (ok)"

compose ps
printf '\nAurora Call deployment is healthy.\n'
printf 'App:  https://%s\n' "${APP_DOMAIN}"
printf 'Push: https://%s\n' "${PUSH_DOMAIN}"
printf 'TURN: %s (%s)\n' "${TURN_DOMAIN}" "${PUBLIC_IP}"
