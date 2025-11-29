#!/usr/bin/env bash
set -euo pipefail

# Check we're in the test container.
if [ ! -f /aztec_release_test_container ]; then
  echo "Not running inside the aztec release test container. Exiting."
  exit 1
fi

if [ "$(whoami)" != "ubuntu" ]; then
  echo "Not running as ubuntu. Exiting."
  exit 1
fi

export npm_config_registry="http://localhost:4873"
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.nvm/nvm.sh
node_version=$(grep node aztec-packages/aztec-up/bin/versions | cut -d' ' -f2)
nvm install $node_version
nvm alias default $node_version

export NO_NEW_SHELL=1
export INSTALL_URI=file:///home/ubuntu/aztec-packages/aztec-up/bin

if [ -t 0 ]; then
  bash_args="-i"
else
  export NON_INTERACTIVE=1
fi

bash ${bash_args:-} <(curl -s $INSTALL_URI/aztec-install)

bash -i ./aztec-packages/aztec-up/test/$1.sh
