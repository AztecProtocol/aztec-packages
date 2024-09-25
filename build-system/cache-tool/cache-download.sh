#!/bin/bash
set -eu

if [ "$#" -ne 1 ]; then
    echo "Usage: $0 <tar.gz_file_to_download_and_extract>"
    exit 1
fi

# Get the tar.gz file name from the argument
TAR_FILE="$1"

function on_exit() {
  # Cleanup the temporary tar.gz file
  rm -f "$TAR_FILE"
}
# Run on any exit
trap on_exit EXIT

# Set cache server details
HOST_IP=${HOST_IP:-"localhost"}
AZTEC_BUILD_TOOL_PORT=${AZTEC_BUILD_TOOL_PORT:-8337}

# Attempt to download the cache file
echo "Attempting to download cache file from cache server at ${HOST_IP}:${AZTEC_BUILD_TOOL_PORT}..."
curl -f -o "$TAR_FILE" "http://${HOST_IP}:${AZTEC_BUILD_TOOL_PORT}/${TAR_FILE}" || exit 1

# Extract the cache file
echo "Cache file found. Extracting..."
tar -xzf "$TAR_FILE"

echo "Cache download and extraction complete."
