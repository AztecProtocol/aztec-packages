#!/usr/bin/env bash
set -eu

echo "Compile noir-protocol-circuits for gates report..."
cd noir-protocol-circuits
PROTOCOL_CIRCUITS_DIR=$PWD

# Compile programs into artifacts that the backend expects
NARGO=${NARGO:-../../noir/noir-repo/target/release/nargo}
$NARGO compile --only-acir

BB_BIN=${BB_BIN:-../../barretenberg/cpp/build/bin/bb}

echo "{\"programs\": [" > gates_report.json

# Bound for checking where to place last parentheses 
NUM_ARTIFACTS=$(ls -1q "$PROTOCOL_CIRCUITS_DIR/target"/*.gz | wc -l)

ITER="1"
for pathname in "$PROTOCOL_CIRCUITS_DIR/target"/*.gz; do    
    ARTIFACT_NAME=$(basename -s .gz "$pathname")

    echo "{\"package_name\": \"$ARTIFACT_NAME\"," >> gates_report.json
    $BB_BIN gates -b "./target/$ARTIFACT_NAME.gz" >> gates_report.json

    if (($ITER == $NUM_ARTIFACTS)); then
        echo "}" >> gates_report.json
    else 
        echo "}, " >> gates_report.json
    fi

    ITER=$(( $ITER + 1 ))
done

echo "]}" >> gates_report.json 