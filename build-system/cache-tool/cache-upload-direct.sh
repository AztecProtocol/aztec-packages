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

TAR_FILE="$(mktemp)/${NAME}.tar.gz"

function on_exit() {
  # Cleanup the temporary tar.gz file
  rm -f "$TAR_FILE"
}
trap on_exit EXIT

# Create the tar.gz file
tar -czf "$TAR_FILE" "${BIN_PATHS[@]}"

# Set cache server details
AZTEC_CACHE_TOOL_IP=${AZTEC_CACHE_TOOL_IP:-"localhost"}
AZTEC_CACHE_TOOL_PORT=${AZTEC_CACHE_TOOL_PORT:-8337}

# Upload the tar.gz file to the cache server
curl -sS -X POST -F "file=@${TAR_FILE}" "http://${AZTEC_CACHE_TOOL_IP}:${AZTEC_CACHE_TOOL_PORT}/upload"
