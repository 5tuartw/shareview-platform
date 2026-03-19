# Demo Auction Outranking Validation and Seeding

## Purpose
This ticket requires that demo retailers have usable `outranking_share` values for:
- `2025-12-01`
- `2026-01-01`
- `2026-02-01`

If coverage is missing (all zero/null), the script seeds plausible values so the Auctions UI `You Outrank` quick stat and table column show real percentages rather than placeholder `-` values.

## Script
- `scripts/seed_demo_auction_outranking.ts`

## What It Checks
For each `retailers.is_demo = true` retailer and target month, it checks `auction_insights` competitors (`preferred_for_display = true`, `is_self = false`) for:
- row count
- average outranking
- zero/null count

It seeds only when rows exist and outranking coverage is absent (average is 0 or every row is zero/null).

## What It Updates (Execute Mode)
1. `auction_insights`
- Sets `outranking_share` for competitor rows using a deterministic 0.20-0.60 spread.

2. `auction_insights_snapshots` (month snapshots for same retailer/month)
- `avg_outranking_share`
- `top_competitor_outranking_you`
- `biggest_threat_outranking_you`
- `best_opportunity_you_outranking`
- `competitors` JSONB array `outranking_share` fields

This keeps snapshot fallback paths aligned with live auction rows used by:
- `app/api/retailers/[id]/auctions/route.ts`
- `app/api/retailers/[id]/auctions/overview/route.ts`

## Runbook
From repo root:

Dry run (default):
```bash
tsx scripts/seed_demo_auction_outranking.ts
```

Apply changes:
```bash
tsx scripts/seed_demo_auction_outranking.ts --execute
```

## Notes
- Script is transaction-protected in execute mode.
- If no seed is required for a retailer/month, no data is changed.
- Requires Shareview DB env vars in `.env.local` (`SV_DB_HOST`, `SV_DB_PORT`, `SV_DB_USER`, `SV_DB_PASS`, `SV_DB_NAME`).
