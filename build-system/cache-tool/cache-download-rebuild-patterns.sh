#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
    echo "Usage: $0 <prefix>"
    exit 1
fi

PREFIX="$1"

# Ensure AZTEC_CACHE_REBUILD_PATTERNS is set
if [ -z "${AZTEC_CACHE_REBUILD_PATTERNS:-}" ]; then
    echo "Error: AZTEC_CACHE_REBUILD_PATTERNS environment variable is not set."
    exit 1
fi

# Read rebuild patterns as multi-line string
REBUILD_PATTERNS="$AZTEC_CACHE_REBUILD_PATTERNS"

# Concatenate patterns with '|' and double escape backslashes for AWK
AWK_PATTERN=$(cat "$REBUILD_PATTERNS" | sed 's/\\/\\\\/g' | tr '\n' '|' | sed 's/|$//')

# Change directory to the git repository root
cd "$(git rev-parse --show-toplevel)"

echo "Computing content hash for patterns:"
echo "$REBUILD_PATTERNS"

# Use git ls-tree and AWK to filter files matching the rebuild patterns and extract their hashes
FILE_HASHES=$(git ls-tree -r HEAD | awk -v pattern="($AWK_PATTERN)" '$4 ~ pattern {print $3}')

# Check if FILE_HASHES is empty
if [ -z "$FILE_HASHES" ]; then
    echo "No files matched the rebuild patterns."
    exit 0  # Exit gracefully; no files to hash
fi

# Sort the hashes and compute the content hash
CONTENT_HASH=$(echo "$FILE_HASHES" | sort | git hash-object --stdin)

echo "Content hash: $CONTENT_HASH"

# Construct the tar.gz file name
TAR_FILE="${PREFIX}-${CONTENT_HASH}.tar.gz"

# Call cache-download.sh with the tar.gz file name
$(dirname $0)/cache-download.sh "$TAR_FILE"
