#!/bin/bash

# build-and-cache.sh

set -e

HOST_IP=${HOST_IP:-"localhost"}
CACHE_SERVER_PORT=8337

# Compute the source hash
cd /src
echo "Computing source hash..."
SOURCE_HASH=$(find . -type f ! -path "./build/*" -exec sha256sum {} \; | sort | sha256sum | awk '{print $1}')
echo "Source hash: $SOURCE_HASH"

TAR_FILE="build-barettenberg-${SOURCE_HASH}.tar.gz"

# Attempt to download the build directory from the cache server
echo "Attempting to download build directory from cache server at ${HOST_IP}:${CACHE_SERVER_PORT}..."
curl -f -o $TAR_FILE http://${HOST_IP}:${CACHE_SERVER_PORT}/${TAR_FILE} || true

if [ -f "$TAR_FILE" ]; then
    echo "Build cache found. Extracting..."
    tar -xzf $TAR_FILE
    rm $TAR_FILE
else
    echo "No build cache found. Building the project..."

    # Create build directory and build the project
    mkdir -p build && cd build
    cmake ..
    make -j$(nproc)
    cd /src

    # Create the tar.gz file of the build directory
    echo "Creating tar.gz of the build directory..."
    tar -czf $TAR_FILE build

    # Upload the tar.gz file to the cache server
    echo "Uploading build cache to cache server..."
    curl -X POST -F "file=@${TAR_FILE}" http://${HOST_IP}:${CACHE_SERVER_PORT}/upload

    # Remove the tar.gz file to prevent caching
    rm $TAR_FILE
fi