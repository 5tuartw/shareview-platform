# Source Database Connection Modes

## Overview

The snapshot generator supports two connection modes for the source database (acc_mgmt):

1. **Direct** - Connect directly to the remote database (production)
2. **Tunnel** - Connect via SSH tunnel to localhost (local development)

## Configuration

Set the connection mode in `.env.local`:

```bash
# Choose connection mode: 'direct' or 'tunnel'
SOURCE_DB_MODE=tunnel
```

### Tunnel Mode (Local Development - Default)

Used when running locally with SSH tunnel via `scripts/connect_shareview_datasource_tunnel.sh`

```bash
SOURCE_DB_MODE=tunnel
SOURCE_DB_TUNNEL_HOST=127.0.0.1
SOURCE_DB_TUNNEL_PORT=18007
```

**How to use:**
1. Start SSH tunnel: `./scripts/connect_shareview_datasource_tunnel.sh`
2. Verify tunnel: Port 18007 should be listening
3. Run generator: `npm run snapshots:generate`

### Direct Mode (Production/Remote)

Used when connecting directly to the remote database server:

```bash
SOURCE_DB_MODE=direct
SOURCE_DB_DIRECT_HOST=10.2.0.2
SOURCE_DB_DIRECT_PORT=8007
```

**How to use:**
1. Ensure network access to 10.2.0.2:8007
2. Set `SOURCE_DB_MODE=direct` in `.env.local`
3. Run generator: `npm run snapshots:generate`

## Shared Credentials

These are the same for both modes:

```bash
SOURCE_DB_NAME=acc_mgmt
SOURCE_DB_USER=postgres
SOURCE_DB_PASS='9xJ56\4:9BnL?A'
```

## Verification

The snapshot generator will display the active connection at startup:

```
========================================
Snapshot Generator
========================================
Mode: LIVE
Source DB: tunnel (127.0.0.1:18007)
========================================
```

## ShareView Database Connection

The target database (shareview-db) always connects via Cloud SQL Proxy:

```bash
# Cloud SQL Proxy must be running:
./start_cloud_sql_proxy.sh shareview

# Connection details (automatic):
SV_DBUSER=sv_user
SV_DBPASSWORD=ShareView2026!
SV_DBNAME=shareview
# Connects to: 127.0.0.1:5437
```

The generator supports both naming conventions:
- `SV_DB_*` (new style)
- `SV_DB*` (existing style)

## Switching Between Modes

### Switch to Tunnel Mode
```bash
# In .env.local
SOURCE_DB_MODE=tunnel

# Start tunnel
./scripts/connect_shareview_datasource_tunnel.sh

# Run generator
npm run snapshots:generate
```

### Switch to Direct Mode
```bash
# In .env.local
SOURCE_DB_MODE=direct

# Run generator (no tunnel needed)
npm run snapshots:generate
```

## Troubleshooting

### "Connection refused" error in Tunnel Mode
- Check tunnel is running: `lsof -i :18007`
- Restart tunnel: `./scripts/connect_shareview_datasource_tunnel.sh`

### "Connection timeout" error in Direct Mode
- Verify network access to 10.2.0.2:8007
- Check firewall rules
- Try tunnel mode instead

### "Password authentication failed"
- Check `SOURCE_DB_PASS` value in `.env.local`
- Ensure single quotes preserve backslash: `'9xJ56\4:9BnL?A'`

## Best Practices

1. **Local Development**: Use tunnel mode (default)
   - More secure (no direct database exposure)
   - Works from any network
   - Easier debugging

2. **Production/CI**: Use direct mode
   - Faster (no SSH overhead)
   - More reliable (fewer moving parts)
   - Set via environment variable: `SOURCE_DB_MODE=direct`

3. **Never commit** credentials to git
   - `.env.local` is in `.gitignore`
   - Use environment variables in CI/CD
   - Rotate credentials regularly
