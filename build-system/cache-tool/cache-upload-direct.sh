#!/bin/bash
set -eu

# used by cache-update.sh, directly downloads a named tar file and extracts it

if [ "$#" -lt 2 ]; then
    echo "Usage: $0 <binary_paths_to_tar.gz_and_upload...> <name_without_tar.gz_extension>"
    exit 1
fi

# Extract the name without tar.gz extension
NAME="${@: -1}"

# Extract the binary paths to tar.gz and upload
BIN_PATHS=("${@:1:$#-1}")

TAR_FILE="${NAME}.tar.gz"

function on_exit() {
  # Cleanup the temporary tar.gz file
  rm -f "$TAR_FILE"
}
trap on_exit EXIT

# Create the tar.gz file
echo "Creating tar.gz of the specified files..."
tar -czf "$TAR_FILE" "${BIN_PATHS[@]}"

# Set cache server details
HOST_IP=${HOST_IP:-"localhost"}
AZTEC_BUILD_TOOL_PORT=${AZTEC_BUILD_TOOL_PORT:-8337}

# Upload the tar.gz file to the cache server
echo "Uploading cache file to cache server at ${HOST_IP}:${AZTEC_BUILD_TOOL_PORT}..."
curl -X POST -F "file=@${TAR_FILE}" "http://${HOST_IP}:${AZTEC_BUILD_TOOL_PORT}/upload"

# If S3_WRITE is enabled, upload to S3
if [[ "${S3_WRITE:-}" == "true" ]]; then
    echo "Uploading cache file to S3..."
    curl -X POST -F "file=@${TAR_FILE}" "http://${HOST_IP}:${AZTEC_BUILD_TOOL_PORT}/upload-s3"
fi

echo "Cache upload complete."
