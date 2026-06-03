#!/usr/bin/env bash

set -euo pipefail

echo "Deploying network..."
spartan=$(git rev-parse --show-toplevel)/spartan
scripts_dir=$spartan/scripts

# Source the required scripts
source "$scripts_dir/source_env_basic.sh"
source "$scripts_dir/source_network_env.sh"
source "$scripts_dir/gcp_auth.sh"

# Main execution
if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <env_file>" >&2
  exit 1
fi

env_file="$1"

# First pass: source environment for basic variables like CLUSTER (skip GCP secret processing)
source_env_basic "$env_file"

# Perform GCP auth (needs CLUSTER and other basic vars)
gcp_auth

# Second pass: source environment with GCP secret processing
source_network_env "$env_file"


# Optional: provision per-network IP + managed cert (+ DNS record in the delegated
# rpc.aztec-labs.com zone) via the network-frontend terraform module. The module's
# outputs are exported as env vars that deploy_network.sh already consumes.
CREATE_RPC_INGRESS=${CREATE_RPC_INGRESS:-false}
CREATE_RPC_DNS=${CREATE_RPC_DNS:-false}

if [[ "$CREATE_RPC_DNS" == "true" && "$CREATE_RPC_INGRESS" != "true" ]]; then
  echo "CREATE_RPC_DNS=true requires CREATE_RPC_INGRESS=true" >&2
  exit 1
fi

if [[ "$CREATE_RPC_INGRESS" == "true" ]]; then
  if [[ -z "${NAMESPACE:-}" ]]; then
    echo "CREATE_RPC_INGRESS=true requires NAMESPACE to be set" >&2
    exit 1
  fi
  # RPC_INGRESS_HOSTS is a JSON array of one-or-more hostnames, e.g. '["mainnet.rpc.aztec-labs.com"]'.
  if ! echo "${RPC_INGRESS_HOSTS:-}" | jq -e 'type == "array" and length > 0 and all(.[]; type == "string")' >/dev/null 2>&1; then
    echo "CREATE_RPC_INGRESS=true requires RPC_INGRESS_HOSTS to be a non-empty JSON array of hostnames, e.g. '[\"mainnet.rpc.aztec-labs.com\"]'" >&2
    exit 1
  fi

  frontend_dir="$spartan/terraform/network-frontend"
  echo "Applying network-frontend for $NAMESPACE ($RPC_INGRESS_HOSTS)..."
  terraform -chdir="$frontend_dir" init -reconfigure \
    -backend-config="bucket=aztec-terraform" \
    -backend-config="prefix=terraform/state/network-frontend/$NAMESPACE"

  tf_vars=(
    -var "NAMESPACE=$NAMESPACE"
    -var "RPC_HOSTNAMES=$RPC_INGRESS_HOSTS"
  )
  if [[ "$CREATE_RPC_DNS" == "true" ]]; then
    tf_vars+=(
      -var "CREATE_DNS=true"
      -var "DNS_ZONE_NAME=rpc-aztec-labs-com"
    )
  fi

  terraform -chdir="$frontend_dir" apply -auto-approve "${tf_vars[@]}"

  export RPC_INGRESS_ENABLED=true
  export RPC_INGRESS_STATIC_IP_NAME=$(terraform -chdir="$frontend_dir" output -raw ip_name)
  export RPC_INGRESS_SSL_CERT_NAMES="[\"$(terraform -chdir="$frontend_dir" output -raw cert_name)\"]"
  export RPC_INGRESS_HOSTS=$(terraform -chdir="$frontend_dir" output -json hostnames)

  echo "network-frontend: ip=$RPC_INGRESS_STATIC_IP_NAME cert=$RPC_INGRESS_SSL_CERT_NAMES hosts=$RPC_INGRESS_HOSTS"
fi

$scripts_dir/deploy_network.sh
echo "Deployed network"
