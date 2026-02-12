# Client Portal Testing Checklist

## Access and Routing
- Log in as a client user and confirm the portal loads at `/retailer/{retailerId}`.
- Log in as a user without access and confirm the access denied state appears.
- Confirm unauthenticated users are redirected to `/login`.
- Confirm the `from` query parameter is set on the redirect when accessing a protected route directly.

## Configuration-driven Tabs
- Verify the primary tab list matches `retailer_config.visible_tabs`.
- Toggle `features_enabled.market_insights` and confirm Market Insights sub-tabs appear or hide.
- Toggle `features_enabled.competitor_comparison` and confirm Competitor Comparison sub-tabs appear or hide.

## Overview
- Switch between 13 weeks and 13 months and confirm charts update.
- Verify GMV, commission, conversions, impressions, and profit charts render without errors.

## Keywords
- Confirm the Summary, Performance, Word Analysis, and Market Insights sub-tabs render.
- Validate keyword filters from `retailer_config.keyword_filters` exclude matching terms.

## Categories
- Confirm performance table loads and sorting/filtering works.
- Validate competitor comparison tab renders and dropdown filters by category.
- Confirm Market Insights content renders.

## Products
- Confirm performance tables load and filters work for Star/Good.
- Open competitor comparison and expand a retailer to load performance tables.
- Confirm Market Insights content renders.

## Auctions
- Confirm auction insights and competitor table render.
- Switch date range (7/30/90) and confirm data refreshes.

## Coverage
- Confirm the coverage placeholder renders without errors.
