#!/usr/bin/env bash
# Regenerates the six checkpoint fixtures in test/fixtures ({empty,mixed,single_tx}_checkpoint_{1,2}.json), which the
# Foundry tests propose against the rollup. Only needed when the checkpoint format changes: the tests deploy the rollup
# with whatever archive root checkpoint 1 builds on (scripts/remake-constants.sh reads it from the fixtures), so a
# change to the protocol's genesis does not invalidate them.
#
# The fixtures are real checkpoints, built and published by labs' sequencer, so this needs a built labs tree
# (make labs-yarn-project) and anvil on PATH. Their producer picks a wall-clock timestamp and a random coinbase and fee
# recipient per run, so every run rewrites all six.
set -euo pipefail

repo_root=$(git rev-parse --show-toplevel)
command -v anvil >/dev/null || { echo "regenerate_checkpoint_fixtures: needs anvil on PATH" >&2; exit 1; }

(
  cd "$repo_root/labs/yarn-project/sequencer-client"
  AZTEC_GENERATE_TEST_DATA=1 \
  AZTEC_L1_FIXTURES_DIR="$repo_root/l1-contracts/test/fixtures" \
  NODE_NO_WARNINGS=1 \
    node --experimental-vm-modules ../node_modules/.bin/jest \
      src/publisher/l1_publisher.integration.test.ts -t 'bloated txs building on each other' --maxWorkers=1
)
# The producer writes one fixture per block it builds; only checkpoints 1 and 2 are consumed by the Foundry tests.
rm -f "$repo_root"/l1-contracts/test/fixtures/*_checkpoint_[3-9].json
"$repo_root/l1-contracts/scripts/remake-constants.sh"
