#!/usr/bin/env bash

set -e

yarn build:fast

export AZTEC_GENERATE_TEST_DATA=1

yarn workspace @aztec/end-to-end test integration_l1_publisher.test.ts
yarn workspace @aztec/end-to-end test e2e_nested_contract -t 'performs nested calls'

# this test takes considerable resources to run since it fully proves blocks
# only enable if needed
# yarn workspace @aztec/end-to-end test e2e_prover

yarn workspace @aztec/circuits.js test -u --max-workers 8
yarn workspace @aztec/noir-protocol-circuits-types test -u --max-workers 8
yarn workspace @aztec/protocol-contracts test -u --max-workers 8

# format the noir code in noir-projects (outside of yarn-project)
cd ../noir-projects
./scripts/format.sh
cd ../yarn-project
