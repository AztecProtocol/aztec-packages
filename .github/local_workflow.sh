#!/bin/bash

# Runs a github workflow locally.
#
# Needs `act`. See https://nektosact.com/installation/index.html
#
# Bind-mounts the local directory into the container, which executes as the current user.
# Attempts to use a GCP service account, which you can download from
# https://console.cloud.google.com/iam-admin/serviceaccounts

# Your workflow may not need a GCP service account, nor a kubeconfig, etc.
# Feel free to send a PR to tweak the script ;)

# example usage:
# export GOOGLE_APPLICATION_CREDENTIALS=/your/path/to/testnet-helm-sa.json
# alias lwfl=/your/path/to/aztec-clones/alpha/.github/local_workflow.sh
# lwfl deploy_eth_devnet --input cluster=kind --input resource_profile=dev --input namespace=mitch-eth-devnet --input create_static_ips=false
# lwfl deploy_eth_devnet --input cluster=aztec-gke-private --input resource_profile=prod --input namespace=mitch-eth-devnet --input create_static_ips=false

workflow_name=$1

REPO_ROOT=$(git rev-parse --show-toplevel)

if [ -z "$workflow_name" ]; then
  echo "Usage: $0 <workflow_name> [args ...]"
  exit 1
fi

# get the rest of the args (skip the first one which is the workflow name)
shift
args=("$@")

# Only needed when running against GKE
SA_KEY_JSON=$(cat "$GOOGLE_APPLICATION_CREDENTIALS")

mkdir -p $REPO_ROOT/.github/.act-tool-cache

act -j $workflow_name \
  --env RUNNER_TOOL_CACHE=/work/toolcache \
  -s GITHUB_TOKEN="$(gh auth token)" \
  -s GCP_SA_KEY="$SA_KEY_JSON" \
  -s KUBECONFIG_B64="$(cat $HOME/.kube/config | base64 -w0)" \
  --container-options "-v $REPO_ROOT/.github/.act-tool-cache:/work/toolcache --user $(id -u):$(id -g)" \
  --bind \
  --directory $REPO_ROOT "${args[@]}"
