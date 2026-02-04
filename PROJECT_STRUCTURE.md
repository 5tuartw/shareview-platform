# ShareView Platform - Project Structure

```
shareview-platform/
│
├── 📱 app/                          # Next.js App Router
│   ├── 🔐 (auth)/                  # Authentication routes
│   │   ├── login/                  # → Phase 2
│   │   ├── logout/                 # → Phase 2
│   │   └── README.md               # ✅ Created
│   │
│   ├── 💼 (sales)/                 # Sales team dashboard
│   │   ├── clients/                # → Phase 5
│   │   ├── performance/            # → Phase 5
│   │   ├── reports/                # → Phase 5
│   │   └── README.md               # ✅ Created
│   │
│   ├── 🏪 (client)/                # Client portal
│   │   ├── keywords/               # → Phase 4
│   │   ├── categories/             # → Phase 4
│   │   ├── products/               # → Phase 4
│   │   ├── coverage/               # → Phase 4
│   │   ├── auction/                # → Phase 4
│   │   └── README.md               # ✅ Created
│   │
│   ├── 🔌 api/                     # API routes
│   │   ├── auth/                   # → Phase 2
│   │   ├── retailer/               # → Phase 3
│   │   ├── sales/                  # → Phase 5
│   │   ├── admin/                  # → Phase 6
│   │   └── README.md               # ✅ Created
│   │
│   ├── layout.tsx                  # ✅ Root layout
│   ├── page.tsx                    # ✅ Landing page
│   └── globals.css                 # ✅ Global styles
│
├── 🧩 components/                   # React components
│   ├── 🔐 auth/                    # Authentication components
│   │   ├── LoginForm.tsx           # → Phase 2
│   │   ├── LogoutButton.tsx        # → Phase 2
│   │   ├── ProtectedRoute.tsx      # → Phase 2
│   │   └── README.md               # ✅ Created
│   │
│   ├── 📊 dashboard/               # Dashboard components
│   │   ├── DashboardLayout.tsx     # → Phase 4/5
│   │   ├── Sidebar.tsx             # → Phase 4/5
│   │   ├── Header.tsx              # → Phase 4/5
│   │   ├── MetricCard.tsx          # → Phase 4/5
│   │   └── README.md               # ✅ Created
│   │
│   ├── 🏪 client/                  # Client portal components
│   │   ├── OverviewContent.tsx     # → Phase 4
│   │   ├── KeywordsContent.tsx     # → Phase 4
│   │   ├── CategoriesContent.tsx   # → Phase 4
│   │   ├── ProductsContent.tsx     # → Phase 4
│   │   ├── CoverageContent.tsx     # → Phase 4
│   │   ├── AuctionContent.tsx      # → Phase 4
│   │   └── README.md               # ✅ Created
│   │
│   └── 🔧 shared/                  # Shared components
│       ├── Button.tsx              # → As needed
│       ├── Card.tsx                # → As needed
│       ├── Table.tsx               # → As needed
│       ├── DateRangePicker.tsx     # → As needed
│       ├── Modal.tsx               # → As needed
│       └── README.md               # ✅ Created
│
├── 📚 lib/                          # Utility libraries
│   ├── db.ts                       # ✅ Database connection
│   ├── auth.ts                     # → Phase 2
│   ├── api-utils.ts                # → Phase 3
│   └── auth-middleware.ts          # → Phase 2
│
├── 📝 types/                        # TypeScript types
│   └── index.ts                    # ✅ Type definitions
│
├── 🖼️ public/                       # Static assets
│   ├── logo.svg                    # → As needed
│   └── favicon.ico                 # → As needed
│
├── 🐳 Docker & Deployment
│   ├── Dockerfile                  # ✅ Multi-stage build
│   ├── .dockerignore               # ✅ Docker ignore
│   ├── cloudbuild.yaml             # ✅ Cloud Build config
│   └── deploy.sh                   # ✅ Deployment script
│
├── ⚙️ Configuration
│   ├── next.config.ts              # ✅ Next.js config
│   ├── tsconfig.json               # ✅ TypeScript config
│   ├── tailwind.config.ts          # ✅ Tailwind config
│   ├── postcss.config.mjs          # ✅ PostCSS config
│   ├── eslint.config.mjs           # ✅ ESLint config
│   ├── package.json                # ✅ Dependencies
│   ├── .env.example                # ✅ Env template
│   ├── .env.local                  # ⚠️ Create this
│   └── .gitignore                  # ✅ Git ignore
│
└── 📖 Documentation
    ├── README.md                   # ✅ Main documentation
    ├── FOUNDATION_SUMMARY.md       # ✅ Implementation summary
    ├── IMPLEMENTATION_PLAN.md      # ✅ Phased roadmap
    ├── QUICKSTART.md               # ✅ Quick start guide
    ├── PROJECT_STRUCTURE.md        # ✅ This file
    └── verify-foundation.sh        # ✅ Verification script
```

## Legend

- ✅ **Created** - File/directory exists and is complete
- → **Future** - Placeholder, to be implemented in later phases
- ⚠️ **Action Required** - User must create/configure

## File Count

- **Configuration files**: 10 ✅
- **Source files**: 4 ✅
- **Docker/deployment files**: 4 ✅
- **Documentation**: 12 ✅
- **Utility scripts**: 1 ✅
- **Total created**: 31 files ✅

## Directory Structure Details

### App Router Organization

Next.js App Router uses file-system based routing:

- **Route Groups** `(name)/`: Organize routes without affecting URL
  - `(auth)` - Authentication pages (login, logout)
  - `(sales)` - Sales team dashboard
  - `(client)` - Client portal

- **API Routes** `api/`: Backend endpoints
  - Handlers: GET, POST, PUT, DELETE, PATCH
  - Uses Next.js route handlers (App Router)

### Component Organization

Components organized by feature area:

- **auth**: Authentication-specific UI
- **dashboard**: Shared dashboard layouts
- **client**: Client portal specific
- **shared**: Reusable across all areas

### Library Organization

Utility functions and configurations:

- **db.ts**: Database connection pool and helpers
- **auth.ts**: Authentication utilities
- **api-utils.ts**: API helper functions
- **auth-middleware.ts**: Route protection

## Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser                              │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                   Next.js App (Port 3000)                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  App Router                                          │  │
│  │  ├── Pages (app/*)                                   │  │
│  │  └── API Routes (app/api/*)                          │  │
│  └────────────────┬─────────────────────────────────────┘  │
└───────────────────┼─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│                   lib/db.ts                                 │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  PostgreSQL Connection Pool                          │  │
│  │  ├── query() - Execute SQL                           │  │
│  │  ├── transaction() - Multi-step operations           │  │
│  │  └── testConnection() - Health check                 │  │
│  └────────────────┬─────────────────────────────────────┘  │
└───────────────────┼─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────┐
│            PostgreSQL Database (Port 5436)                  │
│  ├── users                                                  │
│  ├── sessions                                               │
│  ├── retailer_metrics                                       │
│  ├── keyword_performance                                    │
│  ├── category_performance                                   │
│  ├── product_performance                                    │
│  └── ...                                                    │
└─────────────────────────────────────────────────────────────┘
```

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Developer                                │
│  $ git push origin main                                     │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                  Google Cloud Build                         │
│  1. Build Docker image                                      │
│  2. Push to Container Registry                              │
│  3. Deploy to Cloud Run                                     │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                   Google Cloud Run                          │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Container: shareview-platform                       │  │
│  │  ├── Memory: 1Gi                                     │  │
│  │  ├── CPU: 2                                          │  │
│  │  ├── Timeout: 60s                                    │  │
│  │  └── Max Instances: 10                               │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│               Google Cloud SQL (Optional)                   │
│  PostgreSQL instance: retailer-db                           │
└─────────────────────────────────────────────────────────────┘
```

## Environment Configuration

```
Development:
  DATABASE_URL → localhost:5436 (Cloud SQL proxy)
  NEXTAUTH_URL → http://localhost:3000
  
Production:
  DATABASE_URL → Secret Manager
  NEXTAUTH_URL → https://shareview-platform-*.run.app
  NEXTAUTH_SECRET → Secret Manager
```

## Tech Stack Summary

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, TypeScript |
| Styling | Tailwind CSS 4 |
| Database | PostgreSQL (node-postgres) |
| Auth | NextAuth.js v5 |
| Charts | Recharts |
| Icons | Lucide React |
| Animation | Framer Motion |
| Container | Docker |
| Hosting | Google Cloud Run |
| CI/CD | Google Cloud Build |

## Next Steps

1. ✅ Foundation complete
2. → Install dependencies: `npm install`
3. → Configure environment: `.env.local`
4. → Test connection: `npm run db:test`
5. → Start dev server: `npm run dev`
6. → Initialize git: `git init`
7. → Begin Phase 2: Authentication System

---

**Foundation Status**: ✅ COMPLETE  
**Ready for**: Phase 2: Authentication System
