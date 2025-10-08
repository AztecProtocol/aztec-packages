#!/bin/bash

set -e

echo "Building Doxygen documentation..."
cd "$(dirname "$0")/../../cpp"
doxygen -q docs/Doxyfile

echo "Copying Doxygen HTML to Docusaurus static directory..."

if ! [ -d "docs/build" ]; then
  echo "Error: docs/build directory not found!"
  exit 1
fi
# First, clean the destination to avoid any leftover files
rm -rf ../docs/static/api/*

# Copy the built documentation
mkdir -p ../docs/static/api/
cp -R docs/build/* ../docs/static/api/

# NOTE(AD): hack - but was blocked and couldn't figure out why we had two examples for something called 'if' with different casing.
rm -f ../docs/static/api/if-example.html

echo "Doxygen documentation successfully built and copied to Docusaurus!"
echo "You can now build and serve the Docusaurus site to view the integrated documentation."
