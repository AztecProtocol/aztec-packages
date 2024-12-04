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
  echo "Running $NUM_VALIDATORS validators interleaved"
  # Execute the run_interleaved.sh script with the commands
  "$(git rev-parse --show-toplevel)/scripts/run_interleaved.sh" "${CMD[@]}"
fi
