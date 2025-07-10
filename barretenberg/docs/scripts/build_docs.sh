#!/bin/bash

# Script to build Doxygen documentation and copy to Docusaurus static directory

set -e

echo "Using existing Doxygen documentation..."

# Navigate to the C++ docs directory
cd "$(dirname "$0")/../../cpp/docs"

# Check if build directory exists, if not, we need to build it
if [ ! -d "build" ]; then
  echo "Doxygen documentation not found, building..."
  doxygen Doxyfile
else
  echo "Using pre-built Doxygen documentation from build directory"
fi

echo "Copying Doxygen HTML to Docusaurus static directory..."

# Create the static/api directory if it doesn't exist
mkdir -p "../../docs/static/api"

# Copy the built documentation
rsync -av --delete build/ ../../docs/static/api/

echo "Doxygen documentation successfully built and copied to Docusaurus!"
echo "You can now build and serve the Docusaurus site to view the integrated documentation."
