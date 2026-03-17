# Domain Classification Rollout Plan

This document captures the follow-on work to extend configurable classification (now implemented for Auctions) to other imported domains.

## Current State (Auctions)

Implemented:
- Global thresholds and retailer-level overrides persisted in DB.
- Admin API to read/update settings, manage overrides, and trigger recalculation.
- Super Admin UI tab for classification settings.
- Import-time classification using current settings/overrides.
- Backfill/recompute support for historical rows.

## Goal

Apply the same operating model to:
- Search Terms (keywords)
- Categories
- Products

Each domain should support:
- Global classification thresholds
- Retailer-level override thresholds
- Explicit recalculation workflow
- Admin UI controls in Super Admin > Classifications
- Persisted classification values in domain tables/snapshots

## Proposed Architecture

1. Classification Config Schema (per domain)
- `<domain>_classification_settings`
  - global threshold fields
  - updated_by, created_at, updated_at
- `<domain>_classification_overrides`
  - retailer_id
  - nullable threshold override fields
  - is_active, updated_by, created_at, updated_at

2. Shared Server Utilities
- `lib/<domain>-classification-config.ts`
  - fetch global settings
  - fetch override map
  - recalculate persisted classifications

3. API Endpoints (admin)
- `GET/PUT /api/admin/<domain>-classification`
- `POST/DELETE /api/admin/<domain>-classification` (override upsert/deactivate)
- `POST /api/admin/<domain>-classification/recalculate`

4. Super Admin UI
- Add one panel per domain under Classifications tab.
- Keep UX consistent with auctions panel:
  - global thresholds block
  - retailer override block
  - recalc action block

5. Import and Read Paths
- Import route/classifier uses threshold config + override map.
- Read endpoints should return persisted classification directly where possible.
- Fallback logic only for legacy snapshot payloads without persisted class.

## Domain-Specific Design Notes

### Search Terms
Candidate split dimensions:
- CTR high/low threshold
- Conversions high/low threshold

Considerations:
- Ensure thresholds are applied after minimum-impression eligibility filter.
- Preserve existing quadrant semantics and labels where already used in UI.

### Categories
Candidate dimensions:
- Conversion performance (CVR or conversions per click)
- Engagement/traffic (impressions or clicks)

Considerations:
- Category hierarchy can skew volume; define if thresholds compare per-level or flattened set.

### Products
Candidate dimensions:
- CVR high/low threshold
- Conversion volume or click volume high/low threshold

Considerations:
- Products can be sparse; add minimum-data guardrails to avoid noisy classification.

## Data Safety and Rollout

1. Migrations
- Add new tables and indexes.
- Backfill persisted classes for existing rows.

2. Controlled Enablement
- Ship domain config APIs/UI first.
- Enable import-time classification next.
- Run manual recalc in staging before production.

3. Validation Checklist
- API returns expected class labels.
- UI filter counts match DB counts.
- Recalc changes are deterministic for fixed thresholds.
- Retailer override only affects intended retailer data.

## Suggested Implementation Order

1. Keywords classification config + recalc.
2. Products classification config + recalc.
3. Categories classification config + recalc.

Rationale:
- Keywords and products already have clear performance tiers and table filters.
- Categories may need additional alignment on hierarchy-aware thresholding.

## Open Decisions to Revisit

- Should each domain use fixed thresholds or percentile-based defaults?
- Should override scope support time-bounded windows (for example month range)?
- Do we need audit history table for threshold changes (not just updated_at)?
