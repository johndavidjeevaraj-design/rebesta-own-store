#!/usr/bin/env bash
# ============================================================
#  Rebesta Fresh — one-paste production setup for Hostinger VPS
#  Usage:  bash setup-rebesta.sh rebestafresh.in
#  Safe to re-run (idempotent). Installs:
#  Node.js 20 + PM2 + Caddy (auto-SSL) + firewall + auto-update
# ============================================================
set -euo pipefail

DOMAIN="${1:-rebestafresh.in}"
REPO="https://github.com/johndavidjeevaraj-design/rebesta-own-store.git"
APP_DIR="/opt/rebesta-store"
DATA_DIR="/var/rebesta-data"

step() { echo ""; echo "==> $1"; }
fail() { echo ""; echo "❌ SETUP FAILED at: $1"; echo "   Take a screenshot of this terminal and send it to your developer."; exit 1; }
trap 'fail "step $STEP"' ERR

if [ "$(id -u)" -ne 0 ]; then echo "Run this as root (the VPS browser terminal logs in as root)."; exit 1; fi

STEP="1/9 system packages"
step "$STEP"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y -qq || apt-get update -y
apt-get install -y -qq curl git ca-certificates gnupg ufw >/dev/null 2>&1 || apt-get install -y curl git ca-certificates gnupg ufw
echo "✅ curl + git installed"

# Swap file — small servers (e2-micro, 1 GB RAM) ship with none and npm/pm2
# can get OOM-killed mid-install. 2 GB swap makes everything survivable.
if [ "$(swapon --show=NAME --noheadings 2>/dev/null | wc -l)" -eq 0 ]; then
  if [ ! -f /swapfile ]; then
    dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
    chmod 600 /swapfile
    mkswap /swapfile >/dev/null
  fi
  swapon /swapfile 2>/dev/null || true
  grep -q '^/swapfile' /etc/fstab 2>/dev/null || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  sysctl -w vm.swappiness=10 >/dev/null 2>&1 || true
  echo "✅ 2 GB swap added (protects the 1 GB RAM server from memory kills)"
else
  echo "✅ swap already active"
fi

STEP="2/9 Node.js 20"
step "$STEP"
if ! command -v node >/dev/null 2>&1 || ! node -v | grep -q '^v2[02]'; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
  apt-get install -y nodejs >/dev/null 2>&1
fi
echo "✅ Node.js $(node -v)"

STEP="3/9 PM2 process manager"
step "$STEP"
command -v pm2 >/dev/null 2>&1 || npm install -g pm2 --silent >/dev/null 2>&1
echo "✅ PM2 $(pm2 -v)"

STEP="4/9 Caddy web server (free automatic SSL)"
step "$STEP"
if ! command -v caddy >/dev/null 2>&1; then
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https >/dev/null 2>&1 || true
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg 2>/dev/null
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  apt-get update -y -qq >/dev/null 2>&1 || apt-get update -y
  apt-get install -y caddy >/dev/null 2>&1
fi
echo "✅ Caddy $(caddy version | cut -d' ' -f1)"

STEP="5/9 Store code + data"
step "$STEP"
mkdir -p "$DATA_DIR"
if [ -d "$APP_DIR/.git" ]; then
  cd "$APP_DIR" && git fetch origin main --quiet && git reset --hard origin/main --quiet
  echo "✅ code updated to latest"
else
  rm -rf "$APP_DIR"
  git clone --depth 1 -b main "$REPO" "$APP_DIR" >/dev/null 2>&1
  echo "✅ store code downloaded"
fi
cd "$APP_DIR"
npm install --omit=dev --no-audit --no-fund --silent >/dev/null 2>&1 || npm install --omit=dev --no-audit --no-fund
echo "✅ dependencies installed"

# Seed data on FIRST run only (never overwrites real orders later)
if [ ! -f "$DATA_DIR/settings.json" ]; then
  cp data/settings.json "$DATA_DIR/settings.json"
  echo "[]" > "$DATA_DIR/orders.json"
  echo "✅ fresh data created in $DATA_DIR (safe from updates)"
fi
if [ ! -f "$DATA_DIR/products.json" ]; then
  cp data/products.json "$DATA_DIR/products.json"
fi
chown -R root:root "$DATA_DIR"
chmod 700 "$DATA_DIR"

STEP="6/9 Environment + admin key"
step "$STEP"
ENV_FILE="$APP_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
  ADMIN_KEY=$(openssl rand -hex 24 2>/dev/null || head -c 48 /dev/urandom | od -An -tx1 | tr -d ' \n')
  cat > "$ENV_FILE" <<EOF
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
APP_URL=https://$DOMAIN
DATA_DIR=$DATA_DIR
ADMIN_KEY=$ADMIN_KEY

# --- PayU online payments (fill when ready, then: pm2 restart rebesta-store) ---
PAYU_KEY=
PAYU_SALT=

# --- Order alert emails via Gmail (fill when ready) ---
SMTP_HOST=
SMTP_PORT=465
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
NOTIFY_EMAIL=
EOF
  chmod 600 "$ENV_FILE"
  echo "$ADMIN_KEY" > "$DATA_DIR/ADMIN-KEY.txt"
  chmod 600 "$DATA_DIR/ADMIN-KEY.txt"
  echo "✅ .env created with a brand-new secret admin key"
else
  echo "✅ existing .env kept (admin key unchanged)"
fi

STEP="7/9 Start the store (auto-restart on crash + boot)"
step "$STEP"
cd "$APP_DIR"
pm2 delete rebesta-store >/dev/null 2>&1 || true
pm2 start ecosystem.config.cjs >/dev/null 2>&1 || {
  echo "❗ pm2 could not start the store — showing the real reason:"
  pm2 logs --nostream --lines 25 2>/dev/null | grep -v "^\[TAILING\]" | tail -35
  fail "$STEP"
}
pm2 save >/dev/null 2>&1 || true
env PATH=$PATH:/usr/bin pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true
sleep 2
pm2 pid rebesta-store >/dev/null 2>&1 && echo "✅ store is RUNNING (PID $(pm2 pid rebesta-store))" || {
  echo "❗ store process died right after start — showing logs:"
  pm2 logs rebesta-store --nostream --lines 25 2>/dev/null | grep -v "^\[TAILING\]" | tail -35
  fail "$STEP"
}

STEP="8/9 Domain + SSL + firewall"
step "$STEP"
cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN {
	encode zstd gzip
	reverse_proxy 127.0.0.1:3000
}

www.$DOMAIN {
	redir https://$DOMAIN{uri} permanent
}
EOF
systemctl reload caddy 2>/dev/null || systemctl restart caddy
echo "✅ Caddy serving https://$DOMAIN (SSL activates once DNS points here)"

ufw allow OpenSSH >/dev/null 2>&1
ufw allow 80/tcp >/dev/null 2>&1
ufw allow 443/tcp >/dev/null 2>&1
ufw --force enable >/dev/null 2>&1
echo "✅ firewall on (SSH + web only)"

# Auto-update: checks GitHub every 5 minutes, deploys new code automatically
mkdir -p /etc/cron.d
cat > /etc/cron.d/rebesta-update <<EOF
*/5 * * * * root $APP_DIR/deploy/update.sh >> /var/log/rebesta-update.log 2>&1
EOF
chmod +x "$APP_DIR/deploy/update.sh" 2>/dev/null || true
echo "✅ auto-update every 5 min (git push = live in minutes)"

timedatectl set-timezone Asia/Kolkata 2>/dev/null || true

STEP="9/9 final check"
step "$STEP"
sleep 1
HTTP=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/health || echo "000")
SERVER_IP=$(curl -s -4 https://ifconfig.co 2>/dev/null || hostname -I | awk '{print $1}')
ADMIN_KEY=$(grep '^ADMIN_KEY=' "$ENV_FILE" | cut -d= -f2)

echo ""
echo "============================================================"
if [ "$HTTP" = "200" ]; then echo "🎉 REBESTA FRESH IS LIVE ON THIS SERVER!"; else echo "⚠️  Store answered: $HTTP (send this screenshot if not 200)"; fi
echo "============================================================"
echo ""
echo "  📌 NEXT STEP — point your domain to this IP:"
echo "     In your domain's DNS settings add TWO 'A' records:"
echo "        @     →  $SERVER_IP"
echo "        www   →  $SERVER_IP"
echo ""
echo "     Then wait 10–30 min and open:  https://$DOMAIN"
echo ""
echo "  🔑 YOUR ADMIN KEY (save this NOW, it shows once):"
echo "     ┌──────────────────────────────────────────────┐"
echo "     │  $ADMIN_KEY"
echo "     └──────────────────────────────────────────────┘"
echo "     Admin page: https://$DOMAIN/admin"
echo "     (lost key? run:  cat $DATA_DIR/ADMIN-KEY.txt)"
echo ""
echo "  🛠  Useful commands in this terminal:"
echo "     pm2 status              — is the store running?"
echo "     pm2 logs --lines 50     — recent errors"
echo "     systemctl reload caddy  — retry SSL certificate"
echo ""
echo "  🚀 Updates are automatic: new code pushed to GitHub"
echo "     goes live on its own within 5 minutes."
echo "============================================================"
