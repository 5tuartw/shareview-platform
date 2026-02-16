#!/bin/bash
# Explore the ShareView data source via the SSH tunnel.
# Usage: ./scripts/explore_shareview_datasource.sh [table_name]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env.local"

if [ -f "$ENV_FILE" ]; then
  set -a
  . "$ENV_FILE"
  set +a
fi

: "${SOURCE_DB_USER:?SOURCE_DB_USER is required}"
: "${SOURCE_DB_PASS:?SOURCE_DB_PASS is required}"
: "${SOURCE_DB_NAME:?SOURCE_DB_NAME is required}"

LOCAL_PORT="${LOCAL_PORT:-18007}"

if ! lsof -i ":$LOCAL_PORT" -s TCP:LISTEN > /dev/null 2>&1; then
  echo "✗ No tunnel detected on localhost:$LOCAL_PORT"
  echo "Start it with: ./scripts/connect_shareview_datasource_tunnel.sh"
  exit 1
fi

PSQL_BASE=(psql -X -h 127.0.0.1 -p "$LOCAL_PORT" -U "$SOURCE_DB_USER" -d "$SOURCE_DB_NAME" -v ON_ERROR_STOP=1 -P pager=off)

export PGPASSWORD="$SOURCE_DB_PASS"

echo "=== Connection Info ==="
"${PSQL_BASE[@]}" -c "SELECT current_database() AS db, current_user AS user, inet_server_addr() AS server, inet_server_port() AS port;"

echo ""
echo "=== Public Tables ==="
"${PSQL_BASE[@]}" -c "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name;"

echo ""
echo "=== Largest Tables (Estimated Rows) ==="
"${PSQL_BASE[@]}" -c "SELECT relname AS table, n_live_tup AS approx_rows FROM pg_stat_user_tables ORDER BY n_live_tup DESC NULLS LAST LIMIT 20;"

TABLE_NAME="${1:-}"
if [ -n "$TABLE_NAME" ]; then
  echo ""
  echo "=== Columns: $TABLE_NAME ==="
  if ! "${PSQL_BASE[@]}" -t -A -c "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='${TABLE_NAME}';" | grep -q 1; then
    echo "✗ Table not found: $TABLE_NAME"
    exit 1
  fi

  "${PSQL_BASE[@]}" -c "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='${TABLE_NAME}' ORDER BY ordinal_position;"

  echo ""
  echo "=== Sample Rows: $TABLE_NAME ==="
  "${PSQL_BASE[@]}" -c "SELECT * FROM \"${TABLE_NAME}\" LIMIT 5;"
fi
