#!/usr/bin/env bash
set -eu

# Function to clean up and exit
cleanup_and_exit() {
  echo "Cleaning up..."
  rm -f "$FUNCTION_ARTIFACT"
  exit 0
}

# Trap SIGINT (Ctrl+C) and call cleanup_and_exit
trap cleanup_and_exit SIGINT

# If first  arg is -h or --help, print usage
if [ "$1" == "-h" ] || [ "$1" == "--help" ]; then
  echo "Generates a flamegraph for the given contract and function"
  echo "Usage: $0 <contract_artifact | contract_name> <function>"
  echo "e.g.: $0 ./target/voting_contract_Voting.json vote"
  echo "e.g.: $0 Token transfer"
  exit 0
fi

# Get the directory of the script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

PROFILER=${PROFILER_PATH:-"$SCRIPT_DIR/../../../noir/noir-repo/target/release/noir-profiler"}
BACKEND_PATH=${BACKEND_PATH:-"$SCRIPT_DIR/../../../barretenberg/cpp/build/bin/bb"}
SERVE=${SERVE:-"1"}

if [ ! -f $PROFILER ]; then
  echo "Profiler not found, building profiler"
  cd "$SCRIPT_DIR/../../../noir/noir-repo/tooling/profiler"
  cargo build --release
  cd "$SCRIPT_DIR"
fi

# first console arg is contract name in camel case or path to contract artifact
CONTRACT=$1

# second console arg is the contract function
FUNCTION=$2

function sed_wrapper() {
  if sed --version >/dev/null 2>&1; then
    sed "$@"
  elif gsed --version >/dev/null 2>&1; then
    gsed "$@"
  else
    echo "No suitable sed found"
    echo "You can install gsed with 'brew install gnu-sed'"
    exit 1
  fi
}

if [[ "$CONTRACT" == *.json ]]; then
  if [ ! -f "$CONTRACT" ]; then
    echo "Error: Contract artifact not found at $CONTRACT"
    exit 1
  fi
  ARTIFACT_PATH=$CONTRACT
  FUNCTION_ARTIFACT="${ARTIFACT_PATH%%.json}-${FUNCTION}.json"
else
  # convert contract name to following format: token_bridge_contract-TokenBridge.json
  ARTIFACT=$(echo "$CONTRACT" | sed_wrapper -r 's/^([A-Z])/\L\1/; s/([a-z0-9])([A-Z])/\1_\L\2/g')
  ARTIFACT=$(echo "$ARTIFACT" | tr '[:upper:]' '[:lower:]')
  ARTIFACT_NAME="${ARTIFACT}_contract-${CONTRACT}"
  ARTIFACT_PATH="$SCRIPT_DIR/../target/${ARTIFACT_NAME}.json"
  FUNCTION_ARTIFACT="$SCRIPT_DIR/../target/${ARTIFACT_NAME}-${FUNCTION}.json"
fi

# Extract artifact for the specific function (will save to $FUNCTION_ARTIFACT)
node "$SCRIPT_DIR/extractFunctionAsNoirArtifact.js" "$ARTIFACT_PATH" $FUNCTION

if [ "$SERVE" == "true" ]; then
  # We create dest directory and use it as an output for the generated main.svg file
  OUTPUT_DIR="$SCRIPT_DIR/../dest"
  mkdir -p "$OUTPUT_DIR"
else
  # Save the flamegraph to the same directory as the artifact
  OUTPUT_DIR=$(dirname "$ARTIFACT_PATH")
fi

# At last, generate the flamegraph
$PROFILER gates --artifact-path "$FUNCTION_ARTIFACT" --backend-path "$BACKEND_PATH" --backend-gates-command "gates" --output "$OUTPUT_DIR" --scheme client_ivc --include_gates_per_opcode

echo "Flamegraph generated for contract: $CONTRACT"
# save as $ARTIFACT_NAME-${FUNCTION}-flamegraph.svg
OUTPUT_FILE="${OUTPUT_DIR}/$(basename ${ARTIFACT_PATH%%.json})-${FUNCTION}-flamegraph.svg"
mv "$OUTPUT_DIR/main_gates.svg" "$OUTPUT_FILE"

if [ "$SERVE" == "1" ]; then
  # serve the file over http
  echo -e "\nServing flamegraph at http://0.0.0.0:8000/$(basename $OUTPUT_FILE)\n"
  npx -y http-server --silent -p 8000 "$OUTPUT_DIR"
else
  echo -e "\nFlamegraph $(basename $OUTPUT_FILE) saved to artifacts directory. You can open it in your browser.\n"
fi

# Clean up before exiting
cleanup_and_exit
