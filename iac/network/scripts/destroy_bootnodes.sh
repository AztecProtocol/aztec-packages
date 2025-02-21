#!/usr/bin/env bash

NETWORK_NAME=${1:-}

cd ./ip/gcp

terraform init -backend-config="prefix=network/$NETWORK_NAME/ip/bootnode"

OUTPUT=$(terraform output -json ip_addresses)

echo $OUTPUT

GCP_REGIONS_ARRAY=()

while read -r REGION IP; do
    echo "Region: $REGION"
    echo "IP: $IP"

    GCP_REGIONS_ARRAY+=("$REGION")

done < <(echo "$OUTPUT" | jq -r 'to_entries | .[] | "\(.key) \(.value)"')

for REGION in "${GCP_REGIONS_ARRAY[@]}"; do
    echo "GCP KEY $REGION"
done

GCP_REGIONS_TF_ARG=$(jq --compact-output --null-input '$ARGS.positional' --args -- "${GCP_REGIONS_ARRAY[@]}")
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
  -var="enrs=" \
  -var="machine_type=" \
  -var="project_id=$PROJECT_ID" \
  --destroy
