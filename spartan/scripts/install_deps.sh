#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source

os=$(uname | awk '{print tolower($0)}')

# if kubectl is not installed, install it
if ! command -v kubectl &> /dev/null; then
  curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/${os}/$(arch)/kubectl"
  chmod +x kubectl
  sudo mv kubectl /usr/local/bin/kubectl
fi

# Install kind if it is not installed
if ! command -v kind &> /dev/null; then
  curl -Lo ./kind https://github.com/kubernetes-sigs/kind/releases/download/v0.23.0/kind-${os}-$(arch)
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
  if dpkg -l google-cloud-cli 2>/dev/null | grep -q "^ii"; then
    sudo apt-get update
    sudo apt-get install -y google-cloud-cli-gke-gcloud-auth-plugin
  else
    gcloud components install gke-gcloud-auth-plugin
  fi
fi
