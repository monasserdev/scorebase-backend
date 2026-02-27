#!/bin/bash
set -e

echo "🚀 Running database migrations via Lambda..."
echo ""

# Build the migration script
echo "Building migration script..."
npm run build

# Create a temporary Lambda package with just the migration script
echo "Packaging migration runner..."
rm -rf migration-package
mkdir -p migration-package

# Copy compiled migration script
cp -r dist/scripts migration-package/
cp -r dist/config migration-package/
cp -r dist/utils migration-package/
cp -r dist/models migration-package/

# Copy node_modules
echo "Copying dependencies..."
cp -r lambda-package/node_modules migration-package/
cp lambda-package/package.json migration-package/

# Create Lambda function payload
cat > migration-package/index.js << 'EOF'
const { handler } = require('./scripts/run-migrations');
exports.handler = handler;
EOF

# Zip it up
cd migration-package
zip -r ../migration-runner.zip . > /dev/null
cd ..

echo "✓ Package created"
echo ""

# Invoke the main Lambda function with the migration script
echo "Invoking Lambda to run migrations..."
aws lambda invoke \
  --function-name scorebase-api \
  --payload '{"action":"run-migrations"}' \
  --region us-east-1 \
  migration-response.json > /dev/null

echo ""
echo "📋 Migration Result:"
cat migration-response.json | jq .
echo ""

# Cleanup
rm -rf migration-package migration-runner.zip migration-response.json

echo "✅ Done!"
