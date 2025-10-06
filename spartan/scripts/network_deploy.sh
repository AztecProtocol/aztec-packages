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


$scripts_dir/deploy_network.sh
echo "Deployed network"
