#!/bin/bash

set -u

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
HOST="0.0.0.0"
LOCAL_HOST="127.0.0.1"
START_PORT="${PORT:-8782}"
PORT="$START_PORT"

cd "$APP_DIR" || exit 1

if command -v python3 >/dev/null 2>&1; then
  PYTHON_BIN="python3"
elif command -v python >/dev/null 2>&1; then
  PYTHON_BIN="python"
else
  echo "Cannot find Python. Please install Python 3 first."
  read -r -p "Press Enter to close this window."
  exit 1
fi

port_busy() {
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
  elif command -v nc >/dev/null 2>&1; then
    nc -z "$LOCAL_HOST" "$1" >/dev/null 2>&1
  else
    return 1
  fi
}

get_lan_ip() {
  local iface
  local ip

  for iface in en0 en1 en2 en3 en4; do
    ip="$(ipconfig getifaddr "$iface" 2>/dev/null || true)"
    if [ -n "$ip" ]; then
      echo "$ip"
      return 0
    fi
  done

  echo ""
}

serves_static_app_at() {
  if ! command -v curl >/dev/null 2>&1; then
    return 1
  fi

  curl -fsS "http://$1:$2/index.html" 2>/dev/null | grep -q "app.js"
}

serves_this_app_at() {
  serves_static_app_at "$1" "$2" || return 1
  curl -fsS "http://$1:$2/api/storage" 2>/dev/null | grep -q '"keys"' || return 1
}

serves_this_app() {
  serves_this_app_at "$LOCAL_HOST" "$1"
}

LAN_IP="$(get_lan_ip)"
EXISTING_SERVER=0
while port_busy "$PORT"; do
  if serves_this_app "$PORT"; then
    if [ -z "$LAN_IP" ] || serves_this_app_at "$LAN_IP" "$PORT"; then
      EXISTING_SERVER=1
      break
    fi
  fi

  if serves_static_app_at "$LOCAL_HOST" "$PORT"; then
    echo "An older diary server is already using port $PORT."
    echo "Please close the old diary terminal window or press Ctrl+C there, then double-click this file again."
    echo
    echo "Keeping the same port is important so the PC browser can migrate your existing diary data."
    read -r -p "Press Enter to close this window."
    exit 1
  fi

  PORT=$((PORT + 1))
  if [ "$PORT" -gt 8799 ]; then
    echo "No available port found between ${START_PORT} and 8799."
    read -r -p "Press Enter to close this window."
    exit 1
  fi
done

FRESH_ID="$(date +%Y%m%d%H%M%S)"
LOCAL_URL="http://${LOCAL_HOST}:${PORT}/?fresh=${FRESH_ID}"
if [ -n "$LAN_IP" ]; then
  MOBILE_URL="http://${LAN_IP}:${PORT}/?fresh=${FRESH_ID}"
else
  MOBILE_URL=""
fi

if [ "$EXISTING_SERVER" -eq 1 ]; then
  echo "Diary system is already running."
  echo "Computer: $LOCAL_URL"
  if [ -n "$MOBILE_URL" ]; then
    echo "Phone on the same Wi-Fi: $MOBILE_URL"
  fi
  if command -v open >/dev/null 2>&1; then
    open "$LOCAL_URL"
  fi
  read -r -p "Press Enter to close this window."
  exit 0
fi

LOG_FILE="${TMPDIR:-/tmp}/rizhi-diary-server-${PORT}.log"

echo "Starting diary system..."
echo "$APP_DIR"
echo

"$PYTHON_BIN" "$APP_DIR/server.py" --host "$HOST" --port "$PORT" > "$LOG_FILE" 2>&1 &
SERVER_PID=$!

cleanup() {
  if kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    kill "$SERVER_PID" >/dev/null 2>&1
  fi
}

trap cleanup EXIT INT TERM

READY=0
COUNT=0
while [ "$COUNT" -lt 40 ]; do
  if curl -fsS "http://${LOCAL_HOST}:${PORT}/index.html" >/dev/null 2>&1; then
    READY=1
    break
  fi

  if ! kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    echo "Startup failed. Log:"
    cat "$LOG_FILE"
    read -r -p "Press Enter to close this window."
    exit 1
  fi

  sleep 0.25
  COUNT=$((COUNT + 1))
done

if [ "$READY" -eq 0 ]; then
  echo "The server is starting slowly. Opening the page anyway."
fi

if command -v open >/dev/null 2>&1; then
  open "$LOCAL_URL"
fi

echo "Diary system is running:"
echo "Computer: $LOCAL_URL"
if [ -n "$MOBILE_URL" ]; then
  echo "Phone on the same Wi-Fi: $MOBILE_URL"
else
  echo "Phone: cannot detect this Mac's Wi-Fi IP. Check System Settings -> Wi-Fi -> Details."
fi
echo
echo "Keep this window open while using the system."
echo "Close this window or press Ctrl+C to stop it."
echo "Log: $LOG_FILE"
echo

wait "$SERVER_PID"
