#!/bin/bash
source $(git rev-parse --show-toplevel)/ci3/source

# if kubectl is not installed, install it
if ! command -v kubectl &> /dev/null; then
  curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/$(uname)/$(arch)/kubectl"
  chmod +x kubectl
  sudo mv kubectl /usr/local/bin/kubectl
fi

# Install kind if it is not installed
if ! command -v kind &> /dev/null; then
  curl -Lo ./kind https://kind.sigs.k8s.io/dl/v0.23.0/kind-$(uname)-$(arch)
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
  curl -Lo stern.tar.gz https://github.com/stern/stern/releases/download/v1.31.0/stern_1.31.0_$(uname)_$(arch).tar.gz

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

# For GKE access
if ! command -v gcloud &> /dev/null; then
  if [ -f /etc/os-release ] && grep -qi "Ubuntu" /etc/os-release; then
    sudo apt update
    sudo apt install -y apt-transport-https ca-certificates gnupg curl
    sudo rm -f /usr/share/keyrings/cloud.google.gpg && curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | sudo gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg
    echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" | sudo tee -a /etc/apt/sources.list.d/google-cloud-sdk.list
    sudo apt install -y google-cloud-cli
    echo "Now you can run 'gcloud init'"
  else
    echo "gcloud not found. This is needed for GKE kubernetes usage." >&2
    echo "If needed, install glcoud and do 'gcloud components install gke-gcloud-auth-plugin', then 'gcloud init'" >&2
  fi
fi