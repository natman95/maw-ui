#!/bin/bash
# MAW UI Deploy Script — build + additive overlay deploy to production
# Usage: ./deploy.sh

set -e

DIST_DIR="$(dirname "$0")/dist"
DEPLOY_DIR="/opt/maw-dashboard"

echo "🔨 Building..."
bun run build

echo "📦 Deploying..."
# /opt/maw-dashboard/assets is SHARED with a code-split MPA (14 live pages + ~30 foreign chunks). rm -rf would 404 them. Additive overlay only — never wipe. (Labubu ratify 2026-06-30)
cp -a "$DIST_DIR/assets/." "$DEPLOY_DIR/assets/"
cp "$DIST_DIR/index.html" "$DEPLOY_DIR/index.html"
cp "$DIST_DIR/favicon.svg" "$DEPLOY_DIR/favicon.svg" 2>/dev/null || true

echo "✅ Deployed. Verifying..."
# Check referenced JS file exists
JS_FILE=$(grep -oP 'src="/maw/assets/\K[^"]+' "$DEPLOY_DIR/index.html")
if [ -f "$DEPLOY_DIR/assets/$JS_FILE" ]; then
  echo "   ✓ $JS_FILE exists"
else
  echo "   ✗ $JS_FILE MISSING — deploy may be broken!"
  exit 1
fi

echo "🎉 Done — http://76.13.221.42/maw/"
