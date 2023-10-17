#!/bin/bash


# should be run from yarn-project/boxes
original_path=$(pwd)

# Loop through all directories in 'boxes'
for dir in *; do
  # Check if it's a directory
  if [ -d "${dir}" ]; then
    
    # Run the compile command
    echo "Running compile command inside ${dir}..."

    # Change directory to ../cli
    cd ../cli
    
    # Run ts-node command to use latest "compile" code.  this uses the yarn command to use the subpackage ts-node dep
    yarn compile:local
    
    # Change back to the original directory
    cd "${original_path}"
    
  fi
done
