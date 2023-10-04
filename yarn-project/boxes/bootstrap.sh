#!/bin/bash

# Loop through all directories in 'boxes'
for dir in *; do
  # Check if it's a directory
  if [ -d "${dir}" ]; then
    # Change to the subdirectory
    cd "${dir}"
    
    # Run the compile command
    echo "Running 'yarn compile' inside ${dir}..."
    yarn compile
    
    # Change back to the 'boxes' directory
    cd ..
  fi
done
