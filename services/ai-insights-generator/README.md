# AI Insights Generator

## Purpose

This service generates placeholder AI insights for the ShareView Platform. It reads classified snapshot data and writes structured insights into the `ai_insights` table with `status='pending'` and `is_active=false` so staff can review and approve insights before they appear in the client portal.

For the two-week demo, the service uses template-based placeholders instead of actual LLM calls. This keeps the output deterministic and fast while preserving the approval workflow and data model.

## Usage

Run for all enabled retailers:
```bash
npm run insights:generate
```

Run for a specific retailer:
```bash
npm run insights:generate -- --retailer=boots
```

Run for a specific month (YYYY-MM):
```bash
npm run insights:generate -- --month=2026-01
```

Dry-run mode (no database writes):
```bash
npm run insights:dry-run
```

## Output

- Inserts `ai_insights` records with `status='pending'` and `is_active=false`.
- Tracks each run in `insights_generation_jobs`.
- Logs which periods were processed and what was generated.

## Placeholder Logic

The insights are built from snapshot metrics using template logic. This is a temporary stand-in for LLM output. The placeholder can be replaced post-demo by wiring the generator to GPT-4 or Claude.

## Future LLM Integration

LLM stubs live in `services/ai-insights-generator/llm/`. Replace the placeholder generator with a model client and update the `model_name`, `model_version`, and `prompt_hash` fields as part of the insert payload.
