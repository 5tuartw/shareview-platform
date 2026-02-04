#!/bin/bash
# Verification script for ShareView Platform foundation

set -e

echo "=========================================="
echo "ShareView Platform Foundation Verification"
echo "=========================================="
echo ""

PROJECT_DIR="/home/stuart/workspace/github.com/5tuartw/shareview-platform"

# Check if we're in the right directory
if [ ! -d "$PROJECT_DIR" ]; then
    echo "❌ Project directory not found: $PROJECT_DIR"
    exit 1
fi

cd "$PROJECT_DIR"
echo "✓ Project directory found"
echo ""

# Check critical files exist
echo "Checking critical files..."
REQUIRED_FILES=(
    "package.json"
    "next.config.ts"
    "tsconfig.json"
    "tailwind.config.ts"
    "Dockerfile"
    "cloudbuild.yaml"
    "deploy.sh"
    ".env.example"
    ".gitignore"
    "lib/db.ts"
    "types/index.ts"
    "app/layout.tsx"
    "app/page.tsx"
    "app/globals.css"
)

for file in "${REQUIRED_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "✓ $file"
    else
        echo "❌ Missing: $file"
        exit 1
    fi
done

echo ""
echo "Checking directory structure..."
REQUIRED_DIRS=(
    "app/(auth)"
    "app/(sales)"
    "app/(client)"
    "app/api"
    "lib"
    "components/auth"
    "components/dashboard"
    "components/client"
    "components/shared"
    "types"
    "public"
)

for dir in "${REQUIRED_DIRS[@]}"; do
    if [ -d "$dir" ]; then
        echo "✓ $dir/"
    else
        echo "❌ Missing: $dir/"
        exit 1
    fi
done

echo ""
echo "Checking file permissions..."
if [ -x "deploy.sh" ]; then
    echo "✓ deploy.sh is executable"
else
    echo "❌ deploy.sh is not executable"
    exit 1
fi

echo ""
echo "=========================================="
echo "✓ All foundation files verified!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. cd $PROJECT_DIR"
echo "2. npm install"
echo "3. cp .env.example .env.local"
echo "4. Edit .env.local with actual credentials"
echo "5. npm run db:test"
echo "6. npm run dev"
echo ""
echo "For deployment:"
echo "./deploy.sh PROJECT_ID REGION"
echo ""
