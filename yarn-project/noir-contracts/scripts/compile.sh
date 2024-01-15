#!/usr/bin/env bash
# TODO: Move this compilation phase out of yarn-project to own job, and ingest abis.
set -euo pipefail

echo "Compiling contracts..."
nargo compile --silence-warnings
