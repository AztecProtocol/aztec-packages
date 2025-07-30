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
  
  # Convert all filenames to lowercase to avoid case-sensitivity issues
  echo "Converting filenames to lowercase to avoid case-sensitivity issues..."
  cd ../docs/static/api
  
  # Find all files and rename them to lowercase
  find . -depth -name "*" | while read file; do
    dir=$(dirname "$file")
    base=$(basename "$file")
    lower=$(echo "$base" | tr '[:upper:]' '[:lower:]')
    if [ "$base" != "$lower" ]; then
      # If file with lowercase name already exists, remove the uppercase version
      if [ -e "$dir/$lower" ]; then
        echo "Removing duplicate file: $file (keeping lowercase version)"
        rm -f "$file"
      else
        echo "Renaming: $file -> $dir/$lower"
        mv "$file" "$dir/$lower"
      fi
    fi
  done
  
  # Update all HTML file references to use lowercase names
  echo "Updating HTML file references to use lowercase names..."
  find . -name "*.html" -type f | while read htmlfile; do
    # Use a temporary file for safe in-place editing
    temp_file=$(mktemp)
    
    # Update href and src attributes to use lowercase
    sed -E 's/href="([^"]*[A-Z][^"]*)"/href="\L\1"/g; s/src="([^"]*[A-Z][^"]*)"/src="\L\1"/g' "$htmlfile" > "$temp_file"
    
    # Replace original file with updated content
    mv "$temp_file" "$htmlfile"
  done
  
  cd - > /dev/null
else
  echo "Error: docs/build directory not found!"
  exit 1
fi

echo "Doxygen documentation successfully built and copied to Docusaurus!"
echo "You can now build and serve the Docusaurus site to view the integrated documentation."
