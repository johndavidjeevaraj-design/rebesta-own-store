#!/usr/bin/env bash
# Auto-update: pulls new code from GitHub and restarts the store.
# Called every 5 minutes by /etc/cron.d/rebesta-update
# Data (orders/products/settings) lives OUTSIDE the app dir — never touched.
set -euo pipefail

APP_DIR="/opt/rebesta-store"
cd "$APP_DIR"

git fetch origin main --quiet
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse origin/main)

[ "$LOCAL" = "$REMOTE" ] && exit 0

git reset --hard origin/main --quiet
npm install --omit=dev --no-audit --no-fund --silent >/dev/null 2>&1 || npm install --omit=dev --no-audit --no-fund
pm2 restart rebesta-store --update-env >/dev/null 2>&1 || pm2 start ecosystem.config.js --env production >/dev/null 2>&1
echo "$(date '+%Y-%m-%d %H:%M:%S') ✅ deployed $(git rev-parse --short HEAD)"
