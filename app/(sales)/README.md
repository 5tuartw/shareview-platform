# Sales Team Routes

This directory contains routes for the internal sales team dashboard.

## Planned Routes

- `/sales` - Sales team dashboard home
- `/sales/clients` - Client list and management
- `/sales/clients/[id]` - Individual client details
- `/sales/performance` - Performance overview across all clients
- `/sales/reports` - Custom reports and exports

## Access Control

- Restricted to users with `SALES_TEAM` or `CSS_ADMIN` roles
- Middleware enforces authentication and authorization

## Features

- View all client accounts
- Monitor performance metrics
- Manage client configurations
- Generate reports
- Track commission and revenue

## Future Implementation

See Phase 5 of the technical specification for detailed sales dashboard implementation.
