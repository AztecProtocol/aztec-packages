#!/usr/bin/env bash
echo "Installing dependencies..."
source $(git rev-parse --show-toplevel)/ci3/source
echo "Source loaded"

os=$(uname | awk '{print tolower($0)}')

# if kubectl is not installed, install it
if ! command -v kubectl &> /dev/null; then
  echo "Installing kubectl..."
  curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/${os}/$(arch)/kubectl"
  chmod +x kubectl
  sudo mv kubectl /usr/local/bin/kubectl
fi

# Install kind if it is not installed
if ! command -v kind &> /dev/null; then
  echo "Installing kind..."
  curl -Lo ./kind https://github.com/kubernetes-sigs/kind/releases/download/v0.23.0/kind-${os}-$(arch)
  chmod +x ./kind
  sudo mv ./kind /usr/local/bin/kind
fi

# Install helm if it is not installed
if ! command -v helm &> /dev/null; then
  echo "Installing helm..."
  curl -fsSL -o get_helm.sh https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3
  chmod +x get_helm.sh
  sudo ./get_helm.sh
  rm get_helm.sh
fi

if ! command -v stern &> /dev/null; then
  echo "Installing stern..."
  # Download Stern
  curl -Lo stern.tar.gz https://github.com/stern/stern/releases/download/v1.31.0/stern_1.31.0_${os}_$(arch).tar.gz

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

if ! command -v gcloud &> /dev/null; then
  echo "Installing gcloud..."
  curl -Lo google-cloud-cli.tar.gz https://dl.google.com/dl/cloudsdk/channels/rapid/downloads/google-cloud-cli-$os-$(arch).tar.gz
  tar -xzf google-cloud-cli.tar.gz
  rm google-cloud-cli.tar.gz

  sudo mkdir -p /opt
  sudo mv ./google-cloud-sdk /opt/google-cloud-sdk
  sudo /opt/google-cloud-sdk/install.sh --quiet --usage-reporting false

  source /opt/google-cloud-sdk/completion.bash.inc
fi

# Install GKE auth plugin for kubectl
if command -v gcloud &> /dev/null; then
  # Check if GKE auth plugin is already installed
  if command -v gke-gcloud-auth-plugin &> /dev/null ||
     gcloud components list --filter="id:gke-gcloud-auth-plugin" --format="value(state.name)" 2>/dev/null | grep -q "Installed"; then
     : # do nothing
  elif dpkg -l google-cloud-cli 2>/dev/null | grep -q "^ii"; then
    # Check if apt package is already installed
    if dpkg -l google-cloud-cli-gke-gcloud-auth-plugin 2>/dev/null | grep -q "^ii"; then
      : # do nothing
    else
      echo "Installing GKE auth plugin for kubectl via apt..."
      sudo apt-get update
      sudo apt-get install -y google-cloud-cli-gke-gcloud-auth-plugin
    fi
  else
    echo "Installing GKE auth plugin for kubectl via gcloud components..."
    gcloud components install gke-gcloud-auth-plugin
  fi
fi


# Sanity check commands
require_cmd() { command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1"; }

require_cmd git
require_cmd kubectl
require_cmd terraform
require_cmd sed
require_cmd xargs
require_cmd tr
require_cmd cast
require_cmd jq
require_cmd gcloud
