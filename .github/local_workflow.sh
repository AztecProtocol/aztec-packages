#!/bin/bash

# example usage:
# export GOOGLE_APPLICATION_DEFAULT=/home/mitch/tokens/testnet-helm-sa.json
# alias lwfl=/home/mitch/aztec-clones/alpha/.github/local_workflow.sh
# lwfl deploy_eth_devnet --input cluster=kind-kind --input resource_profile=dev

workflow_name=$1

REPO_ROOT=$(git rev-parse --show-toplevel)

if [ -z "$workflow_name" ]; then
  echo "Usage: $0 <workflow_name> [args ...]"
  exit 1
fi

# get the rest of the args (skip the first one which is the workflow name)
shift
args=("$@")

SA_KEY_JSON=$(cat "$GOOGLE_APPLICATION_CREDENTIALS")

act workflow_dispatch -j $workflow_name \
  -s GITHUB_TOKEN="$(gh auth token)" \
  -s GCP_SA_KEY="$SA_KEY_JSON" \
  -s KUBECONFIG_B64="$(cat $HOME/.kube/config | base64 -w0)" \
  --container-options "--user $(id -u):$(id -g)" \
  --bind \
  --directory $REPO_ROOT "${args[@]}"
