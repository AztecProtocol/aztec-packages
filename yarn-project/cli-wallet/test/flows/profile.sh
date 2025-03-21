#!/usr/bin/env bash
source $(git rev-parse --show-toplevel)/ci3/source
source shared/setup.sh

test_title "Profile private transfer with authwit"

source $flows/shared/deploy_main_account_and_token.sh
source $flows/shared/mint_to_private.sh 100 main
source $flows/shared/create_funded_account.sh operator

# Create an authwit for the operator to transfer tokens from the main account to operator's own account.
aztec-wallet create-secret -a auth_nonce
aztec-wallet create-authwit transfer_in_private operator -ca token --args accounts:main accounts:operator 100 secrets:auth_nonce -f main

# Write out debug execution steps (used for debugging prover development).
tmp=$(mktemp -d)
function cleanup {
    rm -rf $tmp
}
trap cleanup EXIT SIGINT
aztec-wallet profile transfer_in_private --debug-execution-steps-dir $tmp -ca token --args accounts:main accounts:operator 100 secrets:auth_nonce -aw authwits:last -f operator
# Crude check, check that $tmp is over one megabyte, the validity of these files is checked more directly in the client ivc benches.
size=$(du -sb $tmp | awk '{print $1}')
if [ "$size" -lt 1000000 ]; then
    echo "Debug execution steps directory is less than 1MB, something went wrong."
    exit 1
fi

# Profile gate counts for `transfer_in_private`
gate_count=$(aztec-wallet profile transfer_in_private -ca token --args accounts:main accounts:operator 100 secrets:auth_nonce -aw authwits:last -f operator | grep "Total gates:" | awk '{print $3}')

echo "GATE_COUNT: $gate_count"

# Verify gate count is present in the output
if [ -z "$gate_count" ]; then
    gate_count_set=0
else
    gate_count_set=1
fi

assert_eq $gate_count_set 1
