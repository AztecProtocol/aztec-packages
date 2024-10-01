#!/usr/bin/env bash
set -euo pipefail

# Ensure AZTEC_CACHE_REBUILD_PATTERNS is set
if [ -z "${AZTEC_CACHE_REBUILD_PATTERNS:-}" ]; then
    echo "Error: AZTEC_CACHE_REBUILD_PATTERNS environment variable is not set."
    exit 1
fi

# Read rebuild patterns as multi-line string
REBUILD_PATTERNS="$AZTEC_CACHE_REBUILD_PATTERNS"

# Concatenate patterns with '|' and double escape backslashes for AWK
AWK_PATTERN=$(cat $REBUILD_PATTERNS | sed 's/\\/\\\\/g' | tr '\n' '|' | sed 's/|$//')

# use git repo root because that is where our patterns are focused
cd $(git rev-parse --show-toplevel)
# Use git ls-tree and AWK to filter files matching the rebuild patterns and extract their hashes
FILE_HASHES=$(git ls-tree -r HEAD | awk -v pattern="($AWK_PATTERN)" '$4 ~ pattern {print $3}')

# Check if FILE_HASHES is empty
if [ -z "$FILE_HASHES" ]; then
    echo "No files matched the rebuild patterns $REBUILD_PATTERNS."
    echo "Awk pattern expanded: $AWK_PATTERN."
    exit 1
fi

# Sort the hashes and compute the content hash
CONTENT_HASH=$(echo "$FILE_HASHES" | sort | git hash-object --stdin)
# important: include architecture in content hash because we target x86_64 and arm64
echo "$CONTENT_HASH-$(uname -m)"
