#!/bin/bash
set -e

# ShareView Platform Deployment Script
# Deploys the Next.js application to Google Cloud Run

# Configuration
PROJECT_ID="${1:-retailer-sales-rpt}"
REGION="${2:-europe-west2}"
SERVICE_NAME="shareview-platform"

echo "=========================================="
echo "ShareView Platform Deployment"
echo "=========================================="
echo "Project ID: $PROJECT_ID"
echo "Region: $REGION"
echo "Service Name: $SERVICE_NAME"
echo "=========================================="

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "Error: gcloud CLI is not installed"
    exit 1
fi

# Set the active project
echo "Setting active project..."
gcloud config set project "$PROJECT_ID"

# Enable required APIs
echo "Enabling required APIs..."
gcloud services enable \
    cloudbuild.googleapis.com \
    run.googleapis.com \
    containerregistry.googleapis.com \
    secretmanager.googleapis.com \
    --project="$PROJECT_ID"

# Check if secrets exist (optional - user should create these manually)
echo "Checking for required secrets..."
REQUIRED_SECRETS=("NEXTAUTH_SECRET" "NEXTAUTH_URL" "SV_DBUSER" "SV_DBPASSWORD" "RSR_DBUSER" "RSR_DBPASSWORD")
for secret in "${REQUIRED_SECRETS[@]}"; do
    if ! gcloud secrets describe "$secret" --project="$PROJECT_ID" &> /dev/null; then
        echo "Warning: Secret '$secret' not found in Secret Manager"
        echo "Please create it with: gcloud secrets create $secret --replication-policy=automatic"
        echo "And add a version with: echo -n 'your-secret-value' | gcloud secrets versions add $secret --data-file=-"
    else
        echo "✓ Secret '$secret' exists"
    fi
done

# Submit build to Cloud Build
echo "Submitting build to Cloud Build..."
SHORT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "manual")
gcloud builds submit \
    --config=cloudbuild.yaml \
    --region="$REGION" \
    --project="$PROJECT_ID" \
    --substitutions="SHORT_SHA=${SHORT_SHA}"

# Get the service URL
echo "Retrieving service URL..."
SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" \
    --region="$REGION" \
    --project="$PROJECT_ID" \
    --format='value(status.url)')

echo "=========================================="
echo "Deployment Complete!"
echo "=========================================="
echo "Service URL: $SERVICE_URL"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Update NEXTAUTH_URL secret if this is the first deployment"
echo "2. Visit the service URL to verify deployment"
echo "3. Check logs with: gcloud logging read \"resource.type=cloud_run_revision AND resource.labels.service_name=$SERVICE_NAME\" --limit=50"
