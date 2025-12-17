#!/usr/bin/env bash


echo "Deploying network..."
spartan=$(git rev-parse --show-toplevel)/spartan
scripts_dir=$spartan/scripts

# Source the required scripts
source "$scripts_dir/source_env_basic.sh"
source "$scripts_dir/source_network_env.sh"
source "$scripts_dir/gcp_auth.sh"

# Main execution
if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <env_file> [use_local_image]" >&2
  echo "  use_local_image: if 'true', pushes aztecprotocol/aztec:latest to aztecprotocol/aztecdev" >&2
  exit 1
fi

env_file="$1"
use_local_image="${2:-false}"

# First pass: source environment for basic variables like CLUSTER (skip GCP secret processing)
source_env_basic "$env_file"

# If use_local_image is exactly 'true', push aztecprotocol/aztec:latest to aztecprotocol/aztecdev
if [[ "$use_local_image" == "true" ]]; then
  echo "Pushing aztecprotocol/aztec:latest to aztecprotocol/aztecdev..."

  # Generate a unique tag using the actual SHA of the aztec:latest image
  IMAGE_SHA=$(docker inspect --format='{{.Id}}' aztecprotocol/aztec:latest | cut -d':' -f2 | head -c 12)
  UNIQUE_TAG="${IMAGE_SHA}"

  # Tag and push to aztecprotocol/aztecdev on Docker Hub
  # We assume this latest tag has come from doing release-image/bootstrap.sh (after bootstrapping everything else)
  docker tag aztecprotocol/aztec:latest "aztecprotocol/aztecdev:${UNIQUE_TAG}"
  docker push "aztecprotocol/aztecdev:${UNIQUE_TAG}"

  # Export the new image path, GCP project, and ensure we're not using kind
  export AZTEC_DOCKER_IMAGE="aztecprotocol/aztecdev:${UNIQUE_TAG}"
  export GCP_PROJECT_ID="testnet-440309"
  echo "Exported AZTEC_DOCKER_IMAGE=${AZTEC_DOCKER_IMAGE}"
  echo "Exported GCP_PROJECT_ID=${GCP_PROJECT_ID}"
fi

# Perform GCP auth (needs CLUSTER and other basic vars)
gcp_auth

# Second pass: source environment with GCP secret processing
source_network_env "$env_file"


$scripts_dir/deploy_network.sh
echo "Deployed network"
