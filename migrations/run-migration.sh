#!/bin/bash
# Migration Runner Script for ShareView Platform
# Usage: ./migrations/run-migration.sh [--up|--down] [VERSION]
# Example: ./migrations/run-migration.sh --up 20260202000000

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
DIRECTION=""
VERSION=""
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Function to print colored output
print_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --up)
            DIRECTION="up"
            shift
            ;;
        --down)
            DIRECTION="down"
            shift
            ;;
        *)
            VERSION=$1
            shift
            ;;
    esac
done

# Validate inputs
if [[ -z "$DIRECTION" ]]; then
    print_error "Direction not specified. Use --up or --down"
    echo "Usage: $0 [--up|--down] [VERSION]"
    exit 1
fi

if [[ -z "$VERSION" ]]; then
    print_error "Migration version not specified"
    echo "Usage: $0 [--up|--down] [VERSION]"
    exit 1
fi

# Check for DATABASE_URL environment variable
if [[ -z "$DATABASE_URL" ]]; then
    print_error "DATABASE_URL environment variable not set"
    echo "Example: export DATABASE_URL='postgresql://user:password@host:5432/dbname'"
    exit 1
fi

# Construct migration file path
MIGRATION_FILE="${SCRIPT_DIR}/${VERSION}_*_${DIRECTION}.sql"
MIGRATION_FILES=(${MIGRATION_FILE})

if [[ ! -f "${MIGRATION_FILES[0]}" ]]; then
    print_error "Migration file not found: ${MIGRATION_FILE}"
    echo "Available migrations in ${SCRIPT_DIR}:"
    ls -1 "${SCRIPT_DIR}"/*.sql 2>/dev/null || echo "  (none)"
    exit 1
fi

MIGRATION_PATH="${MIGRATION_FILES[0]}"

# Display migration info
print_info "=========================================="
print_info "ShareView Platform Migration Runner"
print_info "=========================================="
print_info "Direction: ${DIRECTION}"
print_info "Version: ${VERSION}"
print_info "File: $(basename ${MIGRATION_PATH})"
print_info "Time: $(date '+%Y-%m-%d %H:%M:%S')"
print_info "=========================================="

# Confirmation prompt for down migrations
if [[ "$DIRECTION" == "down" ]]; then
    print_warning "You are about to ROLLBACK migration ${VERSION}"
    read -p "Are you sure? (yes/no): " CONFIRM
    if [[ "$CONFIRM" != "yes" ]]; then
        print_info "Migration rollback cancelled"
        exit 0
    fi
fi

# Execute migration
print_info "Executing migration..."
if psql "${DATABASE_URL}" -f "${MIGRATION_PATH}"; then
    print_info "✓ Migration executed successfully"
    exit 0
else
    print_error "✗ Migration failed"
    exit 1
fi
