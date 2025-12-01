#!/usr/bin/env bash

set -e

# This script will deploy VMs for bootnodes. It assumes infrastructure has already been set up
# (SSH keys, static IPs, private keys, etc.) using deploy_bootnodes.sh
#
# The VMs will pull the bootnode list from the network config in AztecProtocol/networks repo

# Usage: ./scripts/deploy_bootnode_vms.sh <network-name> "region1,region2" <machine-type> <L1-chain-id> <gcp-project-id> [tag]

NETWORK_NAME=${1:-}
GCP_REGIONS=${2:-}
GCP_MACHINE_TYPE=${3:-}
L1_CHAIN_ID=${4:-}
PROJECT_ID=${5:-}
TAG=${6:-"latest"}

P2P_PORT=40400

echo "NETWORK_NAME: $NETWORK_NAME"
echo "GCP_REGIONS: $GCP_REGIONS"

if [[ -z "$NETWORK_NAME" ]]; then
    echo "NETWORK_NAME is required"
    exit 1
fi

if [[ -z "$GCP_MACHINE_TYPE" ]]; then
    echo "GCP_MACHINE_TYPE is required"
    exit 1
fi

if [[ -z "$L1_CHAIN_ID" ]]; then
    echo "L1_CHAIN_ID is required"
    exit 1
fi

if [[ -z "$PROJECT_ID" ]]; then
    echo "PROJECT_ID is required"
    exit 1
fi

ROOT=$(git rev-parse --show-toplevel)/iac/network

gcloud config set project $PROJECT_ID

# Retrieve the private keys from GCP secrets for each region
GCP_PRIVATE_KEYS_ARRAY=()
GCP_REGIONS_ARRAY=()

JSON_ARRAY=$(echo "$GCP_REGIONS" | jq -R 'split(",")')

for REGION in $(echo "$JSON_ARRAY" | jq -r '.[]'); do
    echo "Region: $REGION"

    SECRET_NAME="$NETWORK_NAME-$REGION-bootnode-private-key"

    # Retrieve the private key from the secret
    PRIVATE_KEY=$(gcloud secrets versions access latest --secret="${SECRET_NAME}")

    GCP_PRIVATE_KEYS_ARRAY+=("$PRIVATE_KEY")
    GCP_REGIONS_ARRAY+=("$REGION")
done

BOOTNODE_START_SCRIPT="$ROOT/scripts/bootnode_startup.sh"

PRIVATE_KEYS_JSON=$(jq --compact-output --null-input '$ARGS.positional' --args -- "${GCP_PRIVATE_KEYS_ARRAY[@]}")
GCP_REGIONS_JSON=$(jq --compact-output --null-input '$ARGS.positional' --args -- "${GCP_REGIONS_ARRAY[@]}")

echo "GCP_REGIONS_JSON: $GCP_REGIONS_JSON"

# Create the VMs

cd $ROOT/bootnode/vm/gcp

terraform init -backend-config="prefix=network/$NETWORK_NAME/bootnode/vm/gcp"

terraform apply \
  -var="regions=$GCP_REGIONS_JSON" \
  -var="start_script=$BOOTNODE_START_SCRIPT" \
  -var="network_name=$NETWORK_NAME" \
  -var="peer_id_private_keys=$PRIVATE_KEYS_JSON" \
  -var="machine_type=$GCP_MACHINE_TYPE" \
  -var="project_id=$PROJECT_ID" \
  -var="p2p_port=$P2P_PORT" \
  -var="l1_chain_id=$L1_CHAIN_ID" \
  -var="image_tag=$TAG"
