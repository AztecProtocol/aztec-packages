
#!/bin/bash

# Example:

# If you've compiled Noir from source:
# ./compile.sh --nargo-path=path/to/nargo --verbose zk_token ecdsa_account
# yarn noir:build --nargo-path=path/to/nargo zk_token ecdsa_account

# If nargo is installed properly in your PATH:
# yarn noir:build zk_token ecdsa_account

# Enable strict mode:
# Exit on error (set -e), treat unset variables as an error (set -u),
# and propagate the exit status of the first failing command in a pipeline (set -o pipefail).
set -euo pipefail;

ROOT=$(pwd)

# Trap any ERR signal and call the custom error handler
process() {
  CONTRACT_NAME=$1

  cd $ROOT
  echo "Copying output for $CONTRACT_NAME"
  NODE_OPTIONS=--no-warnings yarn ts-node --esm src/scripts/copy_output.ts $CONTRACT_NAME
}

format(){
  echo "Formatting contract folders"
  yarn run -T prettier -w ./src/artifacts/*.json ../aztec.js/src/abis/*.json ./src/types/*.ts
  echo -e "Done\n"
}


# Check if at least one CONTRACT_NAME is provided, if not, display usage information.
if [ $# -eq 0 ]; then
  usage
  exit 0
fi

# Build contracts
for CONTRACT_NAME in "$@"; do
  process $CONTRACT_NAME &
done

# Wait for all background processes to finish
wait

# only run the rest when the full flag is set
format
