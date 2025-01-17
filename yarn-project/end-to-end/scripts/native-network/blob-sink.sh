#!/bin/bash
set -eu

REPO=$(git rev-parse --show-toplevel)

# Starts the Blob Sink
export PORT=${BLOB_SINK_PORT:-5052}
export DEBUG=${DEBUG:-"aztec:*"}
export DEBUG_COLORS=${DEBUG_COLORS:-1}

node --no-warnings "$REPO"/yarn-project/blob-sink/dest/server/run.js