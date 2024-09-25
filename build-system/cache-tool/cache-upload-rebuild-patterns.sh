#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 2 ]; then
    echo "Usage: $0 <prefix> <files_to_upload...>"
    exit 1
fi

PREFIX="$1"
shift
FILES_TO_UPLOAD=("$@")

# Compute the content hashes inside AZTEC_CACHE_REBUILD_PATTERNS
CONTENT_HASH=$($(dirname $0)/compute-content-hash.sh)

echo "Content hash: $CONTENT_HASH"

# Construct the tar.gz file name without extension
NAME="${PREFIX}-${CONTENT_HASH}"

# Call cache-upload.sh with the files to upload and the tar.gz file name (without extension)
$(dirname $0)/cache-upload.sh "${FILES_TO_UPLOAD[@]}" "$NAME"
