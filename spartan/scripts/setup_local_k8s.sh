#!/bin/bash

set -e

SCRIPT_DIR="$(dirname $(realpath -s "${BASH_SOURCE[0]}"))"

# exit if we are not on linux amd64
if [ "$(uname)" != "Linux" ] || [ "$(uname -m)" != "x86_64" ]; then
  echo "This script is only supported on Linux amd64"
  exit 1
fi

# if kubectl is not installed, install it
if ! command -v kubectl &> /dev/null; then
  curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
  chmod +x kubectl
  sudo mv kubectl /usr/local/bin/kubectl
fi

# Install kind if it is not installed
if ! command -v kind &> /dev/null; then
  curl -Lo ./kind https://kind.sigs.k8s.io/dl/v0.23.0/kind-$(uname)-amd64
  chmod +x ./kind
  sudo mv ./kind /usr/local/bin/kind
fi

# Install helm if it is not installed
if ! command -v helm &> /dev/null; then
  curl -fsSL -o get_helm.sh https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3
  chmod +x get_helm.sh
  sudo ./get_helm.sh
  rm get_helm.sh
fi

if ! command -v stern &> /dev/null; then
  # Download Stern
  curl -Lo stern.tar.gz https://github.com/stern/stern/releases/download/v1.31.0/stern_1.31.0_linux_amd64.tar.gz

  # Extract the binary
  tar -xzf stern.tar.gz

  # Move it to /usr/local/bin and set permissions
  sudo mv stern /usr/local/bin/stern
  sudo chmod +x /usr/local/bin/stern

  # Verify installation
  stern --version

  # Clean up
  rm stern.tar.gz
fi

if kubectl config get-clusters | grep -q "^kind-kind$"; then
  echo "Cluster 'kind' already exists. Skipping creation."
else
  # Sometimes, kubectl does not have our kind context yet kind registers it as existing
  # Ensure our context exists in kubectl
  kind delete cluster || true
  kind create cluster
fi

kubectl config use-context kind-kind || true

"$SCRIPT_DIR"/../chaos-mesh/install.sh
"$SCRIPT_DIR"/../metrics/install-kind.sh
