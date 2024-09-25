#!/bin/bash
set -eu

if [ "$#" -lt 4 ]; then
    echo "Usage: $0 <build_dir> <source_paths...> --upload <files_to_upload...> <cache_name>"
    exit 1
fi

# Extract arguments
BUILD_DIR="$1"
shift

# Find the index of '--upload'
UPLOAD_INDEX=$(($# - 1))
for i in "$@"; do
    if [ "$i" == "--upload" ]; then
        break
    fi
    UPLOAD_INDEX=$((UPLOAD_INDEX - 1))
done

# Extract source paths
SOURCE_PATHS=("${@:1:$UPLOAD_INDEX}")
shift $UPLOAD_INDEX

# Remove '--upload' token
shift

# Extract files to upload
UPLOAD_FILES=()
while [[ "$1" != "" && "$#" -gt 1 ]]; do
    UPLOAD_FILES+=("$1")
    shift
done

CACHE_NAME="$1"

# Compute the source hash
echo "Computing source hash for paths: ${SOURCE_PATHS[*]}"
SOURCE_HASH=$(find "${SOURCE_PATHS[@]}" -type f -exec sha256sum {} \; | sort | sha256sum | awk '{print $1}')
echo "Source hash: $SOURCE_HASH"

# Define cache file name
TAR_FILE="build-${CACHE_NAME}-${SOURCE_HASH}.tar.gz"

function on_exit() {
  # Cleanup the temporary tar.gz file
  rm -f "$TAR_FILE"
}
# like a try-finally block for the script, run on any exit
trap on_exit EXIT

# Create the tar.gz file of the build directory
echo "Creating tar.gz of the build directory..."
tar -czf "$TAR_FILE" -C "$BUILD_DIR" .

# Set cache server details
HOST_IP=${HOST_IP:-"localhost"}
AZTEC_BUILD_TOOL_PORT=${AZTEC_BUILD_TOOL_PORT:-8337}

# Upload the tar.gz file to the cache server
echo "Uploading cache file to cache server at ${HOST_IP}:${AZTEC_BUILD_TOOL_PORT}..."
curl -X POST -F "file=@${TAR_FILE}" "http://${HOST_IP}:${AZTEC_BUILD_TOOL_PORT}/upload"

# Upload additional files
for file in "${UPLOAD_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "Uploading $file to cache server..."
        curl -X POST -F "file=@${file}" "http://${HOST_IP}:${AZTEC_BUILD_TOOL_PORT}/upload"
    else
        echo "File $file does not exist and cannot be uploaded."
    fi
done

echo "Cache upload complete."