#!/bin/bash
# Start Cloud SQL Proxy for ShareView Platform
# Supports connecting to shareview-db, rsr-db, or both
# Usage: 
#   ./start_cloud_sql_proxy.sh [shareview|rsr|both]
#   
# Examples:
#   ./start_cloud_sql_proxy.sh          # Start both (default)
#   ./start_cloud_sql_proxy.sh shareview # Only ShareView database
#   ./start_cloud_sql_proxy.sh rsr       # Only RSR database
#   ./start_cloud_sql_proxy.sh both      # Both databases explicitly

# Parse arguments
MODE="${1:-both}"

if [[ ! "$MODE" =~ ^(shareview|rsr|both)$ ]]; then
    echo "❌ Invalid mode: $MODE"
    echo ""
    echo "Usage: $0 [shareview|rsr|both]"
    echo ""
    echo "  shareview - Connect to shareview-db only (port 5437)"
    echo "  rsr       - Connect to rsr-db only (port 5436)"
    echo "  both      - Connect to both databases (default)"
    exit 1
fi

echo "================================================================"
echo "Starting Cloud SQL Proxy - Mode: $MODE"
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

# Function to stop existing proxy on a port
stop_proxy_on_port() {
    local port=$1
    local name=$2
    
    if pgrep -f "cloud_sql_proxy.*tcp:$port" > /dev/null; then
        echo "⚠️  Found existing Cloud SQL Proxy on port $port ($name). Stopping..."
        pkill -f "cloud_sql_proxy.*tcp:$port"
        sleep 2
        echo "   Stopped"
    fi
    
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo "⚠️  Port $port still in use. Killing process..."
        kill -9 $(lsof -t -i:$port) 2>/dev/null || true
        sleep 1
    fi
}

# Function to start a proxy
start_proxy() {
    local instance=$1
    local port=$2
    local name=$3
    local log_file=$4
    
    echo ""
    echo "🚀 Starting $name proxy on port $port..."
    echo "   Instance: $instance"
    echo ""
    
    nohup cloud_sql_proxy -instances=$instance=tcp:$port > "$log_file" 2>&1 &
    local pid=$!
    echo "   Started with PID: $pid"
    
    # Wait for proxy to be ready
    echo "⏳ Waiting for proxy to be ready..."
    for i in {1..10}; do
        if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
            echo "✅ $name proxy is ready!"
            return 0
        fi
        sleep 1
    done
    
    echo "❌ $name proxy failed to start"
    echo "Check logs: tail -f $log_file"
    return 1
}

# Stop existing proxies based on mode
if [[ "$MODE" == "shareview" ]] || [[ "$MODE" == "both" ]]; then
    stop_proxy_on_port 5437 "shareview-db"
fi

if [[ "$MODE" == "rsr" ]] || [[ "$MODE" == "both" ]]; then
    stop_proxy_on_port 5436 "rsr-db"
fi

# Start requested proxies
SHAREVIEW_STARTED=false
RSR_STARTED=false

if [[ "$MODE" == "shareview" ]] || [[ "$MODE" == "both" ]]; then
    if start_proxy "retailer-sales-rpt:europe-west2:shareview-db" 5437 "ShareView" "/tmp/cloud_sql_proxy_shareview.log"; then
        SHAREVIEW_STARTED=true
    fi
fi

if [[ "$MODE" == "rsr" ]] || [[ "$MODE" == "both" ]]; then
    if start_proxy "retailer-sales-rpt:europe-west2:rsr-db" 5436 "RSR" "/tmp/cloud_sql_proxy_rsr.log"; then
        RSR_STARTED=true
    fi
fi

# Display connection details
echo ""
echo "================================================================"
echo "Connection Details"
echo "================================================================"

if [[ "$SHAREVIEW_STARTED" == true ]]; then
    echo ""
    echo "📊 ShareView Database (shareview-db):"
    echo "  Host: 127.0.0.1"
    echo "  Port: 5437"
    echo "  Database: shareview"
    echo "  User: sv_user"
    echo ""
    echo "  SV_DATABASE_URL=postgresql://sv_user:ShareView2026!@127.0.0.1:5437/shareview"
    echo ""
    echo "  Logs: tail -f /tmp/cloud_sql_proxy_shareview.log"
fi

if [[ "$RSR_STARTED" == true ]]; then
    echo ""
    echo "📈 RSR Database (rsr-db):"
    echo "  Host: 127.0.0.1"
    echo "  Port: 5436"
    echo "  Database: retailer_analytics"
    echo "  User: analytics_user"
    echo ""
    echo "  RSR_DATABASE_URL=postgresql://analytics_user:AnalyticsUser2025!@127.0.0.1:5436/retailer_analytics"
    echo ""
    echo "  Logs: tail -f /tmp/cloud_sql_proxy_rsr.log"
fi

echo ""
echo "================================================================"
echo "To stop proxies:"
if [[ "$SHAREVIEW_STARTED" == true ]]; then
    echo "  pkill -f 'cloud_sql_proxy.*tcp:5437'  # Stop shareview-db"
fi
if [[ "$RSR_STARTED" == true ]]; then
    echo "  pkill -f 'cloud_sql_proxy.*tcp:5436'  # Stop rsr-db"
fi
if [[ "$SHAREVIEW_STARTED" == true ]] && [[ "$RSR_STARTED" == true ]]; then
    echo "  pkill -f 'cloud_sql_proxy'            # Stop all"
fi
echo "================================================================"
