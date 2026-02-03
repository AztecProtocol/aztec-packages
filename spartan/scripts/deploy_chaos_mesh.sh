#!/usr/bin/env bash

set -euo pipefail

# Resolve repo root and script directory for reliable relative paths
REPO_ROOT="$(git rev-parse --show-toplevel)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

source "${REPO_ROOT}/ci3/source"

# Basic logging helpers
log() { echo "[INFO]  $(date -Is) - $*"; }
err() { echo "[ERROR] $(date -Is) - $*" >&2; }
die() { err "$*"; exit 1; }

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

CLUSTER=${CLUSTER:-kind}
NAMESPACE=${NAMESPACE:-"chaos-mesh"}
BASE_STATE_PATH="${CLUSTER}/${NAMESPACE}"

K8S_CLUSTER_CONTEXT=$(kubectl config current-context)
if [[ ! "$K8S_CLUSTER_CONTEXT" =~ "$CLUSTER" ]]; then
  die "Current cluster $K8S_CLUSTER_CONTEXT does not match expected CLUSTER=$CLUSTER"
fi

DESTROY_CHAOS_MESH=${DESTROY_CHAOS_MESH:-false}
CREATE_CHAOS_MESH=${CREATE_CHAOS_MESH:-true}

if [[ -z "${ENABLE_SAFE_MODE:-}" ]]; then
  if [[ "$CLUSTER" == "kind" ]]; then
    ENABLE_SAFE_MODE="false"
  else
    ENABLE_SAFE_MODE="true"
  fi
fi

log "CREATE_CHAOS_MESH=true - deploying Chaos Mesh"
DEPLOY_CHAOS_MESH_DIR="${SCRIPT_DIR}/../terraform/deploy-chaos-mesh"
cat > "${DEPLOY_CHAOS_MESH_DIR}/terraform.tfvars" << EOF
K8S_CLUSTER_CONTEXT = "${K8S_CLUSTER_CONTEXT}"
RELEASE_NAME = "chaos"
CHAOS_MESH_NAMESPACE = "${NAMESPACE}"
ENABLE_SAFE_MODE = ${ENABLE_SAFE_MODE}
EOF

"${SCRIPT_DIR}/override_terraform_backend.sh" "${DEPLOY_CHAOS_MESH_DIR}" "${CLUSTER}" "${BASE_STATE_PATH}/deploy-chaos-mesh"
tf_run "${DEPLOY_CHAOS_MESH_DIR}" "${DESTROY_CHAOS_MESH}" "${CREATE_CHAOS_MESH}"
log "Chaos Mesh installed"
