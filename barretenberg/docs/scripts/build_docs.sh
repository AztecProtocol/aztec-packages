#!/bin/bash

# Script to build Doxygen documentation and copy to Docusaurus static directory

set -e

echo "Building Doxygen documentation..."

# Navigate to the C++ docs directory
cd "$(dirname "$0")/../../cpp/docs"

# Always build fresh documentation in CI
echo "Building Doxygen documentation..."
doxygen Doxyfile

# Debug: check what was created
echo "Checking output structure:"
ls -la
if [ -d "docs" ]; then
  echo "docs/ directory contents:"
  ls -la docs/
  if [ -d "docs/build" ]; then
    echo "docs/build/ directory exists"
    ls -la docs/build/
  fi
fi

echo "Copying Doxygen HTML to Docusaurus static directory..."

# Create the static/api directory if it doesn't exist
mkdir -p "../../docs/static/api"

# Copy the built documentation from the correct path
if [ -d "docs/build" ]; then
  rsync -av --delete docs/build/ ../../docs/static/api/
else
  echo "Error: docs/build directory not found!"
  exit 1
fi

echo "Doxygen documentation successfully built and copied to Docusaurus!"
echo "You can now build and serve the Docusaurus site to view the integrated documentation."
