#!/usr/bin/env bash

NETWORK_NAME=${1:-}
PROJECT_ID=${2:-}

if [[ -z "$NETWORK_NAME" ]]; then
    echo "NETWORK_NAME is required"
    exit 1
fi

if [[ -z "$PROJECT_ID" ]]; then
    echo "PROJECT_ID is required"
    exit 1
fi

# Not used, but valid numbers are required
P2P_PORT=40400
L1_CHAIN_ID=1

cd ./ip/gcp

terraform init -backend-config="prefix=network/$NETWORK_NAME/ip/bootnode"

OUTPUT=$(terraform output -json ip_addresses)

echo "IP Addresses output: $OUTPUT"

GCP_REGIONS_ARRAY=()

while read -r REGION IP; do
    echo "IP: $IP is in region $REGION"

    GCP_REGIONS_ARRAY+=("$REGION")

done < <(echo "$OUTPUT" | jq -r 'to_entries | .[] | "\(.key) \(.value)"')

GCP_REGIONS_TF_ARG=$(jq --compact-output --null-input '$ARGS.positional' --args -- "${GCP_REGIONS_ARRAY[@]}")

# We need a valid JSON array of the correct length for the private keys, the contents are not used in a destroy
PRIVATE_KEYS_TF_ARG=$GCP_REGIONS_TF_ARG


echo "GCP_REGIONS: $GCP_REGIONS_TF_ARG"

cd ../../

BOOTNODE_START_SCRIPT="$PWD/scripts/bootnode_startup.sh"

cd ./bootnode/vm/gcp

terraform init -backend-config="prefix=network/$NETWORK_NAME/vm/bootnode"

terraform apply \
  -var="regions=$GCP_REGIONS_TF_ARG" \
  -var="start_script=$BOOTNODE_START_SCRIPT" \
  -var="network_name=$NETWORK_NAME" \
  -var="peer_id_private_keys=$PRIVATE_KEYS_TF_ARG" \
  -var="machine_type=" \
  -var="project_id=$PROJECT_ID" \
  -var="p2p_udp_port=$P2P_PORT" \
  -var="l1_chain_id=$L1_CHAIN_ID" \
  --destroy
