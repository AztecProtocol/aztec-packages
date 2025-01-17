#!/bin/bash
set -eu

REPO=$(git rev-parse --show-toplevel)

# Starts the Blob Sink
export BLOB_SINK_PORT=${BLOB_SINK_PORT:-5053}
export DEBUG=${DEBUG:-"aztec:*"}
export DEBUG_COLORS=${DEBUG_COLORS:-1}

node --no-warnings "$REPO"/yarn-project/blob-sink/dest/server/run.js