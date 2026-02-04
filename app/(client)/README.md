# Client Portal Routes

This directory contains routes for the retailer-facing client portal.

## Planned Routes

- `/client` - Client dashboard home (overview)
- `/client/keywords` - Keyword performance analytics
- `/client/categories` - Category-level breakdown
- `/client/products` - Product performance
- `/client/coverage` - Product coverage distribution
- `/client/auction` - Auction insights and competitors

## Access Control

- Restricted to users with `CLIENT_VIEWER` or `CLIENT_ADMIN` roles
- Users can only view data for their assigned retailer
- Middleware enforces row-level security

## Features

- Performance metrics with date range selection
- Interactive charts and visualizations
- Export functionality
- Customizable views based on retailer configuration

## Data Filtering

Client views are filtered based on:
- `retailer_config.visible_tabs` - Which pages are accessible
- `retailer_config.visible_metrics` - Which metrics are displayed
- `retailer_config.keyword_filters` - Keyword include/exclude patterns

## Future Implementation

See Phase 4 of the technical specification for detailed client portal implementation.
