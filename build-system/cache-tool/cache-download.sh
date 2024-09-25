#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
    echo "Usage: $0 <prefix>"
    exit 1
fi

PREFIX="$1"

# Compute the content hashes inside AZTEC_CACHE_REBUILD_PATTERNS
CONTENT_HASH=$($(dirname $0)/compute-content-hash.sh)

echo "Content hash: $CONTENT_HASH"

# Construct the tar.gz file name
TAR_FILE="${PREFIX}-${CONTENT_HASH}.tar.gz"

# Call cache-download-direct.sh with the tar.gz file name
$(dirname $0)/cache-download-direct.sh "$TAR_FILE"
