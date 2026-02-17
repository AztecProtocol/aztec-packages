#!/bin/bash
set -euo pipefail

rsync -avz --exclude='deploy.sh' -e "ssh -i ~/.ssh/build_instance_key" * ubuntu@ci.aztec-labs.com:rk

ssh -i ~/.ssh/build_instance_key ubuntu@ci.aztec-labs.com "
  cd rk
  docker build -t rkapp .
  sudo systemctl restart rkapp
"
