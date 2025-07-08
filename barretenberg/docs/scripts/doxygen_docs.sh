#!/bin/bash

# Script to build Doxygen documentation and copy to Docusaurus static directory

set -e

echo "Building Doxygen documentation..."

# Navigate to the C++ docs directory
cd "$(dirname "$0")/../../cpp/docs"

# Build the documentation using Doxygen
doxygen Doxyfile

echo "Copying Doxygen HTML to Docusaurus static directory..."

# Create the static/doxygen directory if it doesn't exist
mkdir -p "../../docs/static/doxygen"

# Copy the built documentation
rsync -av --delete build/ ../../docs/static/doxygen/

echo "Doxygen documentation successfully built and copied to Docusaurus!"
echo "You can now build and serve the Docusaurus site to view the integrated documentation."