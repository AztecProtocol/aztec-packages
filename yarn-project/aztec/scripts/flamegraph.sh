#!/usr/bin/env bash
set -eu

# If first arg is -h or --help, print usage.
if [ $# -lt 2 ] || [ "$1" == "-h" ] || [ "$1" == "--help" ]; then
    cat << 'EOF'
Aztec Flamegraph - Generate a gate count flamegraph for an aztec contract function.

Usage: aztec flamegraph <contract_artifact> <function>

Options:
  -h, --help     Print help

Will output an svg at <artifact_path>/<contract>-<function>-flamegraph.svg.
You can open it in your browser to view it.

EOF
    exit 0
fi

cleanup() {
  set +e
  if [ -f "$function_artifact" ]; then
    rm -f "$function_artifact"
  fi
}

trap cleanup EXIT

# Get the directory of the script
script_dir=$(realpath $(dirname $0))

PROFILER=${PROFILER_PATH:-noir-profiler}
BB=${BB:-bb}

# first console arg is contract name in camel case or path to contract artifact
contract=$1

# second console arg is the contract function
function=$2

if [ ! -f "$contract" ]; then
  echo "Error: Contract artifact not found at: $contract"
  exit 1
fi
artifact_path=$contract
function_artifact="${artifact_path%%.json}-${function}.json"
output_dir=$(dirname "$artifact_path")

# Extract artifact for the specific function.
node $script_dir/extract_function.js "$artifact_path" $function

# Generate the flamegraph
$PROFILER gates --artifact-path "$function_artifact" --backend-path "$BB" --backend-gates-command "gates" --output "$output_dir" --scheme chonk --include_gates_per_opcode

# Save as $artifact_name-$function-flamegraph.svg
output_file="${function_artifact%%.json}-flamegraph.svg"
mv "$output_dir/__aztec_nr_internals__${function}_gates.svg" "$output_file"
echo "Flamegraph generated at: $output_file"
