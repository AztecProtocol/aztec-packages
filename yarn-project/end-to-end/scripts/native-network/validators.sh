#!/bin/bash
# Takes a number of validators to start, starting from port 8080. Calls out to validator.sh
set -eu

# Get the name of the script without the path and extension
SCRIPT_NAME=$(basename "$0" .sh)

# Redirect stdout and stderr to <script_name>.log while also printing to the console
exec > >(tee -a "$(dirname $0)/logs/${SCRIPT_NAME}.log") 2> >(tee -a "$(dirname $0)/logs/${SCRIPT_NAME}.log" >&2)

REPO=$(git rev-parse --show-toplevel)

echo "Waiting for l1 contracts to be deployed..."
until [ -f "$REPO"/yarn-project/end-to-end/scripts/native-network/state/l1-contracts.env ] ; do
  sleep 1
done

source "$REPO"/yarn-project/end-to-end/scripts/native-network/state/l1-contracts.env

NUM_VALIDATORS="$1"
export ETHEREUM_HOST=${ETHEREUM_HOST:-http://127.0.0.1:8545}

# enter script dir
cd "$(dirname "${BASH_SOURCE[0]}")"

CMD=()

# Generate validator commands
for ((i=0; i<NUM_VALIDATORS; i++))
do
    PORT=$((8081 + i))
    P2P_PORT=$((40401 + i))

    # Generate a private key for the validator
    json_account=$(node --no-warnings "$REPO"/yarn-project/aztec/dest/bin/index.js generate-l1-account)
    validator_address=$(echo $json_account | jq -r '.address')
    validator_private_key=$(echo $json_account | jq -r '.privateKey')

    # Add L1 validator. Note this needs to happen in serial
    node --no-warnings "$REPO"/yarn-project/aztec/dest/bin/index.js add-l1-validator --validator $validator_address --rollup $ROLLUP_CONTRACT_ADDRESS

    CMD+=("./_validator.sh $PORT $P2P_PORT $validator_address $validator_private_key")
done

# forward epoch after registering all validators
node --no-warnings "$REPO"/yarn-project/aztec/dest/bin/index.js fast-forward-epochs --rollup $ROLLUP_CONTRACT_ADDRESS --count 1

# If there's only one validator, run it directly
if [ "$NUM_VALIDATORS" -eq 1 ]; then
    echo "Running single validator directly"
    eval "${CMD[0]}"
else
    echo "Running $NUM_VALIDATORS validators interleaved"
    # Execute the run_interleaved.sh script with the commands
    "$(git rev-parse --show-toplevel)/scripts/run_interleaved.sh" "${CMD[@]}"
fi
