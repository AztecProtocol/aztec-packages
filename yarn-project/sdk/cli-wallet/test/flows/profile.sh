#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source
source shared/setup.sh

test_title "Profile private transfer"

source $flows/shared/deploy_main_account_and_token.sh
source $flows/shared/mint_to_private.sh 100 main

# Write out debug execution steps (used for debugging prover development).
tmp=$(mktemp -d)
function cleanup {
    rm -rf $tmp
}
trap cleanup EXIT SIGINT
aztec-wallet profile transfer_in_private --debug-execution-steps-dir $tmp -ca token --args accounts:main accounts:main 100 0 -f main
# Crude check, check that $tmp is over one megabyte, the validity of these files is checked more directly in the chonk benches.
size=$(du -sb $tmp | awk '{print $1}')
if [ "$size" -lt 1000000 ]; then
    echo "Debug execution steps directory is less than 1MB, something went wrong."
    exit 1
fi

# Profile gate counts for `transfer_in_private`
gate_count=$(aztec-wallet profile transfer_in_private -ca token --args accounts:main accounts:main 100 0 -f main | grep "Total gates:" | awk '{print $3}')

echo "GATE_COUNT: $gate_count"

# Verify gate count is present in the output
if [ -z "$gate_count" ]; then
    gate_count_set=0
else
    gate_count_set=1
fi

assert_eq $gate_count_set 1
