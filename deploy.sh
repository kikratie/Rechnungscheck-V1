#!/bin/bash
# =============================================================
# Ki2Go Accounting — Manual Deploy Script
# =============================================================
# Use this for manual deploys on the server.
# For automated deploys, use GitHub Actions (push to main).
#
# Usage: bash deploy.sh
# =============================================================
set -e

echo ""
echo "============================================"
echo "  Ki2Go Accounting — Manual Deploy"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================"
echo ""

# Check .env.production exists
if [ ! -f .env.production ]; then
  echo "ERROR: .env.production not found!"
  echo "Copy .env.production.example to .env.production and fill in values."
  exit 1
fi

# Make env vars available for docker compose variable substitution
cp .env.production .env

COMPOSE="docker compose -f docker-compose.prod.yml"

# ---------------------------------------------------
# [1/6] Pull latest code
# ---------------------------------------------------
echo "[1/6] Pulling latest code..."
git pull

# ---------------------------------------------------
# [2/6] Backup database (if running)
# ---------------------------------------------------
echo "[2/6] Backing up database..."
source .env.production
POSTGRES_RUNNING=$(${COMPOSE} ps postgres --format '{{.State}}' 2>/dev/null || echo "")
if echo "$POSTGRES_RUNNING" | grep -qi "running"; then
  mkdir -p /opt/backups
  BACKUP_FILE="/opt/backups/db-$(date +%Y%m%d-%H%M%S).sql.gz"
  ${COMPOSE} exec -T postgres \
    pg_dump -U "${POSTGRES_USER:-buchungsai}" "${POSTGRES_DB:-buchungsai}" \
    | gzip > "$BACKUP_FILE"
  echo "  Backup: $BACKUP_FILE"
  # Keep last 10 backups
  ls -t /opt/backups/db-*.sql.gz 2>/dev/null | tail -n +11 | xargs -r rm
else
  echo "  Postgres not running — skipping backup"
fi

# ---------------------------------------------------
# [3/6] Build Docker image
# ---------------------------------------------------
echo "[3/6] Building Docker image..."
${COMPOSE} build

# ---------------------------------------------------
# [4/6] Run database migrations
# ---------------------------------------------------
echo "[4/6] Running database migrations..."
${COMPOSE} run --rm app \
  npx prisma migrate deploy --schema prisma/schema.prisma

# ---------------------------------------------------
# [5/6] Start/restart all services
# ---------------------------------------------------
echo "[5/6] Starting services..."
${COMPOSE} up -d --remove-orphans

# ---------------------------------------------------
# [6/6] Health check
# ---------------------------------------------------
echo "[6/6] Health check..."
HEALTHY=false
APP_CONTAINER=$(${COMPOSE} ps -q app 2>/dev/null || echo "")

if [ -n "$APP_CONTAINER" ]; then
  for i in $(seq 1 12); do
    sleep 10
    STATUS=$(docker inspect --format='{{.State.Health.Status}}' "$APP_CONTAINER" 2>/dev/null || echo "starting")
    echo "  Check $i/12: $STATUS"
    if [ "$STATUS" = "healthy" ]; then
      HEALTHY=true
      break
    fi
  done
fi

if [ "$HEALTHY" = true ]; then
  DOMAIN=$(grep "^DOMAIN=" .env.production | cut -d= -f2)
  echo ""
  echo "============================================"
  echo "  DEPLOY SUCCESSFUL"
  echo "  https://${DOMAIN}"
  echo "============================================"
else
  echo ""
  echo "============================================"
  echo "  WARNING: Health check failed!"
  echo "  Check logs: ${COMPOSE} logs app"
  echo "============================================"
  exit 1
fi
