#!/bin/bash
# Get the clang version string
clang_version_string=$(clang --version 2>/dev/null)

# Check if clang is installed
if [ $? -ne 0 ]; then
  echo "Error: clang is not installed."
  exit 1
fi

# Extract the major version number
major_version=$(echo $clang_version_string | awk -F' ' '/clang version/{print $3}' | awk -F'.' '{print $1}')

if [ "$major_version" -ge 16 ]; then
  echo "clang version $major_version is good."
else
  echo "Error: clang version 16 or greater is required."
  exit 1
fi

(cd cpp && ./bootstrap.sh)
cd ts
yarn build
npm link
