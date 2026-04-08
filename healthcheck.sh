#!/bin/bash
# MAW Production Health Check
# Created by Pulse Oracle 🫀 — 2026-04-07

HOST="76.13.221.42"
WS_HOST="localhost:3456"
PASS=0
FAIL=0

check() {
  local name="$1"
  local result="$2"
  if [ "$result" -eq 0 ]; then
    echo "✅ PASS  $name"
    ((PASS++))
  else
    echo "❌ FAIL  $name"
    ((FAIL++))
  fi
}

echo "🫀 MAW Health Check — $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 1. Frontend returns 200
STATUS=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://${HOST}/maw/")
check "Frontend /maw/ (HTTP ${STATUS})" "$([ "$STATUS" = "200" ]; echo $?)"

# 2. /maw/api/pin-info returns JSON
BODY=$(curl -s --max-time 5 "http://${HOST}/maw/api/pin-info")
echo "$BODY" | jq . >/dev/null 2>&1
check "API /maw/api/pin-info (JSON)" "$?"

# 3. /maw/api/monitoring/health returns oracles
BODY=$(curl -s --max-time 5 "http://${HOST}/maw/api/monitoring/health")
echo "$BODY" | jq -e '.oracles' >/dev/null 2>&1
check "API /maw/api/monitoring/health (has oracles)" "$?"

# 4. /maw/api/fleet-config returns configs
BODY=$(curl -s --max-time 5 "http://${HOST}/maw/api/fleet-config")
echo "$BODY" | jq -e '.configs' >/dev/null 2>&1
check "API /maw/api/fleet-config (has configs)" "$?"

# 5. WebSocket connects
WS_OK=1
if command -v websocat >/dev/null 2>&1; then
  echo "" | websocat -t --max-messages 0 "ws://${WS_HOST}/ws" --ping-timeout 3 2>/dev/null &
  WS_PID=$!
  sleep 1
  if kill -0 "$WS_PID" 2>/dev/null; then
    WS_OK=0
    kill "$WS_PID" 2>/dev/null
    wait "$WS_PID" 2>/dev/null
  fi
elif command -v wscat >/dev/null 2>&1; then
  timeout 3 wscat -c "ws://${WS_HOST}/ws" --wait 1 >/dev/null 2>&1
  WS_OK=$?
else
  # Fallback: raw HTTP upgrade check
  UPGRADE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 \
    -H "Upgrade: websocket" \
    -H "Connection: Upgrade" \
    -H "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==" \
    -H "Sec-WebSocket-Version: 13" \
    "http://${WS_HOST}/ws")
  [ "$UPGRADE" = "101" ] && WS_OK=0
fi
check "WebSocket ws://${WS_HOST}/ws" "$WS_OK"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Results: ${PASS} passed, ${FAIL} failed (${PASS}/$((PASS+FAIL)) total)"

[ "$FAIL" -eq 0 ] && exit 0 || exit 1
