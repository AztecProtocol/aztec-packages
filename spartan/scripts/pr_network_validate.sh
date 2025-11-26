#!/usr/bin/env bash

set -euo pipefail

# Validates a network config PR by deploying 2 nodes in Kubernetes using ONLY the new resources
# Usage: pr_network_validate.sh <pr_number> <network_name> [cluster]

echo "PR Network Config Validation"
echo "============================="

spartan=$(git rev-parse --show-toplevel)/spartan
scripts_dir=$spartan/scripts

# Source required scripts
source "$scripts_dir/source_env_basic.sh"
source "$scripts_dir/gcp_auth.sh"

# Basic logging helpers
log() { echo "[INFO]  $(date -Is) - $*"; }
err() { echo "[ERROR] $(date -Is) - $*" >&2; }
die() { err "$*"; exit 1; }

# Check arguments
if [[ $# -lt 2 ]]; then
  die "Usage: $0 <pr_number> <network_name> [cluster]"
fi

PR_NUMBER="$1"
NETWORK_NAME="$2"
CLUSTER="${3:-${CLUSTER:-kind}}"

# Configuration
NAMESPACE="pr-validate-${PR_NUMBER}"
RELEASE_PREFIX="pr-val-${PR_NUMBER}"
CLEANUP="${CLEANUP:-true}"
VALIDATION_TIMEOUT="${VALIDATION_TIMEOUT:-1800}"
AZTEC_DOCKER_IMAGE="${AZTEC_DOCKER_IMAGE:-aztecprotocol/aztec:latest}"

# Check required environment variables
if [[ -z "${AZTEC_DOCKER_IMAGE:-}" ]]; then
  die "AZTEC_DOCKER_IMAGE is not set. Please set it to the image you want to validate."
fi

log "Configuration:"
log "  PR Number: ${PR_NUMBER}"
log "  Network: ${NETWORK_NAME}"
log "  Cluster: ${CLUSTER}"
log "  Namespace: ${NAMESPACE}"
log "  Image: ${AZTEC_DOCKER_IMAGE}"

# Perform GCP auth if not using kind
if [[ "${CLUSTER}" != "kind" ]]; then
  log "Authenticating to GCP..."
  gcp_auth
fi

# Get kubectl context
K8S_CLUSTER_CONTEXT=$(kubectl config current-context)
log "Using kubectl context: ${K8S_CLUSTER_CONTEXT}"

# Step 1: Diff configs to get new resources
log "Step 1: Diffing network configs..."
DIFF_OUTPUT=$("$scripts_dir/diff_network_config.sh" "$PR_NUMBER" "$NETWORK_NAME")

if [[ -z "$DIFF_OUTPUT" ]]; then
  die "Failed to diff network configs"
fi

log "Diff output:"
echo "$DIFF_OUTPUT" | jq '.'

# Parse diff output
NEW_BOOTNODES=$(echo "$DIFF_OUTPUT" | jq -r '.new_bootnodes | join(",")')
NEW_SNAPSHOTS=$(echo "$DIFF_OUTPUT" | jq -r '.new_snapshots | join(",")')
REGISTRY_ADDRESS=$(echo "$DIFF_OUTPUT" | jq -r '.registry_address')
L1_CHAIN_ID=$(echo "$DIFF_OUTPUT" | jq -r '.l1_chain_id')
FEE_ASSET_HANDLER_ADDRESS=$(echo "$DIFF_OUTPUT" | jq -r '.fee_asset_handler_address // ""')

log "New resources to validate:"
log "  Bootnodes: ${NEW_BOOTNODES:-<none>}"
log "  Snapshots: ${NEW_SNAPSHOTS:-<none>}"

# Validate at least one new resource
if [[ -z "$NEW_BOOTNODES" ]] && [[ -z "$NEW_SNAPSHOTS" ]]; then
  die "No new bootnodes or snapshots to validate"
fi

# Step 2: Create namespace
log "Step 2: Creating namespace ${NAMESPACE}..."
if kubectl get namespace "${NAMESPACE}" >/dev/null 2>&1; then
  log "Namespace ${NAMESPACE} already exists. Deleting..."
  kubectl delete namespace "${NAMESPACE}" --wait=true --timeout=60s || true
fi
kubectl create namespace "${NAMESPACE}"

# Step 3: Get L1 configuration
log "Step 3: Setting up L1 configuration..."

# Determine L1 network based on the Aztec network
# mainnet uses mainnet L1, everything else uses sepolia
if [[ "$NETWORK_NAME" == "mainnet" ]]; then
  L1_NETWORK="mainnet"
else
  L1_NETWORK="sepolia"
fi

# Fetch L1 endpoints from GCP secrets if not already set
if [[ -z "${ETHEREUM_RPC_URLS:-}" ]] && [[ -z "${L1_RPC_URLS:-}" ]]; then
  log "Fetching L1 RPC URLs from GCP secret: ${L1_NETWORK}-rpc-urls"
  ETHEREUM_RPC_URLS=$(gcloud secrets versions access latest --secret="${L1_NETWORK}-rpc-urls" --project="${GCP_PROJECT_ID:-testnet-440309}" 2>/dev/null || echo "")
  if [[ -z "$ETHEREUM_RPC_URLS" ]]; then
    die "Failed to fetch ${L1_NETWORK}-rpc-urls from GCP secrets. Ensure you're authenticated."
  fi
fi

if [[ -z "${ETHEREUM_CONSENSUS_HOST_URLS:-}" ]] && [[ -z "${L1_CONSENSUS_HOST_URLS:-}" ]]; then
  log "Fetching L1 Consensus URLs from GCP secret: ${L1_NETWORK}-consensus-host-urls"
  ETHEREUM_CONSENSUS_HOST_URLS=$(gcloud secrets versions access latest --secret="${L1_NETWORK}-consensus-host-urls" --project="${GCP_PROJECT_ID:-testnet-440309}" 2>/dev/null || echo "")
  if [[ -z "$ETHEREUM_CONSENSUS_HOST_URLS" ]]; then
    die "Failed to fetch ${L1_NETWORK}-consensus-host-urls from GCP secrets. Ensure you're authenticated."
  fi
fi

# L1 endpoints - required for nodes to sync
L1_RPC_URLS="${ETHEREUM_RPC_URLS:-${L1_RPC_URLS:-}}"
L1_CONSENSUS_URLS="${ETHEREUM_CONSENSUS_HOST_URLS:-${L1_CONSENSUS_HOST_URLS:-}}"

if [[ -z "$L1_RPC_URLS" ]]; then
  die "L1_RPC_URLS or ETHEREUM_RPC_URLS must be set"
fi

if [[ -z "$L1_CONSENSUS_URLS" ]]; then
  die "L1_CONSENSUS_URLS or ETHEREUM_CONSENSUS_HOST_URLS must be set"
fi

# Convert JSON arrays to comma-separated if needed
if [[ "$L1_RPC_URLS" == "["* ]]; then
  L1_RPC_URLS=$(echo "$L1_RPC_URLS" | jq -r 'join(",")')
fi

if [[ "$L1_CONSENSUS_URLS" == "["* ]]; then
  L1_CONSENSUS_URLS=$(echo "$L1_CONSENSUS_URLS" | jq -r 'join(",")')
fi

log "  L1 RPC URLs: ${L1_RPC_URLS}"
log "  L1 Consensus URLs: ${L1_CONSENSUS_URLS}"

# Step 4: Create Helm values file
log "Step 4: Creating Helm values..."
TMP_DIR=$(mktemp -d)
trap "rm -rf $TMP_DIR" EXIT

HELM_VALUES_FILE="${TMP_DIR}/pr-validate-values.yaml"

cat > "$HELM_VALUES_FILE" << EOF
replicaCount: 2

global:
  aztecNetwork: ""  # Don't use predefined network
  customAztecNetwork:
    l1ChainId: ${L1_CHAIN_ID}
    registryContractAddress: "${REGISTRY_ADDRESS}"
    feeAssetHandlerContractAddress: "${FEE_ASSET_HANDLER_ADDRESS}"

  l1ExecutionUrls:
$(echo "$L1_RPC_URLS" | tr ',' '\n' | while read url; do echo "    - \"$url\""; done)

  l1ConsensusUrls:
$(echo "$L1_CONSENSUS_URLS" | tr ',' '\n' | while read url; do echo "    - \"$url\""; done)

  aztecImage:
    repository: $(echo "$AZTEC_DOCKER_IMAGE" | cut -d: -f1)
    tag: "$(echo "$AZTEC_DOCKER_IMAGE" | cut -d: -f2)"
    pullPolicy: IfNotPresent

  sponsoredFPC: false
  testAccounts: false

node:
  logLevel: "debug"

  startCmd:
    - --node
    - --archiver

  env:
    # Override with ONLY new resources - this is the key to isolated testing
    NETWORK_CONFIG_LOCATION: ""  # Disable remote network config fetch
    BOOTSTRAP_NODES: "${NEW_BOOTNODES}"
    SYNC_SNAPSHOTS_URLS: "${NEW_SNAPSHOTS}"
    SYNC_MODE: force-snapshot
    L1_CHAIN_ID: "${L1_CHAIN_ID}"
    REGISTRY_CONTRACT_ADDRESS: "${REGISTRY_ADDRESS}"
    FEE_ASSET_HANDLER_CONTRACT_ADDRESS: "${FEE_ASSET_HANDLER_ADDRESS:-0x0000000000000000000000000000000000000000}"
    LOG_LEVEL: "debug"
EOF

log "Helm values created:"
cat "$HELM_VALUES_FILE"

# Step 5: Deploy with Helm
log "Step 5: Deploying validation nodes..."
helm upgrade --install \
  "${RELEASE_PREFIX}" \
  "$spartan/aztec-node" \
  --namespace "${NAMESPACE}" \
  --values "$HELM_VALUES_FILE" \
  --timeout 15m

log "Deployment complete. Waiting for pods to start..."

# Step 6: Wait for pods to exist (not Ready - we need to check logs immediately)
log "Step 6: Waiting for pods to be created..."
for i in {1..60}; do
  POD_COUNT=$(kubectl get pods -n "${NAMESPACE}" -l "app.kubernetes.io/instance=${RELEASE_PREFIX}" --no-headers 2>/dev/null | wc -l)
  if [[ "$POD_COUNT" -ge 2 ]]; then
    log "Pods created!"
    break
  fi
  if [[ $i -eq 60 ]]; then
    die "Timeout waiting for pods to be created"
  fi
  sleep 2
done

# Get pod names
POD_0=$(kubectl get pods -n "${NAMESPACE}" -l "app.kubernetes.io/instance=${RELEASE_PREFIX}" -o jsonpath='{.items[0].metadata.name}')
POD_1=$(kubectl get pods -n "${NAMESPACE}" -l "app.kubernetes.io/instance=${RELEASE_PREFIX}" -o jsonpath='{.items[1].metadata.name}')

log "Validation pods: ${POD_0}, ${POD_1}"
log "Starting validation checks (will monitor logs as pods start)..."

# Step 7: Validation checks
log "Step 7: Running validation checks..."

VALIDATION_START=$(date +%s)
SUCCESS=false

# Function to check logs for P2P connection
check_p2p_connection() {
  local pod=$1
  kubectl logs -n "${NAMESPACE}" "$pod" --tail=100 2>/dev/null | grep -i "peer.*connected\|discovered peer" || true
}

# Function to check logs for snapshot download
check_snapshot_download() {
  local pod=$1
  kubectl logs -n "${NAMESPACE}" "$pod" --tail=100 2>/dev/null | grep -i "snapshot.*download\|syncing from snapshot\|downloading snapshot" || true
}

# Function to check if node is syncing from L1 (fallback - should fail if snapshots expected)
check_l1_sync() {
  local pod=$1
  kubectl logs -n "${NAMESPACE}" "$pod" --tail=200 2>/dev/null | grep -i "syncing from l1\|catching up from l1\|starting archiver\|archiver sync" || true
}

# Function to check for snapshot failures
check_snapshot_failure() {
  local pod=$1
  # Look for the critical failure message that means all snapshots failed
  kubectl logs -n "${NAMESPACE}" "$pod" --tail=200 2>/dev/null | grep -i "No valid snapshots found from any URL, skipping snapshot sync\|No snapshot found at.*Skipping this URL\|Fetching.*failed\. Will retry" || true
}

# Function to check node status
check_node_status() {
  local pod=$1
  kubectl exec -n "${NAMESPACE}" "$pod" -- curl -s http://localhost:8080/status || echo "{}"
}

log "Monitoring validation (timeout: ${VALIDATION_TIMEOUT}s)..."

while true; do
  CURRENT_TIME=$(date +%s)
  ELAPSED=$((CURRENT_TIME - VALIDATION_START))

  if [[ $ELAPSED -gt $VALIDATION_TIMEOUT ]]; then
    err "Validation timeout reached (${VALIDATION_TIMEOUT}s)"
    break
  fi

  log "Check iteration (${ELAPSED}s elapsed)..."

  # CRITICAL CHECK: If new snapshots exist, ensure nodes are NOT syncing from L1
  if [[ -n "$NEW_SNAPSHOTS" ]]; then
    log "  Checking for L1 sync fallback (should NOT happen with new snapshots)..."
    L1_SYNC_POD_0=$(check_l1_sync "$POD_0")
    L1_SYNC_POD_1=$(check_l1_sync "$POD_1")

    if [[ -n "$L1_SYNC_POD_0" ]] || [[ -n "$L1_SYNC_POD_1" ]]; then
      err "  ✗ FAILURE: Nodes are syncing from L1 instead of using snapshots!"
      if [[ -n "$L1_SYNC_POD_0" ]]; then
        err "    Pod 0: $L1_SYNC_POD_0"
      fi
      if [[ -n "$L1_SYNC_POD_1" ]]; then
        err "    Pod 1: $L1_SYNC_POD_1"
      fi
      err "  This indicates the snapshot URL is broken or unreachable."
      SUCCESS=false
      break
    fi

    # Check for explicit snapshot failures
    SNAPSHOT_FAIL_POD_0=$(check_snapshot_failure "$POD_0")
    SNAPSHOT_FAIL_POD_1=$(check_snapshot_failure "$POD_1")

    if [[ -n "$SNAPSHOT_FAIL_POD_0" ]] || [[ -n "$SNAPSHOT_FAIL_POD_1" ]]; then
      err "  ✗ FAILURE: Snapshot download failed!"
      if [[ -n "$SNAPSHOT_FAIL_POD_0" ]]; then
        err "    Pod 0: $SNAPSHOT_FAIL_POD_0"
      fi
      if [[ -n "$SNAPSHOT_FAIL_POD_1" ]]; then
        err "    Pod 1: $SNAPSHOT_FAIL_POD_1"
      fi
      SUCCESS=false
      break
    fi
  fi

  # Check 1: P2P discovery
  log "  Checking P2P connections..."
  P2P_POD_0=$(check_p2p_connection "$POD_0")
  P2P_POD_1=$(check_p2p_connection "$POD_1")

  if [[ -n "$P2P_POD_0" ]] || [[ -n "$P2P_POD_1" ]]; then
    log "  ✓ P2P connection detected!"
    if [[ -n "$P2P_POD_0" ]]; then
      log "    Pod 0: $P2P_POD_0"
    fi
    if [[ -n "$P2P_POD_1" ]]; then
      log "    Pod 1: $P2P_POD_1"
    fi

    # If we only have new snapshots (no new bootnodes), P2P is not required
    if [[ -n "$NEW_BOOTNODES" ]]; then
      SUCCESS=true
      break
    fi
  fi

  # Check 2: Snapshot download (if new snapshots exist)
  if [[ -n "$NEW_SNAPSHOTS" ]]; then
    log "  Checking snapshot downloads..."
    SNAPSHOT_POD_0=$(check_snapshot_download "$POD_0")
    SNAPSHOT_POD_1=$(check_snapshot_download "$POD_1")

    if [[ -n "$SNAPSHOT_POD_0" ]] || [[ -n "$SNAPSHOT_POD_1" ]]; then
      log "  ✓ Snapshot download detected!"
      if [[ -n "$SNAPSHOT_POD_0" ]]; then
        log "    Pod 0: $SNAPSHOT_POD_0"
      fi
      if [[ -n "$SNAPSHOT_POD_1" ]]; then
        log "    Pod 1: $SNAPSHOT_POD_1"
      fi
      SUCCESS=true
      break
    fi
  fi

  log "  Waiting 10s before next check..."
  sleep 10
done

# Step 8: Report results
log "Step 8: Validation complete"

if [[ "$SUCCESS" == "true" ]]; then
  log "✓ VALIDATION PASSED"
  log "  - New bootnodes: ${NEW_BOOTNODES:-<none>}"
  log "  - New snapshots: ${NEW_SNAPSHOTS:-<none>}"
  log "  - Nodes successfully used new resources"
else
  err "✗ VALIDATION FAILED"
  err "  - Could not verify nodes are using new resources"
  err "  - Check logs below for details"

  # Dump logs for debugging
  log "Pod 0 logs (last 50 lines):"
  kubectl logs -n "${NAMESPACE}" "$POD_0" --tail=50 || true

  log "Pod 1 logs (last 50 lines):"
  kubectl logs -n "${NAMESPACE}" "$POD_1" --tail=50 || true
fi

# Step 9: Cleanup
if [[ "$CLEANUP" == "true" ]]; then
  log "Step 9: Cleaning up namespace ${NAMESPACE}..."
  kubectl delete namespace "${NAMESPACE}" --wait=true --timeout=60s || true
  log "Cleanup complete"
else
  log "Step 9: Skipping cleanup (CLEANUP=false)"
  log "  To clean up manually: kubectl delete namespace ${NAMESPACE}"
fi

# Exit with appropriate code
if [[ "$SUCCESS" == "true" ]]; then
  exit 0
else
  exit 1
fi
