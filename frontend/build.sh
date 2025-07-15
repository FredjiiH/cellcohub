#!/bin/bash
set -e

echo "Installing dependencies..."
npm install

echo "Building with react-scripts..."
CI=false npx react-scripts build

echo "Build completed successfully!" 