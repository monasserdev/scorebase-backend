#!/bin/bash
set -e

echo "Packaging Lambda function..."

# Clean previous package
rm -rf lambda-package
mkdir -p lambda-package

# Copy compiled code
echo "Copying compiled code..."
cp -r dist/* lambda-package/

# Copy package.json and install production dependencies
echo "Installing production dependencies..."
cp package.json lambda-package/
cp package-lock.json lambda-package/
cd lambda-package
npm ci --production --ignore-scripts > /dev/null 2>&1

cd ..

echo "Lambda package created in lambda-package/"
echo "Package size:"
du -sh lambda-package
