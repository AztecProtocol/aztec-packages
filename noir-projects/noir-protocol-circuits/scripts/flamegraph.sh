#!/usr/bin/env bash
set -eu

EXAMPLE_CMD="$0 private_kernel_init rollup_merge"

# Parse global options.
CIRCUIT_NAMES=()
SERVE=false
PORT=5000
ALLOW_NO_CIRCUIT_NAMES=false

# Get the directory of the script.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# and of the artifact
ARTIFACT_DIR="$SCRIPT_DIR/../target"

# Function to get filenames from a directory
get_filenames() {
    local dir="$1"
    # Return filenames (without extensions) from the directory
    for file in "$dir"/*; do
        if [[ -f "$file" ]]; then
            filename="$(basename "$file" .${file##*.})"
            echo "$filename"
        fi
    done
}

NAUGHTY_LIST=("") # files with no opcodes, which break the flamegraph tool.

get_valid_circuit_names() {
    # Capture the output of function call in an array:
    ALL_CIRCUIT_NAMES=($(get_filenames "$ARTIFACT_DIR"))
    for circuit_name in "${ALL_CIRCUIT_NAMES[@]}"; do
        # Skip files that include the substring "simulated"
        if [[ "$circuit_name" == *"simulated"* ]]; then
            continue
        fi
        # Skip the file if it's on the naughty list:
        if [[ " ${NAUGHTY_LIST[@]} " =~ " ${circuit_name} " ]]; then
            continue
        fi
        CIRCUIT_NAMES+=("$circuit_name")
    done
}

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            echo "Generates flamegraphs for the specified protocol circuits."
            echo ""
            echo "Usage:"
            echo "    $0 <CIRCUIT_NAME> [<CIRCUIT_NAME> ...] [options]"
            echo ""
            echo "    e.g.: $EXAMPLE_CMD -s -p 8080"
            echo ""
            echo "Options:"
            echo "    -s    Serve the file(s) over http"
            echo "    -p    Specify custom port. Default: ${PORT}"
            echo ""
            echo "If you're feeling lazy, you can also just list available (compiled) circuit names with:"
            echo "    $0 -l"
            exit 0
            ;;
        -l|--list)
            echo "Available circuits (that have been compiled):"
            get_valid_circuit_names
            for circuit_name in "${CIRCUIT_NAMES[@]}"; do
                echo "$circuit_name"
            done
            exit 0
            ;;
        -a|--all)
            echo "This will probably take a while..."
            get_valid_circuit_names
            shift
            ;;
        -n|--allow-no-circuit-names)
            # Enables the existing flamegraphs to be served quickly.
            ALLOW_NO_CIRCUIT_NAMES=true
            shift
            ;;
        -s|--serve)
            SERVE=true
            shift
            ;;
        -p|--port)
            if [[ $# -lt 2 || $2 == -* ]]; then
                echo "Please specify a port number."
                echo "e.g.: $EXAMPLE_CMD -s -p 8080"
                exit 1
            fi
            PORT=$2
            shift 2
            ;;
        *)
            # Treat any argument not matching an option as a CIRCUIT_NAME.
            CIRCUIT_NAMES+=("$1")
            shift
            ;;
    esac
done

# Ensure at least one CIRCUIT_NAME was specified.
if [[ ! $ALLOW_NO_CIRCUIT_NAMES ]]; then
    if [[ ${#CIRCUIT_NAMES[@]} -eq 0 ]]; then
        echo "Please specify at least one circuit name."
        echo "e.g.: $EXAMPLE_CMD"
        exit 1
    fi
fi

# Build profiler if it's not available.
PROFILER="$SCRIPT_DIR/../../../noir/noir-repo/target/release/noir-profiler"
if [ ! -f $PROFILER ]; then
    echo "Profiler not found, building profiler"
    cd "$SCRIPT_DIR/../../../noir/noir-repo/tooling/profiler"
    cargo build --release
    cd "$SCRIPT_DIR"
fi

# Create the output directory.
DEST="$SCRIPT_DIR/../dest"
mkdir -p $DEST

MEGA_HONK_CIRCUIT_PATTERNS=$(jq -r '.[]' "$SCRIPT_DIR/../../client_ivc_circuits.json")
ROLLUP_HONK_CIRCUIT_PATTERNS=$(jq -r '.[]' "$SCRIPT_DIR/../../rollup_honk_circuits.json")

# Process each CIRCUIT_NAME.
for CIRCUIT_NAME in "${CIRCUIT_NAMES[@]}"; do
    (
        echo ""
        echo "Doing $CIRCUIT_NAME..."
        # Check if the artifact exists.
        ARTIFACT="$ARTIFACT_DIR/$CIRCUIT_NAME.json"
        if [[ ! -f $ARTIFACT ]]; then
            artifact_error="Cannot find artifact: ${ARTIFACT}"
            echo "$artifact_error"
        fi

        ARTIFACT_FILE_NAME=$(basename -s .json "$ARTIFACT")

        # Determine if the circuit is a mega honk circuit.
        IS_MEGA_HONK_CIRCUIT="false"
        for pattern in $MEGA_HONK_CIRCUIT_PATTERNS; do
            if echo "$ARTIFACT_FILE_NAME" | grep -qE "$pattern"; then
                IS_MEGA_HONK_CIRCUIT="true"
                break
            fi
        done

        IS_ROLLUP_HONK_CIRCUIT="false"
        for pattern in $ROLLUP_HONK_CIRCUIT_PATTERNS; do
            if echo "$ARTIFACT_FILE_NAME" | grep -qE "$pattern"; then
                IS_ROLLUP_HONK_CIRCUIT="true"
                break
            fi
        done

        # Generate the flamegraph.
        if [ "$IS_MEGA_HONK_CIRCUIT" = "true" ]; then
            $PROFILER gates --artifact-path "${ARTIFACT}" --backend-path "$SCRIPT_DIR/../../../barretenberg/cpp/build/bin/bb" --output "$DEST" --output-filename "$CIRCUIT_NAME" --backend-gates-command "gates_for_ivc" -- -h 0
        elif [ "$IS_ROLLUP_HONK_CIRCUIT" = "true" ]; then
            $PROFILER gates --artifact-path "${ARTIFACT}" --backend-path "$SCRIPT_DIR/../../../barretenberg/cpp/build/bin/bb" --output "$DEST" --output-filename "$CIRCUIT_NAME" -- -h 2
        else
            $PROFILER gates --artifact-path "${ARTIFACT}" --backend-path "$SCRIPT_DIR/../../../barretenberg/cpp/build/bin/bb" --output "$DEST" --output-filename "$CIRCUIT_NAME" -- -h 1
        fi

        echo "Flamegraph generated for circuit: $CIRCUIT_NAME"
    ) & # These parenthesis `( stuff ) &` mean "do all this in parallel"
done
wait # wait for parallel processes to finish

# Serve the files over HTTP if -s is set.
if $SERVE; then
    echo "Serving flamegraphs at http://0.0.0.0:${PORT}/"
    python3 -m http.server --directory "$DEST" $PORT
fi
