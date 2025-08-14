#!/bin/bash

# Script to build Doxygen documentation and copy to Docusaurus static directory

set -e

echo "Building Doxygen documentation..."

# Navigate to the C++ root directory so paths in Doxyfile are correct
cd "$(dirname "$0")/../../cpp"

# Build the documentation using Doxygen from the docs subdirectory
doxygen docs/Doxyfile

echo "Copying Doxygen HTML to Docusaurus static directory..."

# Create the static/api directory if it doesn't exist
mkdir -p "../docs/static/api"

# Copy the built documentation from the correct path
if [ -d "docs/build" ]; then
  # First, clean the destination to avoid any leftover files
  rm -rf ../docs/static/api/*

  # Copy the built documentation
  cp -R docs/build/* ../docs/static/api/

else
  echo "Error: docs/build directory not found!"
  exit 1
fi

echo "Doxygen documentation successfully built and copied to Docusaurus!"
echo "You can now build and serve the Docusaurus site to view the integrated documentation."
