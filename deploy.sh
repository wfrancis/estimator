#!/bin/bash
set -e

echo "=== Cabinet Estimator Deployment ==="

# Step 1: Set secrets (only needs to be done once or when keys change)
if [ -n "$OPENAI_API_KEY" ]; then
  echo "Setting OPENAI_API_KEY secret..."
  flyctl secrets set OPENAI_API_KEY="$OPENAI_API_KEY" -a cabinet-estimator
else
  echo "Note: OPENAI_API_KEY not set in environment. Set it with:"
  echo "  flyctl secrets set OPENAI_API_KEY=sk-... -a cabinet-estimator"
fi

# Step 2: Deploy
echo "Deploying to Fly.io..."
flyctl deploy --remote-only -a cabinet-estimator

# Step 3: Health check
echo "Checking deployment..."
sleep 5
curl -s https://cabinet-estimator.fly.dev/ | head -c 200
echo ""
echo ""
echo "=== Deployment complete ==="
echo "App URL: https://cabinet-estimator.fly.dev"
