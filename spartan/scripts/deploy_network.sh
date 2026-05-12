#!/usr/bin/env bash
# Inner deploy script: renders Terraform tfvars and runs eth-devnet,
# rollup-contracts, and aztec-infra modules.
#
# Usage: deploy_network.sh <network>
#   <network>: bare YAML name (resolved to spartan/environments/networks/<name>.yml)
#              or absolute path. Used to invoke load_network_config.sh for the
#              structured deploy/env/releases JSON written to
#              deploy-rollup-contracts/terraform.tfvars.json and
#              deploy-aztec-infra/terraform.tfvars.json.
#
# Assumes env was already sourced by deploy_network_with_env.sh (or the caller).

set -euo pipefail

NETWORK_YAML="${1:?usage: deploy_network.sh <network>}"

# Resolve repo root and script directory for reliable relative paths
REPO_ROOT="$(git rev-parse --show-toplevel)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

source "${REPO_ROOT}/ci3/source"

# Basic logging helpers
log() { echo "[INFO]  $(date -Is) - $*"; }
err() { echo "[ERROR] $(date -Is) - $*" >&2; }
die() { err "$*"; exit 1; }

# Wrapper for denoise with k8s context injection
k8s_denoise() {
  "${SCRIPT_DIR}/k8s_enriched_denoise" "${NAMESPACE}" "$1"
}

# We want to separate out these logs.
export DENOISE=1
########################
# TIMING INSTRUMENTATION
########################
# Capture deployment timings for CI benchmarks
DEPLOY_START_TIME=$(date +%s)
declare -A STAGE_TIMINGS

########################
# REQUIRED + DERIVED VARS
########################
# All static defaults live in spartan/environments/network-defaults.yml under
# `_deploy_defaults` and `networks.<name>.env`, sourced into this script's env
# by deploy_network_with_env.sh -> source_network_env.sh -> load_network_config.sh.
# Only deploy-time-derived values, required-var assertions, and helpers remain
# below.

NAMESPACE=${NAMESPACE:?NAMESPACE is required (set in YAML deploy: block or env)}
BASE_STATE_PATH="${CLUSTER}/${NAMESPACE}"

# RESOURCE_PROFILE depends on the cluster (kind -> dev, otherwise prod). Each
# release-specific profile cascades from RESOURCE_PROFILE unless overridden.
RESOURCE_PROFILE=${RESOURCE_PROFILE:-$([[ "${CLUSTER}" == "kind" ]] && echo "dev" || echo "prod")}
BOT_RESOURCE_PROFILE=${BOT_RESOURCE_PROFILE:-${RESOURCE_PROFILE}}
RPC_RESOURCE_PROFILE=${RPC_RESOURCE_PROFILE:-${RESOURCE_PROFILE}}
FULL_NODE_RESOURCE_PROFILE=${FULL_NODE_RESOURCE_PROFILE:-${RESOURCE_PROFILE}}
P2P_BOOTSTRAP_RESOURCE_PROFILE=${P2P_BOOTSTRAP_RESOURCE_PROFILE:-${RESOURCE_PROFILE}}
VALIDATOR_RESOURCE_PROFILE=${VALIDATOR_RESOURCE_PROFILE:-${RESOURCE_PROFILE}}
PROVER_RESOURCE_PROFILE=${PROVER_RESOURCE_PROFILE:-${RESOURCE_PROFILE}}
ARCHIVE_RESOURCE_PROFILE=${ARCHIVE_RESOURCE_PROFILE:-${RESOURCE_PROFILE}}
BLOB_SINK_RESOURCE_PROFILE=${BLOB_SINK_RESOURCE_PROFILE:-${RESOURCE_PROFILE}}

# When unset, derive from default mnemonic index 0.
ROLLUP_DEPLOYMENT_PRIVATE_KEY=${ROLLUP_DEPLOYMENT_PRIVATE_KEY:-$(cast wallet private-key --mnemonic "$LABS_INFRA_MNEMONIC" --mnemonic-index 0)}

# PROVER_REAL_PROOFS mirrors REAL_VERIFIER (deploy-script flag).
PROVER_REAL_PROOFS=${REAL_VERIFIER}

# Max node count: max of primary (VALIDATOR_REPLICAS) and HA pod counts
# Determines how many attester keys and addresses to generate
EFFECTIVE_HA_COUNT=${VALIDATOR_HA_REPLICA_COUNT:-$VALIDATOR_REPLICAS}
if [[ $VALIDATOR_HA_REPLICAS -gt 0 ]]; then
  MAX_VALIDATOR_NODES=$(( VALIDATOR_REPLICAS > EFFECTIVE_HA_COUNT ? VALIDATOR_REPLICAS : EFFECTIVE_HA_COUNT ))
else
  MAX_VALIDATOR_NODES=$VALIDATOR_REPLICAS
fi

# Compute VALIDATOR_INDICES from max node count if not explicitly set.
TOTAL_ATTESTERS=$((MAX_VALIDATOR_NODES * VALIDATORS_PER_NODE))
VALIDATOR_INDICES=${VALIDATOR_INDICES:-$(seq "$VALIDATOR_MNEMONIC_START_INDEX" $((VALIDATOR_MNEMONIC_START_INDEX + TOTAL_ATTESTERS - 1)) | tr '\n' ',' | sed 's/,$//')}

# Compute validator addresses (skip if no validators)
if [[ $VALIDATOR_REPLICAS -gt 0 ]]; then
  VALIDATOR_ADDRESSES=$(echo "$VALIDATOR_INDICES" | tr ',' '\n' | xargs -I{} cast wallet address --mnemonic "$LABS_INFRA_MNEMONIC" --mnemonic-index {} | tr '\n' ',' | sed 's/,$//')
  log "VALIDATOR_ADDRESSES: ${VALIDATOR_ADDRESSES}"
else
  VALIDATOR_ADDRESSES=""
  log "VALIDATOR_ADDRESSES: (none - no validators)"
fi

# Compute and include publisher indices in prefunding list
# Uses env overrides when provided, otherwise falls back to values.yaml defaults
# Total publishers = sum of pods across all releases × publishers per replica
# Primary has VALIDATOR_REPLICAS pods, each HA release has EFFECTIVE_HA_COUNT pods
if [[ $VALIDATOR_HA_REPLICAS -gt 0 ]]; then
  TOTAL_VALIDATOR_PUBLISHERS=$(( (VALIDATOR_REPLICAS + VALIDATOR_HA_REPLICAS * EFFECTIVE_HA_COUNT) * VALIDATOR_PUBLISHERS_PER_REPLICA ))
else
  TOTAL_VALIDATOR_PUBLISHERS=$(( VALIDATOR_REPLICAS * VALIDATOR_PUBLISHERS_PER_REPLICA ))
fi

if (( TOTAL_VALIDATOR_PUBLISHERS > 0 )); then
  VALIDATOR_PUBLISHER_RANGE=$(seq "$VALIDATOR_PUBLISHER_MNEMONIC_START_INDEX" $((VALIDATOR_PUBLISHER_MNEMONIC_START_INDEX + TOTAL_VALIDATOR_PUBLISHERS - 1)) | tr '\n' ',' | sed 's/,$//')
  # Append validator publisher indices to prefund list
  LABS_INFRA_INDICES="${LABS_INFRA_INDICES},${VALIDATOR_PUBLISHER_RANGE}"
fi

# Add prover publishers to prefunding list
TOTAL_PROVER_PUBLISHERS=$((PROVER_REPLICAS * PUBLISHERS_PER_PROVER))

if (( TOTAL_PROVER_PUBLISHERS > 0 )); then
  PROVER_PUBLISHER_RANGE=$(seq "$PROVER_PUBLISHER_MNEMONIC_START_INDEX" $((PROVER_PUBLISHER_MNEMONIC_START_INDEX + TOTAL_PROVER_PUBLISHERS - 1)) | tr '\n' ',' | sed 's/,$//')
  # Append prover publisher indices to prefund list
  LABS_INFRA_INDICES="${LABS_INFRA_INDICES},${PROVER_PUBLISHER_RANGE}"
fi

# Add bot L1 accounts to prefunding list
if (( BOT_TRANSFERS_REPLICAS > 0 )); then
  BOT_TRANSFERS_RANGE=$(seq "$BOT_TRANSFERS_MNEMONIC_START_INDEX" $((BOT_TRANSFERS_MNEMONIC_START_INDEX + BOT_TRANSFERS_REPLICAS - 1)) | tr '\n' ',' | sed 's/,$//')
  LABS_INFRA_INDICES="${LABS_INFRA_INDICES},${BOT_TRANSFERS_RANGE}"
fi

if (( BOT_SWAPS_REPLICAS > 0 )); then
  BOT_SWAPS_RANGE=$(seq "$BOT_SWAPS_MNEMONIC_START_INDEX" $((BOT_SWAPS_MNEMONIC_START_INDEX + BOT_SWAPS_REPLICAS - 1)) | tr '\n' ',' | sed 's/,$//')
  LABS_INFRA_INDICES="${LABS_INFRA_INDICES},${BOT_SWAPS_RANGE}"
fi

if (( BOT_CROSS_CHAIN_REPLICAS > 0 )); then
  BOT_CROSS_CHAIN_RANGE=$(seq "$BOT_CROSS_CHAIN_MNEMONIC_START_INDEX" $((BOT_CROSS_CHAIN_MNEMONIC_START_INDEX + BOT_CROSS_CHAIN_REPLICAS - 1)) | tr '\n' ',' | sed 's/,$//')
  LABS_INFRA_INDICES="${LABS_INFRA_INDICES},${BOT_CROSS_CHAIN_RANGE}"
fi

# Ensure docker image provided (not needed for pure teardowns)
if [[ -z "${AZTEC_DOCKER_IMAGE:-}" && ("${CREATE_AZTEC_INFRA:-}" == "true" || "${CREATE_ROLLUP_CONTRACTS:-}" == "true") ]]; then
  die "AZTEC_DOCKER_IMAGE is not set"
fi

K8S_CLUSTER_CONTEXT=$(kubectl config current-context)

if [[ "${DESTROY_NAMESPACE:-}" == "true" ]]; then
  "${SCRIPT_DIR}/network_teardown.sh"
fi

# Drop any stale terraform state locks left behind by a prior crashed run —
# an ungraceful exit (OOM, spot eviction, CI timeout) leaves a `.tflock` GCS
# object that poisons every future run for the same namespace. Only runs for
# ephemeral namespaces (DESTROY_NAMESPACE=true) on a GCS backend, and only
# touches state under this namespace's prefix, so it cannot affect production.
if [[ "${DESTROY_NAMESPACE:-false}" == "true" && "${CLUSTER}" != "kind" ]]; then
  log "Clearing any stale terraform state locks under gs://aztec-terraform/${BASE_STATE_PATH}/"
  for module in deploy-eth-devnet deploy-rollup-contracts deploy-aztec-infra; do
    gcloud storage rm --quiet "gs://aztec-terraform/${BASE_STATE_PATH}/${module}/terraform.tfstate/default.tflock" 2>/dev/null || true
  done
fi

# Create the namespace if it doesn't exist
kubectl get namespace "${NAMESPACE}" >/dev/null 2>&1 || kubectl create namespace "${NAMESPACE}"

# Start k8s enricher in background with per-pod cache logging.
# The enricher spawns a cache_log process per pod, each with its own CI link.
K8S_ENRICHER_PID=""
node --experimental-strip-types --no-warnings "${SCRIPT_DIR}/k8s_enricher.ts" "${NAMESPACE}" --cache-log &
K8S_ENRICHER_PID=$!

cleanup_enricher() {
  if [[ -n "${K8S_ENRICHER_PID:-}" ]]; then
    kill "${K8S_ENRICHER_PID}" 2>/dev/null || true
    wait "${K8S_ENRICHER_PID}" 2>/dev/null || true
  fi
}
trap cleanup_enricher EXIT

# DRY helper to init/plan/apply/destroy a terraform module
tf_run() {
  local dir="$1"
  local destroy_flag="$2"
  local create_flag="$3"

  terraform -chdir="${dir}" init -reconfigure
  if [[ "${destroy_flag}" == "true" ]]; then
    terraform -chdir="${dir}" destroy -auto-approve
  fi
  if [[ "${create_flag}" == "true" ]]; then
    terraform -chdir="${dir}" plan -out=tfplan
    terraform -chdir="${dir}" apply tfplan
  fi
}
export -f tf_run

# -------------------------------------------------------
# Optionally deploy Ethereum devnet; otherwise use env URLs
# -------------------------------------------------------
CSV_RPC_URLS=""
L1_RPC_URLS_JSON="[]"
L1_CONSENSUS_HOST_URLS_JSON="[]"
L1_CONSENSUS_HOST_API_KEYS_JSON="[]"
L1_CONSENSUS_HOST_API_KEY_HEADERS_JSON="[]"

if [[ "${CREATE_ETH_DEVNET}" == "true" ]]; then
  log "CREATE_ETH_DEVNET=true - deploying Ethereum devnet"
  ETH_DEVNET_START=$(date +%s)

  DEPLOY_ETH_DEVNET_DIR="${SCRIPT_DIR}/../terraform/deploy-eth-devnet"
  cat > "${DEPLOY_ETH_DEVNET_DIR}/terraform.tfvars" << EOF
project = "${GCP_PROJECT_ID}"
region = "${GCP_REGION}"
K8S_CLUSTER_CONTEXT = "${K8S_CLUSTER_CONTEXT}"
RELEASE_PREFIX = "${NAMESPACE}"
NAMESPACE = "${NAMESPACE}"
ETH_DEVNET_VALUES = "eth-devnet.yaml"
MNEMONIC = "${LABS_INFRA_MNEMONIC}"
CHAIN_ID = "${ETHEREUM_CHAIN_ID}"
BLOCK_TIME = ${ETHEREUM_BLOCK_TIME}
GAS_LIMIT = ${ETHEREUM_GAS_LIMIT}
PREFUNDED_MNEMONIC_INDICES = "${LABS_INFRA_INDICES}"
RESOURCE_PROFILE = "${RESOURCE_PROFILE}"
USE_LOAD_BALANCERS = ${USE_LOAD_BALANCERS:-false}
EOF

  "${SCRIPT_DIR}/override_terraform_backend.sh" "${DEPLOY_ETH_DEVNET_DIR}" "${CLUSTER}" "${BASE_STATE_PATH}/deploy-eth-devnet"
  k8s_denoise "tf_run "${DEPLOY_ETH_DEVNET_DIR}" "${DESTROY_ETH_DEVNET}" "${CREATE_ETH_DEVNET}""

  L1_RPC_URL=$(terraform -chdir="${DEPLOY_ETH_DEVNET_DIR}" output -raw eth_execution_rpc_url)
  L1_CONSENSUS_HOST_URL=$(terraform -chdir="${DEPLOY_ETH_DEVNET_DIR}" output -raw eth_beacon_api_url)
  STAGE_TIMINGS[eth_devnet]=$(($(date +%s) - ETH_DEVNET_START))
  [[ -n "${L1_RPC_URL}" ]] || die "Failed to fetch eth_execution_rpc_url"
  [[ -n "${L1_CONSENSUS_HOST_URL}" ]] || die "Failed to fetch eth_beacon_api_url"

  # For downstream modules
  CSV_RPC_URLS="${L1_RPC_URL}"
  L1_RPC_URLS_JSON="[\"${L1_RPC_URL}\"]"
  L1_CONSENSUS_HOST_URLS_JSON="[\"${L1_CONSENSUS_HOST_URL}\"]"
  # These can be null
  # L1_CONSENSUS_HOST_API_KEYS_JSON=
  # L1_CONSENSUS_HOST_API_KEY_HEADERS_JSON=
else
  log "CREATE_ETH_DEVNET=false - using environment-provided Ethereum endpoints"

  # Expect ETHEREUM_RPC_URLS (JSON array), and consensus host arrays and keys
  if [[ -z "${ETHEREUM_RPC_URLS:-}" ]]; then
    die "ETHEREUM_RPC_URLS is not set (expected JSON array, e.g. [\"https://...\"])"
  fi

  CSV_RPC_URLS=$(echo "${ETHEREUM_RPC_URLS}" | jq -r 'join(",")')

  L1_RPC_URLS_JSON="${ETHEREUM_RPC_URLS}"
  L1_CONSENSUS_HOST_URLS_JSON="${ETHEREUM_CONSENSUS_HOST_URLS:-[]}"
  L1_CONSENSUS_HOST_API_KEYS_JSON="${ETHEREUM_CONSENSUS_HOST_API_KEYS:-[]}"
  L1_CONSENSUS_HOST_API_KEY_HEADERS_JSON="${ETHEREUM_CONSENSUS_HOST_API_KEY_HEADERS:-[]}"
fi

# -------------------------------
# Load YAML config (tfvars JSON)
# -------------------------------
# Load the structured {deploy, env, releases} tfvars JSON once here so both
# the rollup-contracts and aztec-infra modules can use it without a second
# round of YAML merging and GCP secret fetches.
if [[ -n "${NETWORK_TFVARS_JSON:-}" && -f "${NETWORK_TFVARS_JSON}" ]]; then
  LOADER_JSON=$(cat "${NETWORK_TFVARS_JSON}")
else
  LOADER_JSON=$("${SCRIPT_DIR}/load_network_config.sh" "${NETWORK_YAML}" --format=tfvars)
fi

# -------------------------------
# Deploy rollup contracts
# -------------------------------

if [[ "${VERIFY_CONTRACTS:-}" == "true" && "${ETHEREUM_CHAIN_ID}" == "1337" ]]; then
  die "Cannot verify contracts deployed to eth-devnet"
fi

# Check for ETHERSCAN_API_KEY when VERIFY_CONTRACTS is enabled
# Contract verification happens automatically in the yarn-project code when on mainnet/sepolia
# and ETHERSCAN_API_KEY is set. This check ensures we fail early if verification is expected.
if [[ "${VERIFY_CONTRACTS:-}" == "true" && "${CREATE_ROLLUP_CONTRACTS}" == "true" && -z "${ETHERSCAN_API_KEY:-}" ]]; then
  die "Error: ETHERSCAN_API_KEY is not set but VERIFY_CONTRACTS=true. Contract verification requires an Etherscan API key. Set ETHERSCAN_API_KEY environment variable."
fi

ROLLUP_CONTRACTS_START=$(date +%s)
DEPLOY_ROLLUP_CONTRACTS_DIR="${SCRIPT_DIR}/../terraform/deploy-rollup-contracts"
"${SCRIPT_DIR}/override_terraform_backend.sh" "${DEPLOY_ROLLUP_CONTRACTS_DIR}" "${CLUSTER}" "${BASE_STATE_PATH}/deploy-rollup-contracts"

# Handle ETHERSCAN_API_KEY - only set when deploying or redeploying contracts
if [[ "${VERIFY_CONTRACTS:-}" == "true" && "${CREATE_ROLLUP_CONTRACTS}" == "true" ]]; then
  ETHERSCAN_API_KEY_TF="\"${ETHERSCAN_API_KEY:-}\""
else
  ETHERSCAN_API_KEY_TF=null
fi

# Destroy-only runs may omit AZTEC_DOCKER_IMAGE, but Terraform still evaluates
# the current resource config before destroying state.
ROLLUP_CONTRACTS_DOCKER_IMAGE="${AZTEC_DOCKER_IMAGE:-aztecprotocol/aztec:latest}"

rm -f "${DEPLOY_ROLLUP_CONTRACTS_DIR}/terraform.tfvars"
echo "${LOADER_JSON}" | jq \
  --arg k8s_context    "${K8S_CLUSTER_CONTEXT}" \
  --arg image          "${ROLLUP_CONTRACTS_DOCKER_IMAGE}" \
  --arg l1_rpc_urls    "${CSV_RPC_URLS}" \
  --arg private_key    "${ROLLUP_DEPLOYMENT_PRIVATE_KEY}" \
  --arg validators     "${VALIDATOR_ADDRESSES}" \
  --arg verify         "${VERIFY_CONTRACTS:-false}" \
  --argjson etherscan  "${ETHERSCAN_API_KEY_TF}" \
  '{
    deploy: (.deploy + {
      K8S_CLUSTER_CONTEXT:           $k8s_context,
      AZTEC_DOCKER_IMAGE:            $image,
      L1_RPC_URLS:                   $l1_rpc_urls,
      PRIVATE_KEY:                   $private_key,
      VALIDATORS:                    $validators,
      VERIFY_CONTRACTS:              $verify,
      ETHERSCAN_API_KEY:             $etherscan,
      JOB_NAME:                      "deploy-rollup-contracts",
      JOB_BACKOFF_LIMIT:             "3",
      JOB_TTL_SECONDS_AFTER_FINISHED: "3600"
    }),
    env: .env
  }' \
  > "${DEPLOY_ROLLUP_CONTRACTS_DIR}/terraform.tfvars.json"

# Check terraform state for existing contract addresses
# This avoids redeploying contracts when the k8s job has been cleaned up by TTL
k8s_denoise "terraform -chdir=${DEPLOY_ROLLUP_CONTRACTS_DIR} init -reconfigure >/dev/null"
EXISTING_REGISTRY=$(terraform -chdir="${DEPLOY_ROLLUP_CONTRACTS_DIR}" output -raw registry_address 2>/dev/null | grep -E '^0x[a-fA-F0-9]{40}$' || true)

if [[ "${USE_NETWORK_CONFIG:-false}" == "true" ]]; then
    log "Using network configuration, skipping contracts deployment"
else
  if [[ -n "${EXISTING_REGISTRY}" && "${CREATE_ROLLUP_CONTRACTS}" != "true" ]]; then
    log "Contracts already deployed (registry=${EXISTING_REGISTRY}), skipping deployment"
  else
    if [[ "${CREATE_ROLLUP_CONTRACTS}" == "true" ]]; then
      log "CREATE_ROLLUP_CONTRACTS=true, destroying existing deployment"
      k8s_denoise "terraform -chdir="${DEPLOY_ROLLUP_CONTRACTS_DIR}" destroy -auto-approve"
    fi
    k8s_denoise "terraform -chdir=${DEPLOY_ROLLUP_CONTRACTS_DIR} plan -out=tfplan"
    k8s_denoise "terraform -chdir=${DEPLOY_ROLLUP_CONTRACTS_DIR} apply tfplan"
  fi
fi

STAGE_TIMINGS[rollup_contracts]=$(($(date +%s) - ROLLUP_CONTRACTS_START))
log "Rollup contracts ready"

if [[ "${USE_NETWORK_CONFIG:-false}" != "true" ]]; then
  REGISTRY_ADDRESS=$(terraform -chdir="${DEPLOY_ROLLUP_CONTRACTS_DIR}" output -raw registry_address)
  FEE_ASSET_HANDLER_ADDRESS=$(terraform -chdir="${DEPLOY_ROLLUP_CONTRACTS_DIR}" output -raw fee_asset_handler_address)

  [[ -n "${REGISTRY_ADDRESS}" ]] || die "Failed to fetch registry_address"
  [[ -n "${FEE_ASSET_HANDLER_ADDRESS}" ]] || die "Failed to fetch fee_asset_handler_address"
  log "Contract addresses: registry=${REGISTRY_ADDRESS}, fee_asset_handler=${FEE_ASSET_HANDLER_ADDRESS}"
else
  REGISTRY_ADDRESS="${REGISTRY_ADDRESS:-}"
  FEE_ASSET_HANDLER_ADDRESS="${FEE_ASSET_HANDLER_ADDRESS:-}"
fi


# -------------------------------
# Generate admin API key
# -------------------------------
# Generate a fresh key on every deploy; the hash goes to validators and the
# raw key is stored as a K8s Secret for the test runner to retrieve later.
# The raw key is never logged.
ADMIN_API_KEY=$(openssl rand -hex 32)
ADMIN_API_KEY_HASH=$(printf '%s' "$ADMIN_API_KEY" | sha256sum | cut -d' ' -f1)
kubectl create secret generic aztec-admin-api-key \
  --from-literal=key="$ADMIN_API_KEY" \
  --namespace "${NAMESPACE}" \
  --dry-run=client -o yaml | kubectl apply -f -
unset ADMIN_API_KEY

# -------------------------------
# Deploy Aztec infra
# -------------------------------
AZTEC_INFRA_START=$(date +%s)
DEPLOY_AZTEC_INFRA_DIR="${SCRIPT_DIR}/../terraform/deploy-aztec-infra"
"${SCRIPT_DIR}/override_terraform_backend.sh" "${DEPLOY_AZTEC_INFRA_DIR}" "${CLUSTER}" "${BASE_STATE_PATH}/deploy-aztec-infra"

# Gate NodePort based on cluster (true for kind, false for GKE)
if [[ "${CLUSTER}" == "kind" ]]; then
  P2P_NODEPORT_ENABLED=true
  P2P_PUBLIC_IP=false
else
  P2P_NODEPORT_ENABLED=false
  P2P_PUBLIC_IP=${P2P_PUBLIC_IP:-true}
fi

# Build deploy-aztec-infra/terraform.tfvars.json from the YAML loader's
# structured {deploy, env, releases} output plus deploy-time-computed values
# overlaid on the deploy block (cluster context, image overrides, contract
# addresses from the rollup-contracts step, admin API key hash, mnemonic
# plumbing, P2P cluster gating, L1 endpoints, R2-derived URLs).
#
# main.tf reads everything via var.deploy.<KEY> / var.env / var.releases --
# no individual `variable "X"` declarations remain in variables.tf.
#
# Stale terraform.tfvars (HCL) is removed first; Terraform reads both formats
# but a leftover HCL file can shadow the JSON one.
rm -f "${DEPLOY_AZTEC_INFRA_DIR}/terraform.tfvars"

# LOADER_JSON was loaded before the rollup-contracts step; reuse it here.

DEPLOY_OVERRIDES=$(jq -n \
  --arg namespace "${NAMESPACE}" \
  --arg release_prefix "${NAMESPACE}" \
  --arg cluster_context "${K8S_CLUSTER_CONTEXT}" \
  --arg image "${AZTEC_DOCKER_IMAGE}" \
  --arg prover_image "${PROVER_AGENT_DOCKER_IMAGE:-$AZTEC_DOCKER_IMAGE}" \
  --arg ha_image "${VALIDATOR_HA_DOCKER_IMAGE:-}" \
  --arg admin_api_key_hash "${ADMIN_API_KEY_HASH}" \
  --arg registry "${REGISTRY_ADDRESS}" \
  --arg fee_handler "${FEE_ASSET_HANDLER_ADDRESS}" \
  --arg l1_chain_id "${ETHEREUM_CHAIN_ID}" \
  --arg validator_mnemonic "${LABS_INFRA_MNEMONIC}" \
  --arg p2p_nodeport_enabled "${P2P_NODEPORT_ENABLED}" \
  --arg p2p_public_ip "${P2P_PUBLIC_IP}" \
  --arg gcp_project "${GCP_PROJECT_ID}" \
  --arg gcp_region "${GCP_REGION}" \
  --arg validator_resource "${VALIDATOR_RESOURCE_PROFILE}" \
  --arg prover_resource "${PROVER_RESOURCE_PROFILE}" \
  --arg rpc_resource "${RPC_RESOURCE_PROFILE}" \
  --arg full_node_resource "${FULL_NODE_RESOURCE_PROFILE}" \
  --arg p2p_bootstrap_resource "${P2P_BOOTSTRAP_RESOURCE_PROFILE}" \
  --arg archive_resource "${ARCHIVE_RESOURCE_PROFILE}" \
  --arg blob_sink_resource "${BLOB_SINK_RESOURCE_PROFILE}" \
  --arg bot_resource "${BOT_RESOURCE_PROFILE}" \
  --arg prover_real_proofs "${PROVER_REAL_PROOFS}" \
  --argjson l1_rpc_urls "${L1_RPC_URLS_JSON}" \
  --argjson l1_consensus_urls "${L1_CONSENSUS_HOST_URLS_JSON}" \
  --argjson l1_consensus_keys "${L1_CONSENSUS_HOST_API_KEYS_JSON:-null}" \
  --argjson l1_consensus_headers "${L1_CONSENSUS_HOST_API_KEY_HEADERS_JSON:-null}" \
  '{
    NAMESPACE: $namespace,
    RELEASE_PREFIX: $release_prefix,
    K8S_CLUSTER_CONTEXT: $cluster_context,
    GCP_PROJECT_ID: $gcp_project,
    GCP_REGION: $gcp_region,
    AZTEC_DOCKER_IMAGE: $image,
    PROVER_AGENT_DOCKER_IMAGE: $prover_image,
    VALIDATOR_HA_DOCKER_IMAGE: $ha_image,
    ADMIN_API_KEY_HASH: $admin_api_key_hash,
    REGISTRY_CONTRACT_ADDRESS: $registry,
    FEE_ASSET_HANDLER_CONTRACT_ADDRESS: $fee_handler,
    L1_CHAIN_ID: $l1_chain_id,
    L1_RPC_URLS: $l1_rpc_urls,
    L1_CONSENSUS_HOST_URLS: $l1_consensus_urls,
    L1_CONSENSUS_HOST_API_KEYS: $l1_consensus_keys,
    L1_CONSENSUS_HOST_API_KEY_HEADERS: $l1_consensus_headers,
    VALIDATOR_MNEMONIC: $validator_mnemonic,
    PROVER_MNEMONIC: $validator_mnemonic,
    BOT_MNEMONIC: $validator_mnemonic,
    FISHERMAN_MNEMONIC: $validator_mnemonic,
    P2P_NODEPORT_ENABLED: $p2p_nodeport_enabled,
    P2P_PUBLIC_IP: $p2p_public_ip,
    VALIDATOR_RESOURCE_PROFILE: $validator_resource,
    PROVER_RESOURCE_PROFILE: $prover_resource,
    RPC_RESOURCE_PROFILE: $rpc_resource,
    FULL_NODE_RESOURCE_PROFILE: $full_node_resource,
    P2P_BOOTSTRAP_RESOURCE_PROFILE: $p2p_bootstrap_resource,
    ARCHIVE_RESOURCE_PROFILE: $archive_resource,
    BLOB_SINK_RESOURCE_PROFILE: $blob_sink_resource,
    BOT_RESOURCE_PROFILE: $bot_resource,
    PROVER_REAL_PROOFS: $prover_real_proofs,
  }')

echo "${LOADER_JSON}" | jq \
  --argjson overrides "${DEPLOY_OVERRIDES}" \
  '.deploy = (.deploy + $overrides)' \
  > "${DEPLOY_AZTEC_INFRA_DIR}/terraform.tfvars.json"

k8s_denoise "tf_run "${DEPLOY_AZTEC_INFRA_DIR}" "${DESTROY_AZTEC_INFRA}" "${CREATE_AZTEC_INFRA}""
STAGE_TIMINGS[aztec_infra]=$(($(date +%s) - AZTEC_INFRA_START))
log "Deployed aztec infra"

# -------------------------------------------------------
# Optionally install chaos mesh scenarios after Aztec infra
# -------------------------------------------------------
# Chaos Mesh resolves pod selectors at experiment creation time, so the target
# pods must already exist. The chaos-daemon injects iptables DROP rules into
# each matched pod's network namespace. For partition experiments, this
# immediately blocks packets between the partitioned pods, causing existing
# TCP connections to timeout and preventing new ones from forming.
#
# IMPORTANT: Do NOT restart pods after chaos injection. Chaos Mesh does not
# automatically re-inject rules into recreated pods, leaving them unpartitioned.
if [[ -n "${CHAOS_MESH_SCENARIOS_FILE:-}" ]]; then
  CHAOS_SCENARIOS_DIR="${SCRIPT_DIR}/../aztec-chaos-scenarios"
  log "Installing chaos mesh scenarios from ${CHAOS_MESH_SCENARIOS_FILE}"
  helm upgrade --install network-shaping "${CHAOS_SCENARIOS_DIR}" \
    --namespace "${NAMESPACE}" \
    --values "${CHAOS_SCENARIOS_DIR}/values/${CHAOS_MESH_SCENARIOS_FILE}" \
    --set "global.targetNamespace=${NAMESPACE}" \
    --wait --timeout=5m
  log "Chaos mesh scenarios installed, waiting for rules to be injected..."

  # Wait for all NetworkChaos experiments to have their rules injected.
  # The AllInjected condition confirms iptables rules are active on every matched pod.
  CHAOS_WAIT_TIMEOUT=120
  CHAOS_WAITED=0
  while true; do
    NOT_INJECTED=$(kubectl get networkchaos -n "${NAMESPACE}" -o jsonpath='{range .items[*]}{.status.conditions[?(@.type=="AllInjected")].status}{"\n"}{end}' 2>/dev/null | grep -c "False" || true)
    if [[ "${NOT_INJECTED}" -eq 0 ]]; then
      log "All chaos mesh rules injected"
      break
    fi
    if [[ "${CHAOS_WAITED}" -ge "${CHAOS_WAIT_TIMEOUT}" ]]; then
      log "WARNING: Timed out waiting for chaos mesh injection after ${CHAOS_WAIT_TIMEOUT}s (${NOT_INJECTED} experiments not yet injected)"
      break
    fi
    sleep 5
    CHAOS_WAITED=$((CHAOS_WAITED + 5))
  done
  log "Chaos mesh partition active — existing connections will break as packets are dropped"
fi

# Calculate total deployment time
DEPLOY_END_TIME=$(date +%s)
TOTAL_DEPLOY_TIME=$((DEPLOY_END_TIME - DEPLOY_START_TIME))

# Output benchmark JSON for CI benchmarks
mkdir -p "${SCRIPT_DIR}/../bench-out"
BENCH_OUTPUT="${SCRIPT_DIR}/../bench-out/network_deploy.bench.json"

# Build benchmark JSON array
BENCH_JSON='['
BENCH_JSON+='{"name": "ci/network_deploy/total", "value": '"${TOTAL_DEPLOY_TIME}"', "unit": "seconds"}'

if [[ -n "${STAGE_TIMINGS[eth_devnet]:-}" ]]; then
  BENCH_JSON+=',{"name": "ci/network_deploy/eth_devnet", "value": '"${STAGE_TIMINGS[eth_devnet]}"', "unit": "seconds"}'
fi

BENCH_JSON+=',{"name": "ci/network_deploy/rollup_contracts", "value": '"${STAGE_TIMINGS[rollup_contracts]}"', "unit": "seconds"}'
BENCH_JSON+=',{"name": "ci/network_deploy/aztec_infra", "value": '"${STAGE_TIMINGS[aztec_infra]}"', "unit": "seconds"}'
BENCH_JSON+=']'

echo "${BENCH_JSON}" | jq '.' > "${BENCH_OUTPUT}"
log "Benchmark JSON written to ${BENCH_OUTPUT}"

log "Total deployment time: ${TOTAL_DEPLOY_TIME} seconds"
