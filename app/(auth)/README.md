# Authentication Routes

This directory contains authentication-related routes using Next.js App Router.

## Planned Routes

- `/login` - User login page
- `/logout` - User logout handler
- `/register` - User registration (admin-only)

## Implementation Notes

- Uses NextAuth.js v5 for authentication
- Supports multiple user roles (CLIENT_VIEWER, CLIENT_ADMIN, SALES_TEAM, CSS_ADMIN)
- Session management with JWT
- Password hashing with bcrypt

## Future Implementation

See Phase 2 of the technical specification for detailed authentication system implementation.
