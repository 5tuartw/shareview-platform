# ShareView Platform

Multi-tenant analytics platform for CSS retailers and sales teams, built with Next.js 16, React 19, and PostgreSQL.

## Overview

ShareView Platform is a comprehensive analytics solution that provides:

- **Client Portal**: Retailer-facing dashboard for performance analytics
- **Sales Dashboard**: Internal tools for sales teams to manage client relationships
- **CSS Admin Portal**: Administrative interface for platform management

This repository contains the foundational infrastructure for the platform, implementing authentication, database connectivity, and deployment configuration.

## Technology Stack

- **Frontend**: Next.js 16.1.1, React 19.2.3, TypeScript 5
- **Authentication**: NextAuth.js v5
- **Database**: PostgreSQL with node-postgres (pg)
- **Styling**: Tailwind CSS 4
- **Charts**: Recharts 3.6
- **Deployment**: Google Cloud Run with Docker
- **CI/CD**: Google Cloud Build

## Prerequisites

- Node.js 20 or higher
- PostgreSQL database
- Docker (for containerized deployment)
- Google Cloud SDK (for Cloud Run deployment)

## Local Development Setup

### 1. Clone Repository

```bash
git clone <repository-url>
cd shareview-platform
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create `.env.local` file in the root directory:

```bash
cp .env.example .env.local
```

Edit `.env.local` and set the following variables:

```env
# Database connection string
DATABASE_URL=postgresql://analytics_user:AnalyticsUser2025!@127.0.0.1:5436/retailer_analytics

# NextAuth.js secret (generate with: openssl rand -base64 32)
NEXTAUTH_SECRET=your-generated-secret-here

# Application URL
NEXTAUTH_URL=http://localhost:3000
```

### 4. Test Database Connection

```bash
npm run db:test
```

This should output the current database time and version.

### 5. Run Development Server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to view the application.

## Project Structure

```
shareview-platform/
├── app/                      # Next.js App Router
│   ├── (auth)/              # Authentication routes (login, logout)
│   ├── (sales)/             # Sales team dashboard routes
│   ├── (client)/            # Client portal routes
│   ├── api/                 # API routes
│   ├── layout.tsx           # Root layout
│   ├── page.tsx             # Landing page
│   └── globals.css          # Global styles
├── lib/                     # Utility libraries
│   └── db.ts                # Database connection pool
├── components/              # React components
│   ├── auth/               # Authentication components
│   ├── dashboard/          # Dashboard components
│   ├── client/             # Client portal components
│   └── shared/             # Shared/reusable components
├── types/                   # TypeScript type definitions
│   └── index.ts            # Exported types
├── public/                  # Static assets
├── Dockerfile              # Multi-stage Docker build
├── cloudbuild.yaml         # Google Cloud Build configuration
└── deploy.sh               # Deployment automation script
```

## Database Connection

The platform uses node-postgres (`pg`) for PostgreSQL connectivity:

- **Connection Pool**: Configured in `lib/db.ts`
- **Pool Size**: 20 connections (configurable)
- **Timeouts**: 30s idle, 2s connection
- **SSL**: Enabled in production

### Available Database Functions

```typescript
import { query, transaction, testConnection } from '@/lib/db';

// Execute a parameterized query
const result = await query('SELECT * FROM users WHERE email = $1', [email]);

// Execute a transaction
await transaction(async (client) => {
  await client.query('INSERT INTO users ...');
  await client.query('INSERT INTO sessions ...');
});

// Test connection
await testConnection();
```

## Docker Build and Run

### Build Docker Image

```bash
docker build -t shareview-platform \
  --build-arg DATABASE_URL="$DATABASE_URL" \
  --build-arg NEXTAUTH_SECRET="$NEXTAUTH_SECRET" \
  --build-arg NEXTAUTH_URL="$NEXTAUTH_URL" \
  .
```

### Run Docker Container

```bash
docker run -p 3000:3000 \
  --env-file .env.local \
  shareview-platform
```

Visit [http://localhost:3000](http://localhost:3000) to access the containerized application.

## Deployment to Google Cloud Run

### Prerequisites

1. **Google Cloud Project** with billing enabled
2. **Required APIs enabled**:
   - Cloud Run API
   - Cloud Build API
   - Container Registry API
   - Secret Manager API

3. **Secrets configured** in Secret Manager:
   - `DATABASE_URL`
   - `NEXTAUTH_SECRET`
   - `NEXTAUTH_URL`

### Create Secrets

```bash
# Create secrets
gcloud secrets create DATABASE_URL --replication-policy=automatic
gcloud secrets create NEXTAUTH_SECRET --replication-policy=automatic
gcloud secrets create NEXTAUTH_URL --replication-policy=automatic

# Add secret values
echo -n 'postgresql://user:pass@host:port/db' | gcloud secrets versions add DATABASE_URL --data-file=-
echo -n 'your-secret-key' | gcloud secrets versions add NEXTAUTH_SECRET --data-file=-
echo -n 'https://your-service-url.run.app' | gcloud secrets versions add NEXTAUTH_URL --data-file=-
```

### Deploy

```bash
chmod +x deploy.sh
./deploy.sh PROJECT_ID REGION
```

Example:

```bash
./deploy.sh log-monitor-1762525675 europe-west2
```

The script will:
1. Enable required APIs
2. Build Docker image with Cloud Build
3. Deploy to Cloud Run
4. Output the service URL

### Manual Deployment

```bash
gcloud builds submit --config=cloudbuild.yaml --region=europe-west2
```

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build production bundle
- `npm start` - Start production server (after build)
- `npm run lint` - Run ESLint
- `npm run type-check` - Run TypeScript type checking
- `npm run db:test` - Test database connection

## Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string | Yes | - |
| `NEXTAUTH_SECRET` | NextAuth.js JWT signing secret | Yes | - |
| `NEXTAUTH_URL` | Application base URL | Yes | - |
| `NODE_ENV` | Node environment | No | `development` |
| `CLOUD_SQL_CONNECTION_NAME` | Cloud SQL instance connection | Production | - |

## Development Workflow

1. **Create feature branch**: `git checkout -b feature/your-feature`
2. **Make changes**: Edit code, add components, update types
3. **Test locally**: `npm run dev` and verify functionality
4. **Type check**: `npm run type-check`
5. **Lint code**: `npm run lint`
6. **Commit changes**: `git commit -m "feat: your feature description"`
7. **Push branch**: `git push origin feature/your-feature`
8. **Create PR**: Open pull request for review

## Next Steps

This foundation provides the base infrastructure. Subsequent implementation phases will add:

### Phase 2: Authentication System
- NextAuth.js configuration
- Login/logout pages
- Role-based access control
- Session management

### Phase 3: API Layer
- Retailer data endpoints
- Performance metrics APIs
- User management APIs
- Authentication middleware

### Phase 4: Client Portal UI
- Overview dashboard
- Keywords analytics
- Categories breakdown
- Products performance
- Coverage insights
- Auction competitors

### Phase 5: Sales Dashboard
- Client management
- Performance monitoring
- Commission tracking
- Account notes

## License

Proprietary - Shareight Limited

## Support

For issues or questions, contact the development team.
