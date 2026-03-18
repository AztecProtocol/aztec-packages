#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Sync dashboard (rkapp) files, including ci-metrics subdirectory
rsync -avz --exclude='deploy.sh' -e "ssh -i ~/.ssh/build_instance_key" "$SCRIPT_DIR"/* ubuntu@ci.aztec-labs.com:rk

ssh -i ~/.ssh/build_instance_key ubuntu@ci.aztec-labs.com "
  cd rk
  docker build -t rkapp .
  sudo systemctl restart rkapp
"
