#!/bin/bash
set -eu

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