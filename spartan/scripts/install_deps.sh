#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source

log() { echo "[INFO]  $(date -Is) - $*"; }
err() { echo "[ERROR] $(date -Is) - $*" >&2; }
die() { err "$*"; exit 1; }
require_cmd() { command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1"; }

log "Installing dependencies..."

# if kubectl is not installed, install it
if ! command -v kubectl &> /dev/null; then
  log "Installing kubectl..."
  curl -sLO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/$(os)/$(arch)/kubectl"
  chmod +x kubectl
  sudo mv kubectl /usr/local/bin/kubectl
fi

# Install kind if it is not installed
if ! command -v kind &> /dev/null; then
  log "Installing kind..."
  curl -sLo ./kind https://github.com/kubernetes-sigs/kind/releases/download/v0.23.0/kind-$(os)-$(arch)
  chmod +x ./kind
  sudo mv ./kind /usr/local/bin/kind
fi

function get_helm_from_cache {
  helm_artifact="$1"

  if cache_download "$helm_artifact" >/dev/null; then
    if [ -f helm ]; then
      sudo mv helm /usr/local/bin/helm
    elif [ -f ./usr/local/bin/helm ]; then
      sudo mv ./usr/local/bin/helm /usr/local/bin/helm
    else
      err "Could not extract helm from cache"
      return 1
    fi
    sudo chmod +x /usr/local/bin/helm
    return 0
  fi
  return 1 # return non-zero if cache miss
}

# Install helm if it is not installed
if ! command -v helm &> /dev/null; then
  log "Installing helm..."

  # Determine the helm artifact name based on OS and architecture
  helm_artifact="helm-$(os)-$(arch).tar.gz"
  helm_release_url="https://github.com/helm/helm/releases/tag/v3.19.0"

  if get_helm_from_cache "$helm_artifact" >/dev/null; then
    log "Using cached Helm binary"
  else
    log "Downloading Helm from get.helm.sh..."
    # Download and run the official Helm installer script
    curl -fsSL -o get_helm.sh https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3
    chmod +x get_helm.sh
    sudo ./get_helm.sh

    if [ -f /usr/local/bin/helm ]; then
      ( cd /usr/local/bin && cache_upload "$helm_artifact" helm )
    fi

    # Clean up installer script
    rm get_helm.sh
  fi
fi

if ! command -v stern &> /dev/null; then
  log "Installing stern..."
  # Download Stern
  curl -sLo stern.tar.gz https://github.com/stern/stern/releases/download/v1.31.0/stern_1.31.0_$(os)_$(arch).tar.gz

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
  log "Installing gcloud..."
  curl -sLo google-cloud-cli.tar.gz https://dl.google.com/dl/cloudsdk/channels/rapid/downloads/google-cloud-cli-$os-$(arch).tar.gz
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
      log "Installing GKE auth plugin for kubectl via apt..."
      sudo apt-get update
      sudo apt-get install -y google-cloud-cli-gke-gcloud-auth-plugin
    fi
  else
    log "Installing GKE auth plugin for kubectl via gcloud components..."
    gcloud components install gke-gcloud-auth-plugin
  fi
fi

FOUNDRY_VERSION="v1.4.1"
if ! command -v cast &> /dev/null; then
  log "Installing cast (foundry $FOUNDRY_VERSION)..."
  export FOUNDRY_DIR="$HOME/.foundry"
  curl -L https://foundry.paradigm.xyz | bash
  FOUNDRY_BIN_DIR="$FOUNDRY_DIR/bin"
  "$FOUNDRY_BIN_DIR/foundryup" -i "$FOUNDRY_VERSION"
  sudo mv "$FOUNDRY_BIN_DIR/cast" /usr/local/bin/cast
  sudo chmod +x /usr/local/bin/cast
fi

require_cmd git
require_cmd kubectl
require_cmd terraform
require_cmd sed
require_cmd xargs
require_cmd tr
require_cmd cast
require_cmd jq
require_cmd gcloud
require_cmd helm

# Update helm repos if any are configured (prevents stale cache issues)
if helm repo list &>/dev/null; then
  log "Updating helm repositories..."
  helm repo update || log "Warning: helm repo update failed, continuing anyway"
fi
