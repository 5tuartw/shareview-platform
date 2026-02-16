#!/bin/bash
# ShareView data source SSH tunnel helper
# Usage: ./scripts/connect_shareview_datasource_tunnel.sh [--close]

set -e

SSH_KEY="${SSH_KEY:-$HOME/.ssh/shareview_datasource}"
SSH_HOST="${SSH_HOST:-root@188.245.104.170}"
REMOTE_DB_HOST="${REMOTE_DB_HOST:-10.2.0.2}"
REMOTE_DB_PORT="${REMOTE_DB_PORT:-8007}"
LOCAL_PORT="${LOCAL_PORT:-18007}"
CLOSE_MODE=false

if [ "$1" = "--close" ]; then
  CLOSE_MODE=true
elif [ -n "$1" ]; then
  echo "Usage: $0 [--close]"
  exit 1
fi

check_tunnel() {
  local port=$1
  if lsof -i ":$port" -s TCP:LISTEN > /dev/null 2>&1; then
    local pid
    pid=$(lsof -ti ":$port" -s TCP:LISTEN)
    local cmd
    cmd=$(ps -p "$pid" -o command= 2>/dev/null || echo "unknown")
    if echo "$cmd" | grep -q "ssh.*-L.*$port:$REMOTE_DB_HOST:$REMOTE_DB_PORT"; then
      echo "✓ Tunnel already running (PID $pid)"
      return 0
    fi
    echo "⚠ Port $port is in use by another process (PID $pid): $cmd"
    return 1
  fi
  return 1
}

close_tunnel() {
  local port=$1
  if lsof -i ":$port" -s TCP:LISTEN > /dev/null 2>&1; then
    local pid
    pid=$(lsof -ti ":$port" -s TCP:LISTEN)
    echo "→ Closing tunnel on port $port (PID $pid)..."
    kill "$pid" 2>/dev/null || true
    sleep 1
    if lsof -i ":$port" -s TCP:LISTEN > /dev/null 2>&1; then
      echo "✗ Failed to close tunnel on port $port"
      return 1
    fi
    echo "✓ Tunnel closed"
    return 0
  fi
  echo "○ Tunnel not running"
  return 0
}

if [ "$CLOSE_MODE" = true ]; then
  close_tunnel "$LOCAL_PORT"
  exit 0
fi

if [ ! -f "$SSH_KEY" ]; then
  echo "✗ SSH key not found: $SSH_KEY"
  exit 1
fi

if check_tunnel "$LOCAL_PORT"; then
  echo "Local port: $LOCAL_PORT"
  echo "Remote target: $REMOTE_DB_HOST:$REMOTE_DB_PORT"
  exit 0
fi

echo "→ Starting tunnel on localhost:$LOCAL_PORT → $REMOTE_DB_HOST:$REMOTE_DB_PORT"
ssh -i "$SSH_KEY" -L "$LOCAL_PORT:$REMOTE_DB_HOST:$REMOTE_DB_PORT" -N -f "$SSH_HOST"

sleep 1
if check_tunnel "$LOCAL_PORT"; then
  echo "Local port: $LOCAL_PORT"
  echo "Remote target: $REMOTE_DB_HOST:$REMOTE_DB_PORT"
  echo ""
  echo "Example test:"
  echo "  PGPASSWORD=\"$SOURCE_DB_PASS\" psql -h 127.0.0.1 -p $LOCAL_PORT -U $SOURCE_DB_USER -d $SOURCE_DB_NAME -c '\\dt'"
else
  echo "✗ Failed to establish tunnel"
  exit 1
fi
