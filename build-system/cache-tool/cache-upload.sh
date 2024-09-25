#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "Usage: $0 <prefix> <files_to_upload...>"
  exit 1
fi

AZTEC_CACHE_TOOL_IP=${AZTEC_CACHE_TOOL_IP:-"localhost"}

if ! nc -vz $AZTEC_CACHE_TOOL_IP $AZTEC_CACHE_TOOL_PORT ; then
  echo "Aztec cache tool not running or not reachable. Not using cache. NOT erroring."
  exit 0
fi

PREFIX="$1"
shift
FILES_TO_UPLOAD="$@"

# Compute the content hashes inside AZTEC_CACHE_REBUILD_PATTERNS
CONTENT_HASH=$($(dirname $0)/compute-content-hash.sh)

echo "Content hash: $CONTENT_HASH"

# Construct the tar.gz file name without extension
NAME="${PREFIX}-${CONTENT_HASH}"

# Call cache-upload-direct.sh with the files to upload and the tar.gz file name (without extension)
$(dirname $0)/cache-upload-direct.sh "$FILES_TO_UPLOAD" "$NAME"
