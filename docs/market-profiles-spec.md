# Market Profiles Workflow (Admin)

## Scope
This page is available to `SALES_TEAM` and `CSS_ADMIN` users under:
- Header item: `Market Profiles`
- Route: `/dashboard/market-profiles`

## Header Indicator Rules
- Show red badge when one or more retailers are `unassigned`.
- Show amber badge when one or more retailers are `pending_confirmation`.
- If both states exist, show both badges.
- Show no badge when all retailers are `confirmed`.

## Data Model
Retailer profile state is stored on `retailers`:
- `profile_status`: `unassigned` | `pending_confirmation` | `confirmed`
- `profile_assignment_mode`: `manual` | `ai`
- `profile_domains` (JSONB): per-domain values + assignment source
- `profile_last_ai_at`, `profile_confirmed_at`, `profile_updated_at`

## Page UX
### 1. Unassigned table
- Lists all retailers with `profile_status = unassigned`.
- Each row supports mode toggle:
  - `Manual`: shows multi-select domain editors (existing options + free text values).
  - `AI`: row is queued for bulk AI assignment.
- When at least one row is queued for AI, show button: `Assigning using AI`.
- Manual rows can be confirmed directly with tick icon.

### 2. Assigned table
- Shows `pending_confirmation` first, then `confirmed`.
- Domain values display source icon per domain:
  - Hand icon = manual assignment
  - Sparkles icon = AI assignment
- `pending_confirmation`: editable with tick confirm action.
- `confirmed`: edit icon unlocks fields, then tick confirms updated values.

## API Endpoints
- `GET /api/admin/market-profiles/status`
- `GET /api/admin/market-profiles`
- `POST /api/admin/market-profiles/assign-ai`
- `PATCH /api/admin/market-profiles/{retailerId}`

## Notes / Follow-on Enhancements
- AI prompt now supports a comprehensive taxonomy output and maps to internal domains.
- Per-retailer assignment expects a single JSON object (one retailer per response), not an array.
- Field mapping used by parser:
  - `format` -> `retailer_format`
  - `category[].name` (primary first) -> `primary_category`
  - `segment` -> `target_audience`
  - `price_tier` -> `price_positioning`
  - `brand_positioning` -> `business_model`
  - `region_focus` defaults to `UK and EU` if omitted
- Add assignment audit trail (who changed what and when) if reviewer accountability is required.
