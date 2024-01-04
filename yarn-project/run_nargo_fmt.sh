#!/usr/bin/env bash

# Find all Nargo.toml files and run 'nargo fmt' in their directories
find . -name "Nargo.toml" | while read file; do
    # Extract the directory from the file path
    dir=$(dirname "$file")
    
    # Change into the directory
    cd "$dir" || exit

    # Run 'nargo fmt' in the directory
    nargo fmt

    # Change back to the original directory
    cd - > /dev/null
done
