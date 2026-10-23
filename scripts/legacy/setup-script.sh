#!/bin/bash
# ============================================
# Dispatch HQ — Phase 1 Setup Script
# Run this to scaffold the entire project
# ============================================

set -e

PROJECT_DIR="/Users/deandrewharris/Games Projects/dispatch-hq"
mkdir -p "$PROJECT_DIR"
cd "$PROJECT_DIR"

echo "🚒 Setting up Dispatch HQ..."
echo ""

# ---- Root Config ----
echo "📦 Creating root config..."

# ---- Install Dependencies ----
echo "📦 Installing dependencies..."
pnpm install

echo ""
echo "✅ Setup complete!"
echo ""
echo "To start development:"
echo "  cd dispatch-hq"
echo "  pnpm dev"
