#!/usr/bin/env bash
set -Eeuo pipefail

APP_NAME="${APP_NAME:-next-whois}"
PORT="${PORT:-3010}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
CONFIG_FILE="${APP_DIR}/ecosystem.config.cjs"
NEXT_BIN="${APP_DIR}/node_modules/next/dist/bin/next"

cd "${APP_DIR}"

if ! command -v pm2 >/dev/null 2>&1; then
  echo "pm2 is required. Install it with: npm install -g pm2" >&2
  exit 1
fi

if [[ ! -f "${CONFIG_FILE}" ]]; then
  echo "Missing ${CONFIG_FILE}" >&2
  exit 1
fi

if [[ ! -f "${NEXT_BIN}" ]]; then
  echo "Missing production dependencies. Run: pnpm install --prod --frozen-lockfile" >&2
  exit 1
fi

echo "Stopping old ${APP_NAME} process if it exists..."
pm2 delete "${APP_NAME}" >/dev/null 2>&1 || true

if command -v fuser >/dev/null 2>&1; then
  echo "Clearing any process still listening on ${PORT}/tcp..."
  fuser -k "${PORT}/tcp" >/dev/null 2>&1 || true
fi

echo "Starting ${APP_NAME} from ${CONFIG_FILE}..."
pm2 start "${CONFIG_FILE}" --update-env
pm2 save

echo "Current listener on ${PORT}:"
ss -lntp 2>/dev/null | grep ":${PORT}" || true

echo "PM2 status:"
pm2 status "${APP_NAME}"
