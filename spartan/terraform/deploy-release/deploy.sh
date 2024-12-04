#!/bin/bash

# Usage: ./deploy.sh <release_name> <aztec_docker_image>
# Example: ./deploy.sh rough-rhino aztecprotocol/aztec:698cd3d62680629a3f1bfc0f82604534cedbccf3-x86_64

set -eu

RELEASE_NAME=$1
AZTEC_DOCKER_IMAGE=$2

terraform init -backend-config="key=deploy-network/${RELEASE_NAME}/terraform.tfstate"
terraform apply -var-file="release.tfvars" -var="RELEASE_NAME=${RELEASE_NAME}" -var="AZTEC_DOCKER_IMAGE=${AZTEC_DOCKER_IMAGE}"
