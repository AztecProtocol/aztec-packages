#!/usr/bin/env bash
set -eu

PROFILER=../../../noir/noir-repo/target/debug/noir-profiler

if [ ! -f $PROFILER ]; then
    echo "Profiler not found, building profiler"
    cd ../../../noir/noir-repo/tooling/profiler
    cargo build
    cd -
fi

# first console arg is contract name in camel case (e.g. TokenBridge)
CONTRACT=$1

# second console arg is the contract function
FUNCTION=$2

# convert contract name to following format: token_bridge_contract-TokenBridge.json
ARTIFACT=$(echo "$CONTRACT" | sed -r 's/^([A-Z])/\L\1/; s/([a-z0-9])([A-Z])/\1_\L\2/g')
ARTIFACT_NAME="${ARTIFACT}_contract-${CONTRACT}"

# Extract artifact for the specific function
node ../extractFunctionAsNoirArtifact.js  "../target/${ARTIFACT_NAME}.json" $FUNCTION

FUNCTION_ARTIFACT="${ARTIFACT_NAME}-${FUNCTION}.json"

# Make flamegraph directory in ../target
mkdir -p ../target/flamegraph

# At last, generate the flamegraph
$PROFILER gates-flamegraph --artifact-path ../target/$FUNCTION_ARTIFACT --backend-path ../../../barretenberg/cpp/build/bin/bb  --output ../target/flamegraph

# serve the file over http
echo "Serving flamegraph at http://0.0.0.0:8000/main.svg"
python3 -m http.server --directory ../target/flamegraph 8000