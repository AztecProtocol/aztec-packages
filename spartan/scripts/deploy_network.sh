#!/bin/bash

set -euo pipefail

# Resolve repo root and script directory for reliable relative paths
REPO_ROOT="$(git rev-parse --show-toplevel)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

source "${REPO_ROOT}/ci3/source"

# Basic logging helpers
log() { echo "[INFO]  $(date -Is) - $*"; }
err() { echo "[ERROR] $(date -Is) - $*" >&2; }
die() { err "$*"; exit 1; }

########################
# TIMING INSTRUMENTATION
########################
# Capture deployment timings for CI benchmarks
DEPLOY_START_TIME=$(date +%s)
declare -A STAGE_TIMINGS

########################
# GLOBAL VARIABLES
########################
NAMESPACE=${NAMESPACE} # required
CLUSTER=${CLUSTER:-kind}
RESOURCE_PROFILE=$([[ "${CLUSTER}" == "kind" ]] && echo "dev" || echo "prod")
BASE_STATE_PATH="${CLUSTER}/${NAMESPACE}"

# Don't try and retrieve contract addresses, instead allow deployed infra to read from network config
USE_NETWORK_CONFIG=${USE_NETWORK_CONFIG:-false}

# GCP variables, unused if running on kind
GCP_PROJECT_ID=${GCP_PROJECT_ID:-testnet-440309}
GCP_REGION=${GCP_REGION:-us-west1-a}

########################
# ETHEREUM / DEVNET VARIABLES
########################
DESTROY_ETH_DEVNET=${DESTROY_ETH_DEVNET:-false}
CREATE_ETH_DEVNET=${CREATE_ETH_DEVNET:-false}
ETHEREUM_CHAIN_ID=${ETHEREUM_CHAIN_ID:-1337}
ETHEREUM_BLOCK_TIME=${ETHEREUM_BLOCK_TIME:-12}
ETHEREUM_GAS_LIMIT=${ETHEREUM_GAS_LIMIT:-100000000}
LABS_INFRA_MNEMONIC=${LABS_INFRA_MNEMONIC:-test test test test test test test test test test test junk}
LABS_INFRA_INDICES=${LABS_INFRA_INDICES:-0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,1000}

########################
# ROLLUP VARIABLES
########################
REDEPLOY_ROLLUP_CONTRACTS=${REDEPLOY_ROLLUP_CONTRACTS:-false}
CREATE_ROLLUP_CONTRACTS=${CREATE_ROLLUP_CONTRACTS:-true}
SPONSORED_FPC=${SPONSORED_FPC:-true}
TEST_ACCOUNTS=${TEST_ACCOUNTS:-false}
REAL_VERIFIER=${REAL_VERIFIER:-true}


########################
# AZTEC INFRA VARIABLES
########################
DESTROY_AZTEC_INFRA=${DESTROY_AZTEC_INFRA:-false}
CREATE_AZTEC_INFRA=${CREATE_AZTEC_INFRA:-true}


LABS_INFRA_MNEMONIC=${LABS_INFRA_MNEMONIC:-test test test test test test test test test test test junk}
ROLLUP_DEPLOYMENT_PRIVATE_KEY=${ROLLUP_DEPLOYMENT_PRIVATE_KEY:-$(cast wallet private-key --mnemonic "$LABS_INFRA_MNEMONIC" --mnemonic-index 0)}

VALIDATOR_INDICES=${VALIDATOR_INDICES:-1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48}
VALIDATOR_MNEMONIC_START_INDEX=${VALIDATOR_MNEMONIC_START_INDEX:-1}
VALIDATORS_PER_NODE=${VALIDATORS_PER_NODE:-12}
VALIDATOR_REPLICAS=${VALIDATOR_REPLICAS:-4}
VALIDATOR_PUBLISHER_MNEMONIC_START_INDEX=${VALIDATOR_PUBLISHER_MNEMONIC_START_INDEX:-5000}
PUBLISHERS_PER_VALIDATOR_KEY=${PUBLISHERS_PER_VALIDATOR_KEY:-2}
PROVER_PUBLISHER_MNEMONIC_START_INDEX=${PROVER_PUBLISHER_MNEMONIC_START_INDEX:-8000}
PUBLISHERS_PER_PROVER=${PUBLISHERS_PER_PROVER:-1}
PROVER_REAL_PROOFS=${REAL_VERIFIER:-true}

PROVER_AGENT_POLL_INTERVAL_MS=${PROVER_AGENT_POLL_INTERVAL_MS:-1000}

STORE_SNAPSHOT_URL_TF=""
if [[ -n "${STORE_SNAPSHOT_URL:-}" ]]; then
  STORE_SNAPSHOT_URL_TF="\"$STORE_SNAPSHOT_URL\""
else
  STORE_SNAPSHOT_URL_TF="null"
fi

PROVER_FAILED_PROOF_STORE=${PROVER_FAILED_PROOF_STORE:-}
SEQ_MIN_TX_PER_BLOCK=${SEQ_MIN_TX_PER_BLOCK:-0}
SEQ_MAX_TX_PER_BLOCK=${SEQ_MAX_TX_PER_BLOCK:-8}
PROVER_REPLICAS=${PROVER_REPLICAS:-4}
PROVER_AGENTS_PER_PROVER=${PROVER_AGENTS_PER_PROVER:-1}
R2_ACCESS_KEY_ID=${R2_ACCESS_KEY_ID:-}
R2_SECRET_ACCESS_KEY=${R2_SECRET_ACCESS_KEY:-}

OTEL_COLLECTOR_ENDPOINT=${OTEL_COLLECTOR_ENDPOINT:-}
DEPLOY_INTERNAL_BOOTNODE=${DEPLOY_INTERNAL_BOOTNODE:-}
DEPLOY_ARCHIVAL_NODE=${DEPLOY_ARCHIVAL_NODE:-false}

BOT_RESOURCE_PROFILE=${BOT_RESOURCE_PROFILE:-${RESOURCE_PROFILE}}
BOT_TRANSFERS_MNEMONIC_START_INDEX=${BOT_TRANSFERS_MNEMONIC_START_INDEX:-7000}
BOT_SWAPS_MNEMONIC_START_INDEX=${BOT_SWAPS_MNEMONIC_START_INDEX:-7100}
BOT_TRANSFERS_REPLICAS=${BOT_TRANSFERS_REPLICAS:-0}
BOT_SWAPS_REPLICAS=${BOT_SWAPS_REPLICAS:-0}
BOT_TRANSFERS_TX_INTERVAL_SECONDS=${BOT_TRANSFERS_TX_INTERVAL_SECONDS:-60}
BOT_SWAPS_TX_INTERVAL_SECONDS=${BOT_SWAPS_TX_INTERVAL_SECONDS:-60}
BOT_TRANSFERS_FOLLOW_CHAIN=${BOT_TRANSFERS_FOLLOW_CHAIN:-NONE}
BOT_SWAPS_FOLLOW_CHAIN=${BOT_SWAPS_FOLLOW_CHAIN:-NONE}

RPC_INGRESS_ENABLED=${RPC_INGRESS_ENABLED:-false}
RPC_INGRESS_HOST=${RPC_INGRESS_HOST:-}
RPC_INGRESS_STATIC_IP_NAME=${RPC_INGRESS_STATIC_IP_NAME:-}
RPC_INGRESS_SSL_CERT_NAME=${RPC_INGRESS_SSL_CERT_NAME:-}
RPC_REPLICAS=${RPC_REPLICAS:-1}
FULL_NODE_REPLICAS=${FULL_NODE_REPLICAS:-0}
FISHERMAN_MNEMONIC_START_INDEX=${FISHERMAN_MNEMONIC_START_INDEX:-1}

RPC_RESOURCE_PROFILE=${RPC_RESOURCE_PROFILE:-${RESOURCE_PROFILE}}

FULL_NODE_RESOURCE_PROFILE=${FULL_NODE_RESOURCE_PROFILE:-${RESOURCE_PROFILE}}

P2P_BOOTSTRAP_RESOURCE_PROFILE=${P2P_BOOTSTRAP_RESOURCE_PROFILE:-${RESOURCE_PROFILE}}
VALIDATOR_RESOURCE_PROFILE=${VALIDATOR_RESOURCE_PROFILE:-${RESOURCE_PROFILE}}
PROVER_RESOURCE_PROFILE=${PROVER_RESOURCE_PROFILE:-${RESOURCE_PROFILE}}

PROVER_NODE_DISABLE_PROOF_PUBLISH=${PROVER_NODE_DISABLE_PROOF_PUBLISH:-false}
P2P_TX_POOL_DELETE_TXS_AFTER_REORG=${P2P_TX_POOL_DELETE_TXS_AFTER_REORG:-false}

P2P_MAX_TX_POOL_SIZE=${P2P_MAX_TX_POOL_SIZE:-100000000}
PROVER_TEST_DELAY_TYPE=${PROVER_TEST_DELAY_TYPE:-"fixed"}
PROVER_TEST_VERIFICATION_DELAY_MS=${PROVER_TEST_VERIFICATION_DELAY_MS:-10}

DEBUG_P2P_INSTRUMENT_MESSAGES=${DEBUG_P2P_INSTRUMENT_MESSAGES:-false}

PROVER_AGENT_INCLUDE_METRICS=${PROVER_AGENT_INCLUDE_METRICS:-}
FULL_NODE_INCLUDE_METRICS=${FULL_NODE_INCLUDE_METRICS:-}
FISHERMAN_MODE=${FISHERMAN_MODE:-false}

LOG_LEVEL=${LOG_LEVEL:-info}
FISHERMAN_LOG_LEVEL=${FISHERMAN_LOG_LEVEL:-${LOG_LEVEL}}

BLOB_ALLOW_EMPTY_SOURCES=${BLOB_ALLOW_EMPTY_SOURCES:-false}

P2P_GOSSIPSUB_D=${P2P_GOSSIPSUB_D:-6}
P2P_GOSSIPSUB_DLO=${P2P_GOSSIPSUB_DLO:-4}
P2P_GOSSIPSUB_DHI=${P2P_GOSSIPSUB_DHI:-12}

P2P_DROP_TX=${P2P_DROP_TX:-false}
P2P_DROP_TX_CHANCE=${P2P_DROP_TX_CHANCE:-0}

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
TOTAL_VALIDATOR_KEYS=$((VALIDATOR_REPLICAS * VALIDATORS_PER_NODE))
TOTAL_VALIDATOR_PUBLISHERS=$((TOTAL_VALIDATOR_KEYS * PUBLISHERS_PER_VALIDATOR_KEY))

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

# Ensure docker image provided
if [[ -z "${AZTEC_DOCKER_IMAGE:-}" ]]; then
  die "AZTEC_DOCKER_IMAGE is not set"
fi

K8S_CLUSTER_CONTEXT=$(kubectl config current-context)

if [[ "${DESTROY_NAMESPACE:-}" == "true" ]]; then
  kubectl delete namespace "${NAMESPACE}" --ignore-not-found=true
fi

# Create the namespace if it doesn't exist
kubectl get namespace "${NAMESPACE}" >/dev/null 2>&1 || kubectl create namespace "${NAMESPACE}"

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
EOF

  "${SCRIPT_DIR}/override_terraform_backend.sh" "${DEPLOY_ETH_DEVNET_DIR}" "${CLUSTER}" "${BASE_STATE_PATH}/deploy-eth-devnet"
  tf_run "${DEPLOY_ETH_DEVNET_DIR}" "${DESTROY_ETH_DEVNET}" "${CREATE_ETH_DEVNET}"

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
# Deploy rollup contracts
# -------------------------------

# Handle NETWORK variable - needs quotes for string values, null for unset
if [[ -n "${NETWORK:-}" ]]; then
  NETWORK_TF="\"${NETWORK}\""
else
  NETWORK_TF=null
fi

if [[ "${VERIFY_CONTRACTS:-}" == "true" && "${ETHEREUM_CHAIN_ID}" == "1337" ]]; then
  die "Cannot verify contracts deployed to eth-devnet"
fi

# Check for ETHERSCAN_API_KEY when VERIFY_CONTRACTS is enabled
if [[ "${VERIFY_CONTRACTS:-}" == "true" && "${CREATE_ROLLUP_CONTRACTS}" == "true" && -z "${ETHERSCAN_API_KEY:-}" ]]; then
  die "Error: ETHERSCAN_API_KEY is not set but VERIFY_CONTRACTS=true. Contract verification requires an Etherscan API key. Set ETHERSCAN_API_KEY environment variable."
fi

ROLLUP_CONTRACTS_START=$(date +%s)
DEPLOY_ROLLUP_CONTRACTS_DIR="${SCRIPT_DIR}/../terraform/deploy-rollup-contracts"
"${SCRIPT_DIR}/override_terraform_backend.sh" "${DEPLOY_ROLLUP_CONTRACTS_DIR}" "${CLUSTER}" "${BASE_STATE_PATH}/deploy-rollup-contracts"

# Initialize terraform and check for existing state
terraform -chdir="${DEPLOY_ROLLUP_CONTRACTS_DIR}" init -reconfigure >/dev/null

# Migrate from old K8s-based terraform state if needed
# The old module had kubernetes_job and data.external resources that no longer exist
OLD_RESOURCES=$(terraform -chdir="${DEPLOY_ROLLUP_CONTRACTS_DIR}" state list 2>/dev/null | grep -E '^(kubernetes_|data\.external\.)' || true)
if [[ -n "${OLD_RESOURCES}" ]]; then
  log "Migrating terraform state: removing old K8s resources"
  for resource in ${OLD_RESOURCES}; do
    terraform -chdir="${DEPLOY_ROLLUP_CONTRACTS_DIR}" state rm "${resource}" >/dev/null 2>&1 || true
  done
fi

EXISTING_REGISTRY=$(terraform -chdir="${DEPLOY_ROLLUP_CONTRACTS_DIR}" output -raw registry_address 2>/dev/null | grep -E '^0x[a-fA-F0-9]{40}$' || true)

if [[ -n "${EXISTING_REGISTRY}" && "${REDEPLOY_ROLLUP_CONTRACTS}" != "true" ]]; then
  log "Contracts already deployed (registry=${EXISTING_REGISTRY}), loading from state"
  REGISTRY_ADDRESS="${EXISTING_REGISTRY}"
  SLASH_FACTORY_ADDRESS=$(terraform -chdir="${DEPLOY_ROLLUP_CONTRACTS_DIR}" output -raw slash_factory_address 2>/dev/null || true)
  FEE_ASSET_HANDLER_ADDRESS=$(terraform -chdir="${DEPLOY_ROLLUP_CONTRACTS_DIR}" output -raw fee_asset_handler_address 2>/dev/null || true)
  ROLLUP_ADDRESS=$(terraform -chdir="${DEPLOY_ROLLUP_CONTRACTS_DIR}" output -raw rollup_address 2>/dev/null || true)
else
  if [[ "${REDEPLOY_ROLLUP_CONTRACTS}" == "true" ]]; then
    log "REDEPLOY_ROLLUP_CONTRACTS=true, deploying fresh contracts"
  fi

  log "Deploying L1 contracts..."

  # Build CLI arguments
  CLI_ARGS=(
    "deploy-l1-contracts"
    "--l1-rpc-urls" "${CSV_RPC_URLS}"
    "--private-key" "${ROLLUP_DEPLOYMENT_PRIVATE_KEY}"
    "--l1-chain-id" "${ETHEREUM_CHAIN_ID}"
    "--json"
  )

  [[ -n "${VALIDATOR_ADDRESSES:-}" ]] && CLI_ARGS+=("--validators" "${VALIDATOR_ADDRESSES}")
  [[ "${SPONSORED_FPC}" == "true" ]] && CLI_ARGS+=("--sponsored-fpc")
  [[ "${TEST_ACCOUNTS}" == "true" ]] && CLI_ARGS+=("--test-accounts")
  [[ "${REAL_VERIFIER}" == "true" ]] && CLI_ARGS+=("--real-verifier")

  # Export AZTEC_* and other config env vars so the node process can read them
  export NETWORK ETHERSCAN_API_KEY LOG_LEVEL
  for var in ${!AZTEC_*}; do export "$var"; done

  # Run deployment and capture JSON output
  # The command outputs logs to stderr and JSON to stdout when --json is used
  CONTRACT_JSON=$(node --no-warnings "${REPO_ROOT}/yarn-project/aztec/dest/bin/index.js" \
    "${CLI_ARGS[@]}" 2>&1 | tee /dev/stderr | grep -E '^\{.*\}$' | tail -1) || true

  if [[ -z "${CONTRACT_JSON}" ]] || ! echo "${CONTRACT_JSON}" | jq -e '.registryAddress' >/dev/null 2>&1; then
    die "Failed to extract contract addresses from deployment output"
  fi

  # Extract addresses using jq
  REGISTRY_ADDRESS=$(echo "${CONTRACT_JSON}" | jq -r '.registryAddress')
  SLASH_FACTORY_ADDRESS=$(echo "${CONTRACT_JSON}" | jq -r '.slashFactoryAddress // empty')
  FEE_ASSET_HANDLER_ADDRESS=$(echo "${CONTRACT_JSON}" | jq -r '.feeAssetHandlerAddress // empty')
  ROLLUP_ADDRESS=$(echo "${CONTRACT_JSON}" | jq -r '.rollupAddress // empty')

  log "Deployed contracts: registry=${REGISTRY_ADDRESS}"

  # Save to terraform state for persistence
  cat > "${DEPLOY_ROLLUP_CONTRACTS_DIR}/terraform.tfvars" << EOF
registry_address          = "${REGISTRY_ADDRESS}"
slash_factory_address     = "${SLASH_FACTORY_ADDRESS:-}"
fee_asset_handler_address = "${FEE_ASSET_HANDLER_ADDRESS:-}"
rollup_address            = "${ROLLUP_ADDRESS:-}"
deployed_at               = "$(date -Is)"
EOF

  terraform -chdir="${DEPLOY_ROLLUP_CONTRACTS_DIR}" apply -auto-approve >/dev/null
  log "Contract addresses saved to terraform state"
fi

STAGE_TIMINGS[rollup_contracts]=$(($(date +%s) - ROLLUP_CONTRACTS_START))
log "Rollup contracts ready"

if [[ "${USE_NETWORK_CONFIG:-false}" != "true" ]]; then
  [[ -n "${REGISTRY_ADDRESS}" ]] || die "Failed to fetch registry_address"
  log "Contract addresses: registry=${REGISTRY_ADDRESS}, slash_factory=${SLASH_FACTORY_ADDRESS:-N/A}, fee_asset_handler=${FEE_ASSET_HANDLER_ADDRESS:-N/A}"
else
  REGISTRY_ADDRESS="${REGISTRY_ADDRESS:-}"
  SLASH_FACTORY_ADDRESS="${SLASH_FACTORY_ADDRESS:-}"
  FEE_ASSET_HANDLER_ADDRESS="${FEE_ASSET_HANDLER_ADDRESS:-}"
fi


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
  P2P_PUBLIC_IP=true
fi

cat > "${DEPLOY_AZTEC_INFRA_DIR}/terraform.tfvars" << EOF
K8S_CLUSTER_CONTEXT = "${K8S_CLUSTER_CONTEXT}"
RELEASE_PREFIX = "${NAMESPACE}"
NAMESPACE = "${NAMESPACE}"
GCP_PROJECT_ID = "${GCP_PROJECT_ID}"
GCP_REGION = "${GCP_REGION}"
R2_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID}"
R2_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY}"
P2P_BOOTSTRAP_RESOURCE_PROFILE = "${P2P_BOOTSTRAP_RESOURCE_PROFILE}"
VALIDATOR_RESOURCE_PROFILE = "${VALIDATOR_RESOURCE_PROFILE}"
PROVER_RESOURCE_PROFILE = "${PROVER_RESOURCE_PROFILE}"
RPC_RESOURCE_PROFILE = "${RPC_RESOURCE_PROFILE}"
FULL_NODE_RESOURCE_PROFILE = "${FULL_NODE_RESOURCE_PROFILE}"
AZTEC_DOCKER_IMAGE = "${AZTEC_DOCKER_IMAGE}"
SPONSORED_FPC = ${SPONSORED_FPC}
TEST_ACCOUNTS = ${TEST_ACCOUNTS}
L1_CHAIN_ID = "${ETHEREUM_CHAIN_ID}"
L1_RPC_URLS = ${L1_RPC_URLS_JSON}
L1_CONSENSUS_HOST_URLS = ${L1_CONSENSUS_HOST_URLS_JSON}
L1_CONSENSUS_HOST_API_KEYS = ${L1_CONSENSUS_HOST_API_KEYS_JSON:-null}
L1_CONSENSUS_HOST_API_KEY_HEADERS = ${L1_CONSENSUS_HOST_API_KEY_HEADERS_JSON:-null}
REGISTRY_CONTRACT_ADDRESS = "${REGISTRY_ADDRESS}"
SLASH_FACTORY_CONTRACT_ADDRESS = "${SLASH_FACTORY_ADDRESS}"
FEE_ASSET_HANDLER_CONTRACT_ADDRESS = "${FEE_ASSET_HANDLER_ADDRESS}"
VALIDATOR_MNEMONIC = "${LABS_INFRA_MNEMONIC}"
VALIDATOR_MNEMONIC_START_INDEX = ${VALIDATOR_MNEMONIC_START_INDEX}
VALIDATORS_PER_NODE = ${VALIDATORS_PER_NODE}
VALIDATOR_REPLICAS = ${VALIDATOR_REPLICAS}
VALIDATOR_PUBLISHERS_PER_VALIDATOR_KEY = ${PUBLISHERS_PER_VALIDATOR_KEY}
SEQ_MIN_TX_PER_BLOCK = ${SEQ_MIN_TX_PER_BLOCK}
SEQ_MAX_TX_PER_BLOCK = ${SEQ_MAX_TX_PER_BLOCK}
PROVER_MNEMONIC = "${LABS_INFRA_MNEMONIC}"
PROVER_PUBLISHER_MNEMONIC_START_INDEX = ${PROVER_PUBLISHER_MNEMONIC_START_INDEX}
PROVER_PUBLISHERS_PER_PROVER = ${PUBLISHERS_PER_PROVER}
SENTINEL_ENABLED = ${SENTINEL_ENABLED:-null}
SLASH_MIN_PENALTY_PERCENTAGE = ${SLASH_MIN_PENALTY_PERCENTAGE:-null}
SLASH_MAX_PENALTY_PERCENTAGE = ${SLASH_MAX_PENALTY_PERCENTAGE:-null}
SLASH_INACTIVITY_TARGET_PERCENTAGE = ${SLASH_INACTIVITY_TARGET_PERCENTAGE:-null}
SLASH_INACTIVITY_PENALTY = ${SLASH_INACTIVITY_PENALTY:-null}
SLASH_PRUNE_PENALTY = ${SLASH_PRUNE_PENALTY:-null}
SLASH_DATA_WITHHOLDING_PENALTY = ${SLASH_DATA_WITHHOLDING_PENALTY:-null}
SLASH_PROPOSE_INVALID_ATTESTATIONS_PENALTY = ${SLASH_PROPOSE_INVALID_ATTESTATIONS_PENALTY:-null}
SLASH_ATTEST_DESCENDANT_OF_INVALID_PENALTY = ${SLASH_ATTEST_DESCENDANT_OF_INVALID_PENALTY:-null}
SLASH_UNKNOWN_PENALTY = ${SLASH_UNKNOWN_PENALTY:-null}
SLASH_INVALID_BLOCK_PENALTY = ${SLASH_INVALID_BLOCK_PENALTY:-null}
SLASH_OFFENSE_EXPIRATION_ROUNDS = ${SLASH_OFFENSE_EXPIRATION_ROUNDS:-null}
SLASH_MAX_PAYLOAD_SIZE = ${SLASH_MAX_PAYLOAD_SIZE:-null}
OTEL_COLLECTOR_ENDPOINT = "${OTEL_COLLECTOR_ENDPOINT}"
DEPLOY_INTERNAL_BOOTNODE = ${DEPLOY_INTERNAL_BOOTNODE:-true}
PROVER_REAL_PROOFS = ${PROVER_REAL_PROOFS}
TRANSACTIONS_DISABLED = ${TRANSACTIONS_DISABLED:-null}
NETWORK = ${NETWORK_TF}
STORE_SNAPSHOT_URL = ${STORE_SNAPSHOT_URL_TF}
BOT_RESOURCE_PROFILE = "${BOT_RESOURCE_PROFILE}"
BOT_MNEMONIC = "${LABS_INFRA_MNEMONIC}"
BOT_TRANSFERS_MNEMONIC_START_INDEX = ${BOT_TRANSFERS_MNEMONIC_START_INDEX}
BOT_TRANSFERS_REPLICAS = ${BOT_TRANSFERS_REPLICAS}
BOT_TRANSFERS_TX_INTERVAL_SECONDS = ${BOT_TRANSFERS_TX_INTERVAL_SECONDS}
BOT_TRANSFERS_FOLLOW_CHAIN = "${BOT_TRANSFERS_FOLLOW_CHAIN}"
BOT_SWAPS_MNEMONIC_START_INDEX = ${BOT_SWAPS_MNEMONIC_START_INDEX}
BOT_SWAPS_REPLICAS = ${BOT_SWAPS_REPLICAS}
BOT_SWAPS_TX_INTERVAL_SECONDS = ${BOT_SWAPS_TX_INTERVAL_SECONDS}
BOT_SWAPS_FOLLOW_CHAIN = "${BOT_SWAPS_FOLLOW_CHAIN}"
BOT_TRANSFERS_L2_PRIVATE_KEY = "${BOT_TRANSFERS_L2_PRIVATE_KEY:-0xcafe01}"
BOT_SWAPS_L2_PRIVATE_KEY = "${BOT_SWAPS_L2_PRIVATE_KEY:-0xcafe02}"

PROVER_AGENTS_PER_PROVER = ${PROVER_AGENTS_PER_PROVER}
PROVER_AGENT_POLL_INTERVAL_MS = ${PROVER_AGENT_POLL_INTERVAL_MS}

RPC_INGRESS_ENABLED = ${RPC_INGRESS_ENABLED}
RPC_INGRESS_HOST = "${RPC_INGRESS_HOST}"
RPC_INGRESS_STATIC_IP_NAME = "${RPC_INGRESS_STATIC_IP_NAME}"
RPC_INGRESS_SSL_CERT_NAME = "${RPC_INGRESS_SSL_CERT_NAME}"
RPC_REPLICAS = ${RPC_REPLICAS:-1}
FISHERMAN_MODE = ${FISHERMAN_MODE}
FISHERMAN_MNEMONIC = "${LABS_INFRA_MNEMONIC}"
FISHERMAN_MNEMONIC_START_INDEX = ${FISHERMAN_MNEMONIC_START_INDEX}

FULL_NODE_REPLICAS = ${FULL_NODE_REPLICAS:-1}

PROVER_FAILED_PROOF_STORE = "${PROVER_FAILED_PROOF_STORE}"
DEPLOY_ARCHIVAL_NODE = ${DEPLOY_ARCHIVAL_NODE}
PROVER_REPLICAS = ${PROVER_REPLICAS}

P2P_MAX_TX_POOL_SIZE = ${P2P_MAX_TX_POOL_SIZE}
PROVER_TEST_DELAY_TYPE = "${PROVER_TEST_DELAY_TYPE}"
PROVER_TEST_VERIFICATION_DELAY_MS = ${PROVER_TEST_VERIFICATION_DELAY_MS}

PROVER_NODE_DISABLE_PROOF_PUBLISH = ${PROVER_NODE_DISABLE_PROOF_PUBLISH}
P2P_TX_POOL_DELETE_TXS_AFTER_REORG = ${P2P_TX_POOL_DELETE_TXS_AFTER_REORG}
VALIDATOR_L1_PRIORITY_FEE_BUMP_PERCENTAGE = ${VALIDATOR_L1_PRIORITY_FEE_BUMP_PERCENTAGE:-null}
VALIDATOR_L1_PRIORITY_FEE_RETRY_BUMP_PERCENTAGE = ${VALIDATOR_L1_PRIORITY_FEE_RETRY_BUMP_PERCENTAGE:-null}
PROVER_L1_PRIORITY_FEE_BUMP_PERCENTAGE = ${PROVER_L1_PRIORITY_FEE_BUMP_PERCENTAGE:-null}
PROVER_L1_PRIORITY_FEE_RETRY_BUMP_PERCENTAGE = ${PROVER_L1_PRIORITY_FEE_RETRY_BUMP_PERCENTAGE:-null}
BLOB_ALLOW_EMPTY_SOURCES = ${BLOB_ALLOW_EMPTY_SOURCES:-false}
DEBUG_P2P_INSTRUMENT_MESSAGES = ${DEBUG_P2P_INSTRUMENT_MESSAGES:-false}

PROVER_AGENT_INCLUDE_METRICS = "${PROVER_AGENT_INCLUDE_METRICS-null}"
FULL_NODE_INCLUDE_METRICS = "${FULL_NODE_INCLUDE_METRICS-null}"

LOG_LEVEL = "${LOG_LEVEL}"
FISHERMAN_LOG_LEVEL = "${FISHERMAN_LOG_LEVEL}"

WS_NUM_HISTORIC_BLOCKS = ${WS_NUM_HISTORIC_BLOCKS:-null}

P2P_PUBLIC_IP = ${P2P_PUBLIC_IP}
P2P_NODEPORT_ENABLED = ${P2P_NODEPORT_ENABLED}

PROVER_AGENT_PROOF_TYPES = ${PROVER_AGENT_PROOF_TYPES:-[]}
DEBUG_FORCE_TX_PROOF_VERIFICATION = ${DEBUG_FORCE_TX_PROOF_VERIFICATION:-false}
EOF

tf_run "${DEPLOY_AZTEC_INFRA_DIR}" "${DESTROY_AZTEC_INFRA}" "${CREATE_AZTEC_INFRA}"
STAGE_TIMINGS[aztec_infra]=$(($(date +%s) - AZTEC_INFRA_START))
log "Deployed aztec infra"

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

