#!/bin/bash
set -e

echo "=== Ki2Go Accounting — Deploy ==="

# Check .env.production exists
if [ ! -f .env.production ]; then
  echo "ERROR: .env.production not found!"
  echo "Copy .env.production.example to .env.production and fill in values."
  exit 1
fi

# Pull latest code
echo "[1/5] Pulling latest code..."
git pull

# Build Docker image
echo "[2/5] Building Docker image..."
docker compose -f docker-compose.prod.yml build

# Run database migrations
echo "[3/5] Running database migrations..."
docker compose -f docker-compose.prod.yml run --rm app \
  npx prisma migrate deploy --schema prisma/schema.prisma

# Start/restart all services
echo "[4/5] Starting services..."
docker compose -f docker-compose.prod.yml up -d

# Health check
echo "[5/5] Checking health..."
sleep 10
if curl -sf http://localhost:3001/api/v1/health > /dev/null 2>&1; then
  echo ""
  echo "=== Deploy successful! ==="
  echo "App is running. Check https://\$(grep DOMAIN .env.production | cut -d= -f2)"
else
  echo ""
  echo "WARNING: Health check failed. Check logs:"
  echo "  docker compose -f docker-compose.prod.yml logs app"
fi
