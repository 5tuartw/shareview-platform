# Domain Metrics Generator

## Purpose

This service generates **algorithmic domain metrics** from monthly snapshot tables. These metrics power UI components such as page headlines, metric cards, quick stats, and contextual info panels. It is **not** an AI system and does not generate narratives beyond rule-based templates.

## Two-Phase Architecture

1. **Phase 1: Snapshot Aggregation**
   - Aggregates raw data into snapshot tables (keywords, categories, products, auctions, coverage).
2. **Phase 2a: Domain Metrics Generator (this service)**
   - Reads snapshots and applies threshold rules.
   - Produces component-level JSONB metrics in `domain_metrics`.
3. **Phase 2b: AI Insights (future)**
   - Will add narrative insights on top of algorithmic metrics.

## Component Types

The generator writes four component types to `domain_metrics`:

- `page_headline`: status, message, subtitle
- `metric_card`: grid of KPI cards
- `quick_stats`: inline stat bar
- `contextual_info`: structured info panel

Each component is stored as `component_data` JSONB and auto-published (`is_active = true`).

## Supported Domains

- Overview
- Keywords
- Categories
- Products
- Auctions
- Coverage

Each domain has its own calculator with threshold rules and component outputs.

## Threshold Rules (Summary)

### Overview
- **Success**: GMV growth > 10% AND ROI > 5%
- **Warning**: GMV growth > 0% OR ROI > 0%
- **Critical**: GMV growth ≤ 0% AND ROI ≤ 0%

### Keywords
- **Success**: > 60% star/strong
- **Warning**: 40-60% star/strong
- **Critical**: < 40% star/strong

### Categories
- **Success**: > 70% healthy/star
- **Warning**: 50-70% healthy/star
- **Critical**: < 50% healthy/star

### Products
- **Success**: > 50% star/good
- **Warning**: 30-50% star/good
- **Critical**: < 30% star/good

### Auctions
- **Success**: impression share > 50% AND overlap > 60%
- **Warning**: impression share > 30% OR overlap > 40%
- **Critical**: impression share ≤ 30%

### Coverage
- **Success**: coverage > 80%
- **Warning**: coverage 60-80%
- **Critical**: coverage < 60%

## Running the Service

```bash
# Dry run
npm run metrics:dry-run

# Generate all metrics
npm run metrics:generate

# Specific retailer
npm run metrics:generate -- --retailer=boots

# Specific month
npm run metrics:generate -- --month=2026-01
```

## Scheduling

Run daily after snapshot aggregation (suggested 5am):

```bash
0 5 * * * cd /path/to/shareview-platform && npm run metrics:generate
```

## Component Data Examples

### Page Headline
```json
{
  "status": "success",
  "message": "GMV up 12.5% in November 2025",
  "subtitle": "ROI: 6.2%, 12,543 total keywords"
}
```

### Metric Cards
```json
{
  "cards": [
    { "label": "Total Keywords", "value": "12,543", "change": 8.2, "status": "success" },
    { "label": "High Performers", "value": "3,421", "change": 12.1, "status": "success" },
    { "label": "Avg CVR", "value": "3.8%", "change": 0.4, "status": "success" },
    { "label": "Total Impressions", "value": "1.2M", "change": 15.3, "status": "success" }
  ]
}
```

### Quick Stats
```json
{
  "items": [
    { "label": "Star Tier", "value": "1,234", "color": "#10b981" },
    { "label": "Strong Tier", "value": "2,187", "color": "#10b981" },
    { "label": "Underperforming", "value": "543", "color": "#f59e0b" },
    { "label": "Poor", "value": "321", "color": "#ef4444" }
  ]
}
```

### Contextual Info Panel
```json
{
  "title": "Categories Needing Attention",
  "style": "warning",
  "items": [
    { "label": "Beauty > Skincare", "text": "CVR dropped 2.1% vs last month, 234 products affected" },
    { "label": "Health > Vitamins", "text": "Zero visibility on 45 products, review product feed" },
    { "label": "Fragrance > Men", "text": "High click waste (18%), optimise product titles" }
  ]
}
```

## Troubleshooting

- **No metrics generated**: Check `snapshot_enabled` in `retailer_metadata`.
- **Missing periods**: Ensure snapshots exist for the month in `keywords_snapshots`.
- **Stale metrics**: The generator only updates when snapshot `last_updated` is newer.
- **Database errors**: Verify ShareView DB credentials in `.env.local`.
