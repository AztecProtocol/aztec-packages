#!/usr/bin/env bash

# Script to extract the IP addresses of bootnodes in the given network, SSH into them, update their image tag before restarting them

# Usage: ./scripts/update_bootnodes.sh <network-name> <gcp-project-id> <gcp-ssh-key-secret-name> <image-tag> <ssh-user>

echo "This script will temporarily store a key file for access to remote servers at $PWD/key.pem."
echo "Please ensure it is removed afterwards"

# Variables
NETWORK_NAME=${1:-}
PROJECT_ID=${2:-}
SECRET_ID=${3:-}
TAG=${4:-}
USER=${5:-"aztec"}

ROOT=$(git rev-parse --show-toplevel)/iac/network

cd $ROOT/bootnode/ip/gcp

terraform init -backend-config="prefix=network/$NETWORK_NAME/bootnode/ip/gcp"

# Output is in the form:
  # + ip_addresses = {
  #     + africa-south1        = (known after apply)
  #     + asia-east1           = (known after apply)
  #     + australia-southeast1 = (known after apply)
  #   }

GCP_IP_OUTPUT=$(terraform output -json ip_addresses)

cd $ROOT

SSH_KEY_FILE=$ROOT/key.pem

gcloud secrets versions access latest --secret=$SECRET_ID --project=$PROJECT_ID > $SSH_KEY_FILE

chmod 600 $ROOT/key.pem

if [ $? -ne 0 ]; then
  echo "Failed to retrieve the SSH key"
  exit 1
fi

while read -r REGION IP; do
    echo "Region: $REGION"
    echo "IP: $IP"

    ./scripts/update_bootnode_tag.sh "$SSH_KEY_FILE" "$USER" "$IP" "$TAG"
done < <(echo "$GCP_IP_OUTPUT" | jq -r 'to_entries | .[] | "\(.key) \(.value)"')

rm -f $SSH_KEY_FILE
