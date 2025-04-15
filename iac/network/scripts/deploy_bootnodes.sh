#!/usr/bin/env bash

set -e

# This script will walk through the process of deploying a set of bootnodes. To do this, it will
# 1. Create an SSH key and store i a GCP secret
# 2. Create a service account in GCP and appropriate firewall rules for running bootnodes
# 3. Create a static IP address for each provided region
# 4. Create a P2P private key for each region if one doesn't already exist, this is stored as a GCP secret
# 5. Generate the ENRs for the IP/Private key pairs
# 6. Writes the ENRs to the provided S3 bucket
# 7. Creates a VM in each region of the provided machine type
# 8. Executes a startup script and updates systemd to ensure the bootnode is always running

# Usage: ./scripts/deploy_bootnodes.sh <network-name> "region1,region2" "t2d-standard-2" "s3://static.aztec.network" <L1-chain-id> <gcp-project-id>

NETWORK_NAME=${1:-}
GCP_REGIONS=${2:-}
GCP_MACHINE_TYPE=${3:-}
STATIC_S3_BUCKET=${4:-}
L1_CHAIN_ID=${5:-}
PROJECT_ID=${6:-}
TAG=${7:-"latest"}

P2P_PORT=40400
P2P_PORTS="[\"$P2P_PORT\"]"

echo "NETWORK_NAME: $NETWORK_NAME"
echo "GCP_REGIONS: $GCP_REGIONS"

if [[ -z "$NETWORK_NAME" ]]; then
    echo "NETWORK_NAME is required"
    exit 1
fi

if [[ -z "$STATIC_S3_BUCKET" ]]; then
    echo "STATIC_S3_BUCKET is required"
    exit 1
fi

if [[ -z "$PROJECT_ID" ]]; then
    echo "PROJECT_ID is required"
    exit 1
fi

ROOT=$(git rev-parse --show-toplevel)/iac/network

# First we create an SSH key and store to a GCP secret
cd $ROOT/ssh

echo "Creating SSH Key at $PWD"

terraform init -backend-config="prefix=network/ssh"

terraform apply -var "ssh_user=aztec" \
  -var "ssh_secret_name=ssh-key-nodes" \
  -var "project_id=$PROJECT_ID"

# Here we ensure the common GCP stuff is created. This is common across all networks and includes
# 1. Service account
# 2. Firewall rules

cd $ROOT/common/gcp


echo "Creating gcp common at $PWD"

terraform init -backend-config="prefix=network/common/gcp"

terraform apply \
  -var "sa_account_id=service-acc-nodes" \
  -var "p2p_ports=$P2P_PORTS" \
  -var "project_id=$PROJECT_ID"

# Create the static IPs for the bootnodes

cd $ROOT/bootnode/ip/gcp

JSON_ARRAY=$(echo "$GCP_REGIONS" | jq -R 'split(",")')

terraform init -backend-config="prefix=network/$NETWORK_NAME/bootnode/ip/gcp"

terraform apply -var="regions=$JSON_ARRAY" -var="name=$NETWORK_NAME-bootnodes" -var "project_id=$PROJECT_ID"

# Output is in the form:
  # + ip_addresses = {
  #     + africa-south1        = (known after apply)
  #     + asia-east1           = (known after apply)
  #     + australia-southeast1 = (known after apply)
  #   }

GCP_IP_OUTPUT=$(terraform output -json ip_addresses)


cd $ROOT

# For each IP, create and store a private key and generate the ENR
# Capture all ENRs and write to the provided bucket

gcloud config set project $PROJECT_ID

GCP_PRIVATE_KEYS_ARRAY=()
GCP_REGIONS_ARRAY=()
ENR_ARRAY=()


while read -r REGION IP; do
    echo "Region: $REGION"
    echo "IP: $IP"

    SECRET_NAME="$NETWORK_NAME-$REGION-bootnode-private-key"
    PRIVATE_KEY=$(cd scripts && ./generate_private_key.sh $TAG)

    # Check if the secret exists

    # Disable exit on error temporarily
    set +e
    EXISTING_SECRET=$(gcloud secrets describe "$SECRET_NAME" --format="value(name)" 2>/dev/null)
    # Re-enable exit on error
    set -e

    if [[ -z "$EXISTING_SECRET" ]]; then
        echo "Secret '${SECRET_NAME}' does not exist. Creating it now..."
        # Create the secret
        gcloud secrets create "${SECRET_NAME}" --replication-policy="automatic"
        # Add the secret value
        echo -n "${PRIVATE_KEY}" | gcloud secrets versions add "${SECRET_NAME}" --data-file=-
        echo "Secret '${SECRET_NAME}' created successfully."
    else
        echo "Secret '${SECRET_NAME}' already exists. Skipping creation."
    fi

    PRIVATE_KEY=$(gcloud secrets versions access latest --secret="${SECRET_NAME}")

    # Now we can generate the enr
    ENR=$(cd scripts && ./generate_encoded_enr.sh "$PRIVATE_KEY" "$IP" "$P2P_PORT" "$L1_CHAIN_ID" $TAG)

    echo "ENR: $ENR"

    GCP_PRIVATE_KEYS_ARRAY+=("$PRIVATE_KEY")
    GCP_REGIONS_ARRAY+=("$REGION")
    ENR_ARRAY+=("$ENR");

done < <(echo "$GCP_IP_OUTPUT" | jq -r 'to_entries | .[] | "\(.key) \(.value)"')

BOOTNODE_START_SCRIPT="$PWD/scripts/bootnode_startup.sh"


PRIVATE_KEYS_JSON=$(jq --compact-output --null-input '$ARGS.positional' --args -- "${GCP_PRIVATE_KEYS_ARRAY[@]}")
GCP_REGIONS_JSON=$(jq --compact-output --null-input '$ARGS.positional' --args -- "${GCP_REGIONS_ARRAY[@]}")
ENR_JSON=$(jq --compact-output --null-input '$ARGS.positional' --args -- "${ENR_ARRAY[@]}")

echo "GCP_REGIONS_JSON: $GCP_REGIONS_JSON"
echo "ENR_JSON: $ENR_JSON"

cd $ROOT/bootnode/vm/gcp

FULL_ENR_JSON=$(jq -n --argjson enrs "$ENR_JSON" '{"bootnodes": $enrs}')

echo $FULL_ENR_JSON > ./enrs.json

# Write the ENRs to the bucket

aws s3 cp ./enrs.json $STATIC_S3_BUCKET/$NETWORK_NAME/bootnodes.json

rm ./enrs.json

# Create the VMs

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
