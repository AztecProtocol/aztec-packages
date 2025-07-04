#!/usr/bin/env bash
# Patch a StatefulSet to adjust its transaction pool size after Helm deployment.
# Usage: patch_txpool.sh <namespace> <statefulset> <pool_size>
#   <pool_size> represents the desired value for P2P_MAX_TX_POOL_SIZE (bytes).
set -euo pipefail

ns=${1:?Missing namespace}
sts=${2:?Missing statefulset name}
size=${3:?Missing tx pool size}

echo "[patch_txpool] Setting P2P_MAX_TX_POOL_SIZE=$size on $sts in namespace $ns" >&2

kubectl set env -n "$ns" "statefulset/$sts" \
  P2P_MAX_TX_POOL_SIZE="$size" --record
