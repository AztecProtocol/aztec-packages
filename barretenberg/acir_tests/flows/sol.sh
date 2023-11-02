
#!/bin/sh
set -eu

# anvil &

TEST_PATH="../../sol-test"
CONTRACTS_PATH="$TEST_PATH/src/contracts"
WITNESS_PATH="$(pwd)/target/witness.gz"
PROOF_PATH="$(pwd)/proof"
PROOF_AS_FIELDS_PATH="$(pwd)/proof_fields.json"

# if [ -n "$VERBOSE" ]; then

    gates=$($BIN gates -v 2>&1 | tr -d '\0') 
    NUM_PUBLIC_INPUTS=$(echo "$gates" | grep -o 'public inputs: [0-9]*' | awk '{print $3}')

    $BIN prove -o proof
    $BIN write_vk  -o vk
    $BIN proof_as_fields -k vk -c $CRS_PATH -p $PROOF_PATH
    $BIN contract -k vk -c $CRS_PATH -b ./target/acir.gz -o $CONTRACTS_PATH/src/Key.sol

    # $BIN prove -v -o proof
    # $BIN write_vk -v -o vk
    # $BIN contract -k vk -v -c $CRS_PATH -b ./target/acir.gz

(cd $CONTRACTS_PATH; forge build --silent) > /dev/null

export PROOF=$PROOF_PATH
export PROOF_AS_FIELDS=$PROOF_AS_FIELDS_PATH
export WITNESS=$WITNESS_PATH
export NUM_PUBLIC_INPUTS=$NUM_PUBLIC_INPUTS
# (cd ../../sol-test; node src/index.js > /dev/null 2>&1)
(cd ../../sol-test; node src/index.js)







# else
#     gates=$($BIN gates -v) 
#     echo "$gates"
#     NUM_PUBLIC_INPUTS=$(echo "$gates" | grep -o 'public inputs: [0-9]*' | awk '{print $3}')
#     echo "NUM_PUBLIC_INPUTS: $NUM_PUBLIC_INPUTS"

#     $BIN gates
#     $BIN prove -o proof
#     $BIN write_vk -o vk
#     $BIN contract -k vk -c $CRS_PATH -b ./target/acir.gz -o $CONTRACTS_PATH/src/Key.sol
# fi