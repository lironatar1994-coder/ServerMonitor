#!/bin/bash

# ==============================================================================
# Server Monitor Production Deployment Script (Server-Side)
# ==============================================================================

set -e

APP_NAME="server-monitor"
BACKEND_PORT=4010
FRONTEND_DIR="frontend"
BACKEND_DIR="backend"

echo "[INFO] Starting Deployment..."

# 1. Git Sync
echo "[INFO] Pulling latest code..."
git fetch origin main
git reset --hard origin/main

# 2. Frontend Setup
echo "[INFO] Processing Frontend..."
cd "$FRONTEND_DIR"
npm install -s
npm run build
cd ..

# 3. Backend Setup
echo "[INFO] Processing Backend..."
cd "$BACKEND_DIR"
npm install -s
# Rebuild sqlite3 for Linux environment just in case
npm rebuild better-sqlite3
cd ..

# 4. PM2 Start
echo "[INFO] Starting PM2 process..."
# We serve the frontend via Nginx or we can use the backend to serve it
# In our architecture, we can just run the backend.
pm2 start "backend/server.js" --name "$APP_NAME" --cwd "$(pwd)" --update-env || pm2 restart "$APP_NAME"
pm2 save > /dev/null

echo "[SUCCESS] DEPLOYMENT COMPLETE"
