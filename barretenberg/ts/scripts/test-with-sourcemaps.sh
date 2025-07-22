#!/bin/bash
# Script to run tests with proper source map support

# Enable source maps in Node.js
export NODE_OPTIONS="--enable-source-maps"

# Install source-map-support if not already installed
if ! npm list source-map-support >/dev/null 2>&1; then
    echo "Installing source-map-support..."
    npm install --no-save source-map-support
fi

# Run the test with ts-node and source map support
NODE_OPTIONS="--loader ts-node/esm --enable-source-maps" \
NODE_NO_WARNINGS=1 \
ts-node -r source-map-support/register \
    --transpile-only \
    "$@"