#!/usr/bin/env bash

NETWORK_NAME=${1:-}
GCP_REGIONS=${2:-}

echo "NETWORK_NAME: $NETWORK_NAME"
echo "GCP_REGIONS: $GCP_REGIONS"

cd ./auth

terraform init -backend-config="prefix=network/auth/nodes"

terraform apply -var "ssh_user=aztec" -var "ssh_secret_name=ssh-key-nodes" -var "sa_account_id=service-acc-nodes"

cd ..
mkdir -p ./$NETWORK_NAME/ip/bootnode
#mkdir -p ./$NAME/ip/validator
ls -l ./ip
cp ./ip/*.tf ./$NETWORK_NAME/ip/bootnode
#cp ./ip/*.tf ./$NAME/ip/validator

cd ./$NETWORK_NAME/ip/bootnode

echo $PWD

ls -l

terraform init -backend-config="prefix=network/$NETWORK_NAME/ip/bootnode"

terraform plan -var="regions=$GCP_REGIONS" -var="name=$NETWORK_NAME-bootnodes"







