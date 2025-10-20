#!/bin/bash

# This script extracts artifacts from the redis "fuzzer_output" queue (see barretenberg/security/ssa_fuzzer_programs_proving)
# while the queue is not empty. For each item, it extracts `test_id`
# and saves the bytecode to a file named "artifacts/<test_id>".

REDIS_HOST="${REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6379}"

while true; do
    # Try to pop from the queue
    DATA=$(redis-cli -h $REDIS_HOST -p $REDIS_PORT rpop fuzzer_output)

    if [[ "$DATA" == "(nil)" || -z "$DATA" ]]; then
        # The queue is empty
        break
    fi

    TEST_ID=$(echo "$DATA" | jq -r '.test_id')
    BYTECODE_BASE64=$(echo "$DATA" | jq -r '.program.bytecode')
    BYTECODE=$(echo "$BYTECODE_BASE64" | base64 -d)
    #echo "Saving JSON for test_id $TEST_ID"
    echo "$BYTECODE" > "artifacts/${TEST_ID}"
done

echo "Done extracting all artifacts."
