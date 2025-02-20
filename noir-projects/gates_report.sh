#!/usr/bin/env bash
set -eu

# TODO(https://github.com/noir-lang/noir/issues/4962): This script is still yet to be integrated with noir-lang/noir-gates-diff
# The script needs some slight updating as `nargo info` expects a complete JSON object, while this script expects a single object field
# representing a list of circuit reports for a program.
# The ACIR tests in barretenberg also expect every target bytecode to have the name `acir.gz` while this script expects the same name of the package
MEGA_HONK_CIRCUIT_PATTERNS=$(jq -r '.[]' client_ivc_circuits.json)
ROLLUP_HONK_CIRCUIT_PATTERNS=$(jq -r '.[]' rollup_honk_circuits.json)

cd noir-protocol-circuits
PROTOCOL_CIRCUITS_DIR=$PWD

BB_BIN=${BB_BIN:-../../barretenberg/cpp/build/bin/bb}

echo "{\"programs\": [" > gates_report.json

# Bound for checking where to place last parentheses
NUM_ARTIFACTS=$(ls -1q "$PROTOCOL_CIRCUITS_DIR/target"/*.json | wc -l)


ITER="1"
for pathname in "$PROTOCOL_CIRCUITS_DIR/target"/*.json; do
    ARTIFACT_NAME=$(basename -s .json "$pathname")

    # Check if the current artifact is a mega honk circuit
    IS_MEGA_HONK_CIRCUIT="false"
    for pattern in $MEGA_HONK_CIRCUIT_PATTERNS; do
        if echo "$ARTIFACT_NAME" | grep -qE "$pattern"; then
            IS_MEGA_HONK_CIRCUIT="true"
            break
        fi
    done

    IS_ROLLUP_HONK_CIRCUIT="false"
    for pattern in $ROLLUP_HONK_CIRCUIT_PATTERNS; do
        if echo "$ARTIFACT_NAME" | grep -qE "$pattern"; then
            IS_ROLLUP_HONK_CIRCUIT="true"
            break
        fi
    done

    # If it's mega honk, we need to use the gates_for_ivc command
    if [ "$IS_MEGA_HONK_CIRCUIT" = "true" ]; then
        GATES_INFO=$($BB_BIN gates_for_ivc -h 0 -b "$pathname")
    elif [ "$IS_ROLLUP_HONK_CIRCUIT" = "true" ]; then
        GATES_INFO=$($BB_BIN gates --honk_recursion 2 -b "$pathname")
    else
        GATES_INFO=$($BB_BIN gates --honk_recursion 1 -b "$pathname")
    fi

    MAIN_FUNCTION_INFO=$(echo $GATES_INFO | jq -r ".functions[0] | {package_name: "\"$ARTIFACT_NAME\"", functions: [{name: \"main\", opcodes: .acir_opcodes, circuit_size}]}")
    echo -n $MAIN_FUNCTION_INFO >> gates_report.json

    if (($ITER == $NUM_ARTIFACTS)); then
        echo "" >> gates_report.json
    else
        echo "," >> gates_report.json
    fi

    ITER=$(( $ITER + 1 ))
done

echo "]}" >> gates_report.json
