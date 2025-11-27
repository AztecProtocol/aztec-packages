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

log "Diffing network configs..."
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

log "Creating namespace ${NAMESPACE}..."
if kubectl get namespace "${NAMESPACE}" >/dev/null 2>&1; then
  log "Namespace ${NAMESPACE} already exists. Deleting..."
  kubectl delete namespace "${NAMESPACE}" --wait=true --timeout=60s || true
fi
kubectl create namespace "${NAMESPACE}"

log "Setting up L1 configuration..."

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

log "Creating Helm values..."
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

  # Enable P2P with node port to get public IP
  p2p:
    enabled: true
    publicIP: true
    port: 40400
    announcePort: 40400

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

log "Deploying validation nodes..."
helm upgrade --install \
  "${RELEASE_PREFIX}" \
  "$spartan/aztec-node" \
  --namespace "${NAMESPACE}" \
  --values "$HELM_VALUES_FILE" \
  --timeout 15m

log "Deployment complete. Waiting for pods to start..."

log "Waiting for pods to be created..."
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

log "Running validation checks..."

VALIDATION_START=$(date +%s)
P2P_SUCCESS=false
SNAPSHOT_SUCCESS=false

# Determine what we need to validate
NEED_P2P_CHECK=false
NEED_SNAPSHOT_CHECK=false

if [[ -n "$NEW_BOOTNODES" ]]; then
  NEED_P2P_CHECK=true
  log "Will validate P2P discovery via new bootnode(s)"
fi

if [[ -n "$NEW_SNAPSHOTS" ]]; then
  NEED_SNAPSHOT_CHECK=true
  log "Will validate snapshot download from new URL(s)"
fi

# Function to check logs for P2P connection
check_p2p_connection() {
  local pod=$1
  # Look for actual peer connections, not "Connected to 0 peers"
  # Match patterns like:
  # - "Connected to X peers" where X > 0
  # - "peer abc123 connected"
  # - "discovered peer xyz789"
  local logs=$(kubectl logs -n "${NAMESPACE}" "$pod" --tail=200 2>/dev/null)

  # Check for "Connected to X peers" where X > 0
  if echo "$logs" | grep -qE "Connected to [1-9][0-9]* peer"; then
    echo "$logs" | grep -E "Connected to [1-9][0-9]* peer"
    return 0
  fi

  # Check for specific peer connection messages (but exclude "Connected to 0 peers")
  echo "$logs" | grep -iE "(peer [a-zA-Z0-9]+ connected|discovered peer [a-zA-Z0-9]+|connection established.*peer)" | grep -v "Connected to 0 peer" || true
}

# Function to check logs for snapshot download
# Returns: "success", "failed", or "unknown"
check_snapshot_download() {
  local pod=$1
  local logs=$(kubectl logs -n "${NAMESPACE}" "$pod" --tail=200 2>/dev/null)

  # Check for failure messages first
  if echo "$logs" | grep -qi "No valid snapshots found from any URL, skipping snapshot sync"; then
    echo "failed"
    return
  fi

  if echo "$logs" | grep -qi "No snapshot found at.*Skipping this URL"; then
    # This might be trying multiple URLs, check if ALL failed
    if echo "$logs" | grep -qi "No valid snapshots found from any URL"; then
      echo "failed"
      return
    fi
  fi

  # Check for success messages
  if echo "$logs" | grep -qi "snapshot.*download\|syncing from snapshot\|downloading snapshot"; then
    echo "success"
    return
  fi

  # Neither success nor failure detected yet
  echo "unknown"
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

  if [[ "$NEED_SNAPSHOT_CHECK" == "true" ]] && [[ "$SNAPSHOT_SUCCESS" == "false" ]]; then
    log "  Checking snapshot downloads..."
    SNAPSHOT_STATUS_POD_0=$(check_snapshot_download "$POD_0")
    SNAPSHOT_STATUS_POD_1=$(check_snapshot_download "$POD_1")

    if [[ "$SNAPSHOT_STATUS_POD_0" == "failed" ]] || [[ "$SNAPSHOT_STATUS_POD_1" == "failed" ]]; then
      err "  ✗ FAILURE: Snapshot download failed!"
      if [[ "$SNAPSHOT_STATUS_POD_0" == "failed" ]]; then
        err "    Pod 0: Snapshot failed"
        kubectl logs -n "${NAMESPACE}" "$POD_0" --tail=50 2>/dev/null | grep -i "snapshot\|No valid snapshots" | while IFS= read -r line; do
          err "      $line"
        done
      fi
      if [[ "$SNAPSHOT_STATUS_POD_1" == "failed" ]]; then
        err "    Pod 1: Snapshot failed"
        kubectl logs -n "${NAMESPACE}" "$POD_1" --tail=50 2>/dev/null | grep -i "snapshot\|No valid snapshots" | while IFS= read -r line; do
          err "      $line"
        done
      fi
      break
    fi

    if [[ "$SNAPSHOT_STATUS_POD_0" == "success" ]] || [[ "$SNAPSHOT_STATUS_POD_1" == "success" ]]; then
      log "  ✓ Snapshot download detected!"
      if [[ "$SNAPSHOT_STATUS_POD_0" == "success" ]]; then
        log "    Pod 0: Snapshot download started"
        kubectl logs -n "${NAMESPACE}" "$POD_0" --tail=50 2>/dev/null | grep -i "snapshot.*download\|syncing from snapshot" | while IFS= read -r line; do
          log "      $line"
        done
      fi
      if [[ "$SNAPSHOT_STATUS_POD_1" == "success" ]]; then
        log "    Pod 1: Snapshot download started"
        kubectl logs -n "${NAMESPACE}" "$POD_1" --tail=50 2>/dev/null | grep -i "snapshot.*download\|syncing from snapshot" | while IFS= read -r line; do
          log "      $line"
        done
      fi
      SNAPSHOT_SUCCESS=true
    fi

    if [[ "$SNAPSHOT_STATUS_POD_0" == "unknown" ]] && [[ "$SNAPSHOT_STATUS_POD_1" == "unknown" ]]; then
      log "    Snapshot status: still waiting..."
    fi
  fi


  if [[ "$NEED_P2P_CHECK" == "true" ]] && [[ "$P2P_SUCCESS" == "false" ]]; then
    log "  Checking P2P connections..."
    P2P_POD_0=$(check_p2p_connection "$POD_0")
    P2P_POD_1=$(check_p2p_connection "$POD_1")

    if [[ -n "$P2P_POD_0" ]] || [[ -n "$P2P_POD_1" ]]; then
      log "  ✓ P2P connection detected!"
      if [[ -n "$P2P_POD_0" ]]; then
        log "    Pod 0 logs:"
        echo "$P2P_POD_0" | while IFS= read -r line; do
          log "      $line"
        done
      fi
      if [[ -n "$P2P_POD_1" ]]; then
        log "    Pod 1 logs:"
        echo "$P2P_POD_1" | while IFS= read -r line; do
          log "      $line"
        done
      fi
      P2P_SUCCESS=true
    fi
  fi

  if [[ "$NEED_P2P_CHECK" == "false" || "$P2P_SUCCESS" == "true" ]] && [[ "$NEED_SNAPSHOT_CHECK" == "false" || "$SNAPSHOT_SUCCESS" == "true" ]]; then
    log "  ✓ All validation checks passed!"
    break
  fi

  log "  Waiting 10s before next check..."
  sleep 10
done


if [[ "$CLEANUP" == "true" ]]; then
  log "Cleaning up namespace ${NAMESPACE}..."
  kubectl delete namespace "${NAMESPACE}" --wait=true --timeout=60s || true
  log "Cleanup complete"
else
  log "Skipping cleanup (CLEANUP=false)"
  log "  To clean up manually: kubectl delete namespace ${NAMESPACE}"
fi

if [[ "$NEED_P2P_CHECK" == "false" || "$P2P_SUCCESS" == "true" ]] && [[ "$NEED_SNAPSHOT_CHECK" == "false" || "$SNAPSHOT_SUCCESS" == "true" ]]; then
  exit 0
else
  exit 1
fi
