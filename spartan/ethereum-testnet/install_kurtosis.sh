#!/bin/bash

REPO=$(git rev-parse --show-toplevel)

if command -v kurtosis &> /dev/null; then
  echo "Kurtosis CLI already installed"
  exit 0
fi

echo "Installing Kurtosis CLI"

# Installed from a their custom apt source
echo "deb [trusted=yes] https://apt.fury.io/kurtosis-tech/ /" | sudo tee /etc/apt/sources.list.d/kurtosis.list
sudo apt update
sudo apt install kurtosis-cli

# Install Kurtosis config
echo "Installing Kurtosis config"
cp ${REPO}/config/kurtosis-config.yml "$(kurtosis config path)"

# Set kurtosis to use the cluster configuration
echo "Setting Kurtosis to kind cluster configuration"
kurtosis cluster set kind

echo "Kurtosis installed successfully"
