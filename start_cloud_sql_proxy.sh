#!/bin/bash
# Start Cloud SQL Proxy for ShareView Platform
# Connects to the same database as s8-retailer-analytics
# Usage: ./start_cloud_sql_proxy.sh

echo "================================================================"
echo "Starting Cloud SQL Proxy for ShareView Platform"
echo "================================================================"

# Check if cloud_sql_proxy is installed
if ! command -v cloud_sql_proxy &> /dev/null; then
    echo "❌ cloud_sql_proxy not found!"
    echo ""
    echo "Install with:"
    echo "  curl -o cloud-sql-proxy https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.8.0/cloud-sql-proxy.linux.amd64"
    echo "  chmod +x cloud-sql-proxy"
    echo "  sudo mv cloud-sql-proxy /usr/local/bin/cloud_sql_proxy"
    exit 1
fi

# Kill any existing cloud_sql_proxy processes
if pgrep -f "cloud_sql_proxy.*tcp:5436" > /dev/null; then
    echo "⚠️  Found existing Cloud SQL Proxy processes. Stopping them..."
    pkill -f "cloud_sql_proxy.*tcp:5436"
    sleep 2
    echo "   Stopped existing processes"
fi

# Verify port 5436 is free
if lsof -Pi :5436 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "⚠️  Port 5436 is still in use. Killing process..."
    kill -9 $(lsof -t -i:5436) 2>/dev/null || true
    sleep 1
fi

# Start Cloud SQL Proxy
echo ""
echo "🚀 Starting Cloud SQL Proxy on port 5436..."
echo "   Instance: retailer-sales-rpt:europe-west2:rsr-db"
echo "   Database: retailer_analytics"
echo "   Shared with: s8-retailer-analytics"
echo ""

# Start proxy in background and capture PID
nohup cloud_sql_proxy -instances=retailer-sales-rpt:europe-west2:rsr-db=tcp:5436 > /tmp/cloud_sql_proxy_shareview.log 2>&1 &
PROXY_PID=$!

echo "   Started with PID: $PROXY_PID"

# Wait for proxy to be ready
echo "⏳ Waiting for Cloud SQL Proxy to be ready..."
for i in {1..10}; do
    if lsof -Pi :5436 -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo "✅ Cloud SQL Proxy is ready!"
        echo ""
        echo "Connection details:"
        echo "  Host: 127.0.0.1"
        echo "  Port: 5436"
        echo "  Database: retailer_analytics"
        echo "  User: analytics_user"
        echo ""
        echo "DATABASE_URL=postgresql://analytics_user:AnalyticsUser2025!@127.0.0.1:5436/retailer_analytics"
        echo ""
        echo "To stop the proxy:"
        echo "  pkill -f 'cloud_sql_proxy.*tcp:5436'"
        echo ""
        echo "Logs available at: /tmp/cloud_sql_proxy_shareview.log"
        exit 0
    fi
    sleep 1
    if [ $i -eq 10 ]; then
        echo "❌ Cloud SQL Proxy failed to start"
        echo "Check logs: tail -f /tmp/cloud_sql_proxy_shareview.log"
        exit 1
    fi
done
