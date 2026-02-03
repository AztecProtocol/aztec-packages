#!/usr/bin/env bash

set -e

# This script will walk through the process of setting up bootnode infrastructure. To do this, it will
# 1. Create an SSH key and store it in a GCP secret
# 2. Create a service account in GCP and appropriate firewall rules for running bootnodes
# 3. Create a static IP address for each provided region
# 4. Create a P2P private key for each region if one doesn't already exist, this is stored as a GCP secret
# 5. Generate the ENRs for the IP/Private key pairs
# 6. Output the ENRs to be added to the network config in AztecProtocol/networks repo

# Usage: ./scripts/deploy_bootnodes.sh <network-name> "region1,region2" <L1-chain-id> <gcp-project-id> [tag]

NETWORK_NAME=${1:-}
GCP_REGIONS=${2:-}
L1_CHAIN_ID=${3:-}
PROJECT_ID=${4:-}
TAG=${5:-"latest"}

P2P_PORT=40400
P2P_PORTS="[\"$P2P_PORT\"]"

echo "NETWORK_NAME: $NETWORK_NAME"
echo "GCP_REGIONS: $GCP_REGIONS"

if [[ -z "$NETWORK_NAME" ]]; then
    echo "NETWORK_NAME is required"
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

    ENR_ARRAY+=("$ENR");

done < <(echo "$GCP_IP_OUTPUT" | jq -r 'to_entries | .[] | "\(.key) \(.value)"')

ENR_JSON=$(jq --compact-output --null-input '$ARGS.positional' --args -- "${ENR_ARRAY[@]}")

FULL_ENR_JSON=$(jq -n --argjson enrs "$ENR_JSON" '{"bootnodes": $enrs}')

echo ""
echo "=========================================="
echo "Infrastructure setup complete!"
echo "=========================================="
echo ""
echo "Add the following ENRs to the network config in AztecProtocol/networks repo:"
echo ""
echo "$FULL_ENR_JSON" | jq .
echo ""
echo "After adding to the network config, deploy the VMs with:"
echo "./scripts/deploy_bootnode_vms.sh $NETWORK_NAME \"$GCP_REGIONS\" <machine-type> $L1_CHAIN_ID $PROJECT_ID $TAG"
echo ""
