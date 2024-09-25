#!/bin/bash
set -eu

# used by cache-download-, directhloads a named tar file and extracts it

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
AZTEC_CACHE_TOOL_IP=${AZTEC_CACHE_TOOL_IP:-"localhost"}
AZTEC_CACHE_TOOL_PORT=${AZTEC_CACHE_TOOL_PORT:-8337}

# Attempt to download the cache file
echo "Attempting to download cache file from cache server at ${AZTEC_CACHE_TOOL_IP}:${AZTEC_CACHE_TOOL_PORT}..."
curl -f -o "$TAR_FILE" "http://${AZTEC_CACHE_TOOL_IP}:${AZTEC_CACHE_TOOL_PORT}/${TAR_FILE}" || exit 1

# Extract the cache file
echo "Cache file found. Extracting..."
tar -xzf "$TAR_FILE"

echo "Cache download and extraction complete."
