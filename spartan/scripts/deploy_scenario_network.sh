#!/bin/bash

# Usage: ./deploy_scenario_network.sh [env_file]
# The [env_file] is an optional environment file to source.

set -euo pipefail

# Resolve repo root and script directory for reliable relative paths
REPO_ROOT="$(git rev-parse --show-toplevel)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source shared CI helpers
source "${REPO_ROOT}/ci3/source"

# Basic logging helpers
log() { echo "[INFO]  $(date -Is) - $*"; }
err() { echo "[ERROR] $(date -Is) - $*" >&2; }
die() { err "$*"; exit 1; }

# Ensure required commands exist
require_cmd() { command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1"; }

require_cmd git
require_cmd kubectl
require_cmd terraform
require_cmd sed
require_cmd xargs
require_cmd tr
require_cmd cast
if [[ "${CLUSTER:-kind}" != "kind" ]]; then
  require_cmd gcloud
fi

########################
# GLOBAL VARIABLES
########################
CLUSTER=${CLUSTER:-kind}
SALT=${SALT:-$(date +%s)}
NAMESPACE=${NAMESPACE:-scenario}
RESOURCE_PROFILE=$([[ "${CLUSTER}" == "kind" ]] && echo "dev" || echo "prod")
BASE_STATE_PATH="${CLUSTER}/${NAMESPACE}"

# GCP variables, unused if running on kind
GCP_PROJECT_ID=${GCP_PROJECT_ID:-testnet-440309}
GCP_REGION=${GCP_REGION:-us-west1-a}

########################
# ETH DEVNET VARIABLES
########################
DESTROY_ETH_DEVNET=${DESTROY_ETH_DEVNET:-false}
CREATE_ETH_DEVNET=${CREATE_ETH_DEVNET:-true}
ETHEREUM_CHAIN_ID=${ETHEREUM_CHAIN_ID:-1337}
ETHEREUM_BLOCK_TIME=${ETHEREUM_BLOCK_TIME:-12}
ETHEREUM_GAS_LIMIT=${ETHEREUM_GAS_LIMIT:-32000000}
LABS_INFRA_MNEMONIC=${LABS_INFRA_MNEMONIC:-test test test test test test test test test test test junk}
FUNDING_INDICES=${FUNDING_INDICES:-0,1,2,3,4,1000}

########################
# ROLLUP VARIABLES
########################
DESTROY_ROLLUP_CONTRACTS=${DESTROY_ROLLUP_CONTRACTS:-false}
CREATE_ROLLUP_CONTRACTS=${CREATE_ROLLUP_CONTRACTS:-true}
SPONSORED_FPC=${SPONSORED_FPC:-true}
REAL_VERIFIER=${REAL_VERIFIER:-true}
AZTEC_SLOT_DURATION=${AZTEC_SLOT_DURATION:-36}
AZTEC_EPOCH_DURATION=${AZTEC_EPOCH_DURATION:-32}
AZTEC_TARGET_COMMITTEE_SIZE=${AZTEC_TARGET_COMMITTEE_SIZE:-4}
AZTEC_PROOF_SUBMISSION_EPOCHS=${AZTEC_PROOF_SUBMISSION_EPOCHS:-1}
AZTEC_ACTIVATION_THRESHOLD=${AZTEC_ACTIVATION_THRESHOLD:-100}
AZTEC_EJECTION_THRESHOLD=${AZTEC_EJECTION_THRESHOLD:-50}
AZTEC_SLASHING_QUORUM=${AZTEC_SLASHING_QUORUM:-17}
AZTEC_SLASHING_ROUND_SIZE=${AZTEC_SLASHING_ROUND_SIZE:-32}
AZTEC_GOVERNANCE_PROPOSER_QUORUM=${AZTEC_GOVERNANCE_PROPOSER_QUORUM:-17}
AZTEC_GOVERNANCE_PROPOSER_ROUND_SIZE=${AZTEC_GOVERNANCE_PROPOSER_ROUND_SIZE:-32}
AZTEC_MANA_TARGET=${AZTEC_MANA_TARGET:-1000000000}
AZTEC_PROVING_COST_PER_MANA=${AZTEC_PROVING_COST_PER_MANA:-100}

########################
# AZTEC INFRA VARIABLES
########################
DESTROY_AZTEC_INFRA=${DESTROY_AZTEC_INFRA:-false}
CREATE_AZTEC_INFRA=${CREATE_AZTEC_INFRA:-true}
VALIDATOR_INDICES=${VALIDATOR_INDICES:-1,2,3,4}
VALIDATOR_MNEMONIC_START_INDEX=${VALIDATOR_MNEMONIC_START_INDEX:-1}
VALIDATORS_PER_NODE=${VALIDATORS_PER_NODE:-1}
VALIDATOR_REPLICAS=${VALIDATOR_REPLICAS:-4}
PROVER_MNEMONIC_START_INDEX=${PROVER_MNEMONIC_START_INDEX:-1000}
VALIDATOR_ADDRESSES=$(echo $VALIDATOR_INDICES | tr ',' '\n' | xargs -I{} cast wallet address --mnemonic "$LABS_INFRA_MNEMONIC" --mnemonic-index {} | tr '\n' ',' | sed 's/,$//')

# check that AZTEC_DOCKER_IMAGE is set
if [[ -z "${AZTEC_DOCKER_IMAGE:-}" ]]; then
  die "AZTEC_DOCKER_IMAGE is not set"
fi

# authenticate to google cloud
if [[ "${CLUSTER}" == "kind" ]]; then
  kubectl config use-context kind-kind
else
  [[ -n "${GOOGLE_APPLICATION_CREDENTIALS:-}" ]] || die "GOOGLE_APPLICATION_CREDENTIALS must be set for non-kind clusters"
  [[ -n "${GCP_REGION:-}" ]] || die "GCP_REGION must be set for non-kind clusters"
  gcloud auth activate-service-account --key-file="${GOOGLE_APPLICATION_CREDENTIALS}"
  gcloud container clusters get-credentials "${CLUSTER}" --region "${GCP_REGION}"
fi

K8S_CLUSTER_CONTEXT=$(kubectl config current-context)


# create the namespace if it doesn't exist
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

########################################################
# Deploy eth devnet
########################################################

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
GAS_LIMIT = "${ETHEREUM_GAS_LIMIT}"
PREFUNDED_MNEMONIC_INDICES = "${FUNDING_INDICES}"
RESOURCE_PROFILE = "${RESOURCE_PROFILE}"
EOF

"${SCRIPT_DIR}/override_terraform_backend.sh" "${DEPLOY_ETH_DEVNET_DIR}" "${CLUSTER}" "${BASE_STATE_PATH}/deploy-eth-devnet/${SALT}"
tf_run "${DEPLOY_ETH_DEVNET_DIR}" "${DESTROY_ETH_DEVNET}" "${CREATE_ETH_DEVNET}"

L1_RPC_URL=$(terraform -chdir="${DEPLOY_ETH_DEVNET_DIR}" output -raw eth_execution_rpc_url)
L1_CONSENSUS_HOST_URL=$(terraform -chdir="${DEPLOY_ETH_DEVNET_DIR}" output -raw eth_beacon_api_url)
[[ -n "${L1_RPC_URL}" ]] || die "Failed to fetch eth_execution_rpc_url"
[[ -n "${L1_CONSENSUS_HOST_URL}" ]] || die "Failed to fetch eth_beacon_api_url"


########################################################
# Deploy rollup contracts
########################################################

DEPLOY_ROLLUP_CONTRACTS_DIR="${SCRIPT_DIR}/../terraform/deploy-rollup-contracts"
cat > "${DEPLOY_ROLLUP_CONTRACTS_DIR}/terraform.tfvars" << EOF
K8S_CLUSTER_CONTEXT = "${K8S_CLUSTER_CONTEXT}"
NAMESPACE = "${NAMESPACE}"
AZTEC_DOCKER_IMAGE = "${AZTEC_DOCKER_IMAGE}"
L1_RPC_URLS = "${L1_RPC_URL}"
MNEMONIC = "${LABS_INFRA_MNEMONIC}"
L1_CHAIN_ID = "${ETHEREUM_CHAIN_ID}"
SALT = "${SALT}"
VALIDATORS = "${VALIDATOR_ADDRESSES}"
SPONSORED_FPC = ${SPONSORED_FPC}
REAL_VERIFIER = ${REAL_VERIFIER}
AZTEC_SLOT_DURATION = ${AZTEC_SLOT_DURATION}
AZTEC_EPOCH_DURATION = ${AZTEC_EPOCH_DURATION}
AZTEC_TARGET_COMMITTEE_SIZE = ${AZTEC_TARGET_COMMITTEE_SIZE}
AZTEC_PROOF_SUBMISSION_EPOCHS = ${AZTEC_PROOF_SUBMISSION_EPOCHS}
AZTEC_ACTIVATION_THRESHOLD = ${AZTEC_ACTIVATION_THRESHOLD}
AZTEC_EJECTION_THRESHOLD = ${AZTEC_EJECTION_THRESHOLD}
AZTEC_SLASHING_QUORUM = ${AZTEC_SLASHING_QUORUM}
AZTEC_SLASHING_ROUND_SIZE = ${AZTEC_SLASHING_ROUND_SIZE}
AZTEC_GOVERNANCE_PROPOSER_QUORUM = ${AZTEC_GOVERNANCE_PROPOSER_QUORUM}
AZTEC_GOVERNANCE_PROPOSER_ROUND_SIZE = ${AZTEC_GOVERNANCE_PROPOSER_ROUND_SIZE}
AZTEC_MANA_TARGET = ${AZTEC_MANA_TARGET}
AZTEC_PROVING_COST_PER_MANA = ${AZTEC_PROVING_COST_PER_MANA}
JOB_NAME = "deploy-rollup-contracts"
JOB_BACKOFF_LIMIT = 3
JOB_TTL_SECONDS_AFTER_FINISHED = 3600
EOF

"${SCRIPT_DIR}/override_terraform_backend.sh" "${DEPLOY_ROLLUP_CONTRACTS_DIR}" "${CLUSTER}" "${BASE_STATE_PATH}/deploy-rollup-contracts/${SALT}"
tf_run "${DEPLOY_ROLLUP_CONTRACTS_DIR}" "${DESTROY_ROLLUP_CONTRACTS}" "${CREATE_ROLLUP_CONTRACTS}"

REGISTRY_ADDRESS=$(terraform -chdir="${DEPLOY_ROLLUP_CONTRACTS_DIR}" output -raw registry_address)
SLASH_FACTORY_ADDRESS=$(terraform -chdir="${DEPLOY_ROLLUP_CONTRACTS_DIR}" output -raw slash_factory_address)
FEE_ASSET_HANDLER_ADDRESS=$(terraform -chdir="${DEPLOY_ROLLUP_CONTRACTS_DIR}" output -raw fee_asset_handler_address)
[[ -n "${REGISTRY_ADDRESS}" ]] || die "Failed to fetch registry_address"
[[ -n "${SLASH_FACTORY_ADDRESS}" ]] || die "Failed to fetch slash_factory_address"
[[ -n "${FEE_ASSET_HANDLER_ADDRESS}" ]] || die "Failed to fetch fee_asset_handler_address"
log "Got rollup contract addresses"

########################################################
# Deploy Aztec infra
########################################################

DEPLOY_AZTEC_INFRA_DIR="${SCRIPT_DIR}/../terraform/deploy-aztec-infra"
cat > "${DEPLOY_AZTEC_INFRA_DIR}/terraform.tfvars" << EOF
K8S_CLUSTER_CONTEXT = "${K8S_CLUSTER_CONTEXT}"
RELEASE_PREFIX = "${NAMESPACE}"
NAMESPACE = "${NAMESPACE}"
GCP_PROJECT_ID = "${GCP_PROJECT_ID}"
GCP_REGION = "${GCP_REGION}"
P2P_BOOTSTRAP_RESOURCE_PROFILE = "${RESOURCE_PROFILE}"
VALIDATOR_RESOURCE_PROFILE = "${RESOURCE_PROFILE}"
PROVER_RESOURCE_PROFILE = "${RESOURCE_PROFILE}"
RPC_RESOURCE_PROFILE = "${RESOURCE_PROFILE}"
AZTEC_DOCKER_IMAGE = "${AZTEC_DOCKER_IMAGE}"
METRICS_NAMESPACE = "metrics"
L1_CHAIN_ID = "${ETHEREUM_CHAIN_ID}"
L1_RPC_URLS = ["${L1_RPC_URL}"]
L1_CONSENSUS_HOST_URLS = ["${L1_CONSENSUS_HOST_URL}"]
L1_CONSENSUS_HOST_API_KEYS = [""]
L1_CONSENSUS_HOST_API_KEY_HEADERS = [""]
REGISTRY_CONTRACT_ADDRESS = "${REGISTRY_ADDRESS}"
SLASH_FACTORY_CONTRACT_ADDRESS = "${SLASH_FACTORY_ADDRESS}"
FEE_ASSET_HANDLER_CONTRACT_ADDRESS = "${FEE_ASSET_HANDLER_ADDRESS}"
VALIDATOR_MNEMONIC = "${LABS_INFRA_MNEMONIC}"
VALIDATOR_MNEMONIC_START_INDEX = ${VALIDATOR_MNEMONIC_START_INDEX}
VALIDATORS_PER_NODE = ${VALIDATORS_PER_NODE}
VALIDATOR_REPLICAS = ${VALIDATOR_REPLICAS}
PROVER_MNEMONIC = "${LABS_INFRA_MNEMONIC}"
PROVER_MNEMONIC_START_INDEX = ${PROVER_MNEMONIC_START_INDEX}
EOF

"${SCRIPT_DIR}/override_terraform_backend.sh" "${DEPLOY_AZTEC_INFRA_DIR}" "${CLUSTER}" "${BASE_STATE_PATH}/deploy-aztec-infra/${SALT}"
tf_run "${DEPLOY_AZTEC_INFRA_DIR}" "${DESTROY_AZTEC_INFRA}" "${CREATE_AZTEC_INFRA}"
log "Deployed aztec infra"

