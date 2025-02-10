#!/bin/bash
set -euo pipefail

# Check we're in the test container.
if [ ! -f /aztec_release_test_container ]; then
  echo "Not running inside the aztec release test container. Exiting."
  exit 1
fi

export SKIP_PULL=1
export NO_NEW_SHELL=1
export INSTALL_URI=file:///root/aztec-packages/aztec-up/bin

if [ -t 0 ]; then
  bash_args="-i"
else
  export NON_INTERACTIVE=1
fi

bash ${bash_args:-} <(curl -s $INSTALL_URI/aztec-install)

# We can't create a new shell for this test, so just re-source our modified .bashrc to get updated PATH.
set +eu
PS1=" " source ~/.bashrc
set -eu

export LOG_LEVEL=silent

# Start sandbox and wait for port to open.
# aztec start --sandbox &
# sandbox_pid=$!
# trap 'echo "Sending kill to pid $sandbox_pid"; kill $sandbox_pid &>/dev/null; wait $sandbox_pid' EXIT
# while ! curl -fs host.docker.internal:8080/status &>/dev/null; do sleep 1; done

# Execute commands as per: https://docs.aztec.network/tutorials/codealong/contract_tutorials/counter_contract
aztec-nargo new --contract counter_contract
if [ ! -f counter_contract/Nargo.toml ] || [ ! -f counter_contract/src/main.nr ]; then
  echo "Failed to create contract."
  exit 1
fi

# "Write" our contract.
cp -Rf /root/aztec-packages/noir-projects/noir-contracts/contracts/counter_contract .
cd counter_contract
sed -i 's|\.\./\.\./\.\./|/root/aztec-packages/noir-projects/|g' Nargo.toml

# Compile and codegen.
aztec-nargo compile
aztec codegen -o src/artifacts target
if [ ! -d src/artifacts ]; then
  echo "Failed to codegen TypeScript."
  exit 1
fi

# Test
aztec test
