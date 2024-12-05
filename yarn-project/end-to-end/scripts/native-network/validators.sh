#!/bin/bash
# Takes a number of validators to start, starting from port 8080. Calls out to validator.sh
set -eu

# Get the name of the script without the path and extension
SCRIPT_NAME=$(basename "$0" .sh)

# Redirect stdout and stderr to <script_name>.log while also printing to the console
exec > >(tee -a "$(dirname $0)/logs/${SCRIPT_NAME}.log") 2> >(tee -a "$(dirname $0)/logs/${SCRIPT_NAME}.log" >&2)

NUM_VALIDATORS="$1"

# enter script dir
cd "$(dirname "${BASH_SOURCE[0]}")"

CMD=()

# Generate validator commands
for ((i = 0; i < NUM_VALIDATORS; i++)); do
  PORT=$((8081 + i))
  P2P_PORT=$((40401 + i))
  IDX=$((i + 1))

  # These variables should be set in public networks if we have funded validators already. Leave empty for test environments.
  ADDRESS_VAR="ADDRESS_${IDX}"
  PRIVATE_KEY_VAR="VALIDATOR_PRIVATE_KEY_${IDX}"
  ADDRESS="${!ADDRESS_VAR:-}"
  VALIDATOR_PRIVATE_KEY="${!PRIVATE_KEY_VAR:-}"

  CMD+=("./validator.sh $PORT $P2P_PORT $ADDRESS $VALIDATOR_PRIVATE_KEY")
done

# If there's only one validator, run it directly
if [ "$NUM_VALIDATORS" -eq 1 ]; then
  echo "Running single validator directly"
  eval "${CMD[0]}"
else
  echo "Running $NUM_VALIDATORS validators sequentially, interleaved"
  FIRST_PORT=8081

  # check if we're running against anvil
  if curl -s -H "Content-Type: application/json" -X POST --data '{"method":"web3_clientVersion","params":[],"id":49,"jsonrpc":"2.0"}' $ETHEREUM_HOST | jq .result | grep -q anvil; then
    "$(git rev-parse --show-toplevel)/scripts/run_interleaved.sh" "${CMD[@]}"
  else
    # Use run_interleaved with a wait condition
    WAIT_CONDITION="curl -s http://127.0.0.1:$FIRST_PORT/status >/dev/null"
    "$(git rev-parse --show-toplevel)/scripts/run_interleaved.sh" -w "$WAIT_CONDITION" "${CMD[@]}"
  fi
fi
