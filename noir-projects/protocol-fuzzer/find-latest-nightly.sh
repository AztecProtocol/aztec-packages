#!/usr/bin/env bash
# Prints the latest 5.0.0-nightly.YYYYMMDD tag from Docker Hub.
# Exits with an error if no tag is found.
set -euo pipefail

tag=$(curl -sf "https://hub.docker.com/v2/repositories/aztecprotocol/aztec/tags?page_size=100&name=5.0.0-nightly." 2>/dev/null \
    | jq -r '.results[].name' 2>/dev/null \
    | grep -E '^5\.0\.0-nightly\.[0-9]{8}$' \
    | sort -t. -k4 -rn \
    | head -1)

if [ -z "$tag" ]; then
    echo "ERROR: could not find any 5.0.0-nightly.YYYYMMDD tag on Docker Hub" >&2
    exit 1
fi

echo "$tag"
