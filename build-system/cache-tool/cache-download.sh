#!/bin/bash
set -eu

if [ "$#" -lt 2 ]; then
    echo "Usage: $0 <source_paths...> <cache_name>"
    exit 1
fi

# Extract the cache name (last argument)
CACHE_NAME="${@: -1}"
# Extract the source paths (all arguments except the last)
SOURCE_PATHS=("${@:1:$#-2}")

# Compute the source hash
echo "Computing source hash for paths: ${SOURCE_PATHS[*]}"
SOURCE_HASH=$(find "${SOURCE_PATHS[@]}" -type f -exec sha256sum {} \; | sort | sha256sum | awk '{print $1}')
echo "Source hash: $SOURCE_HASH"

# Define cache file name
TAR_FILE="build-${CACHE_NAME}-${SOURCE_HASH}.tar.gz"

# Set cache server details
HOST_IP=${HOST_IP:-"localhost"}
CACHE_SERVER_PORT=${CACHE_SERVER_PORT:-8337}

# Attempt to download the cache file
echo "Attempting to download cache file from cache server at ${HOST_IP}:${CACHE_SERVER_PORT}..."
curl -f -o "$TAR_FILE" "http://${HOST_IP}:${CACHE_SERVER_PORT}/${TAR_FILE}" || exit 1

# Extract the cache file
echo "Cache file found. Extracting..."
tar -xzf "$TAR_FILE"
rm "$TAR_FILE"

echo "Cache download and extraction complete."
