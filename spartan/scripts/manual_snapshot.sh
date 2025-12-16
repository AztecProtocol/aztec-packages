#!/usr/bin/env bash

# This script triggers a snapshot manually in a deployed network. The network must have been deployed through deploy-aztec-infra for this to work and have snapshots enabled.

set -euo pipefail

ns="${1:-}"
if [ -z "$ns" ]; then
  echo "Missing required parameter: namespace" >&2
  exit 1
fi

kubectl create job -n "$ns" --from="cronjob/$ns-snapshot-aztec-snapshots" "manual-snapshot"
