#!/usr/bin/env bash
# Regenerate the canonical genesis constants, in one shot. This script is the single source of truth.
#
# A production network's genesis world state seeds the protocol contracts' registration nullifiers. Those nullifiers
# are derived from the protocol contract artifacts, so anything that rotates a protocol class id — a contract source
# change, a compiler bump, a transpiler change — moves them, and with them the genesis roots. Several tracked files
# record those values and must move together, or the tree is inconsistent and CI breaks late:
#
#   1. noir-projects/fnd/noir-protocol-circuits/crates/types/src/constants.nr
#        GENESIS_NULLIFIER_TREE_ROOT, GENESIS_BLOCK_HEADER_HASH, GENESIS_ARCHIVE_ROOT.
#        Source of truth: aztec_constants.hpp, ConstantsGen.sol and labs' constants.gen.ts all derive from it.
#   2. native-packages/wsdb/cpp/src/world_state/genesis_protocol_nullifiers.hpp
#        The seed vector the C++ world-state test builds its genesis from.
#   3. l1-contracts/test/fixtures/{empty,mixed,single_tx}_checkpoint_{1,2}.json   (--fixtures)
#        Checkpoint 1 of each family starts from the genesis archive; checkpoint 2 chains off checkpoint 1.
#        Their producer picks a wall-clock timestamp and random coinbase/feeRecipient per run, so every
#        regeneration rewrites all six whether or not the genesis moved. Only `lastArchiveRoot` is stable, which
#        is what --check keys on. Do not run --fixtures unless the genesis actually moved.
#
# Deliberately NOT touched: the deployed-network pins in labs' mainnet_compatibility.test.ts and
# testnet_compatibility.test.ts. Those record what a live network was deployed with. They change only at a governance
# upgrade, never as a side effect of regeneration; if they start failing, that is a release decision for a human.
#
# Usage:
#   noir-projects/fnd/scripts/regenerate_genesis_constants.sh [--check] [--fixtures]
#
#   --check      measure and compare only; write nothing. Exits non-zero if anything is stale.
#   --fixtures   also regenerate the six L1 checkpoint fixtures. Needs anvil on PATH, and takes a few minutes.
#
# The script edits and `git add`s files; it does not commit, branch, or push. Unlike the Noir bump script it does not
# degrade to best-effort: a missing dependency, a failed measurement or a replacement that did not match is a hard
# failure, because a half-applied regeneration produces a tree whose constants disagree with each other.
set -euo pipefail

repo_root=$(git rev-parse --show-toplevel)
cd "$repo_root"

check_only=0
with_fixtures=0
for arg in "$@"; do
  case "$arg" in
    --check) check_only=1 ;;
    --fixtures) with_fixtures=1 ;;
    -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

constants_nr=noir-projects/fnd/noir-protocol-circuits/crates/types/src/constants.nr
seeds_hpp=native-packages/wsdb/cpp/src/world_state/genesis_protocol_nullifiers.hpp
cpp_constants=barretenberg/cpp/src/barretenberg/aztec/aztec_constants.hpp
sol_constants=l1-contracts/src/core/libraries/ConstantsGen.sol
ts_constants=labs/yarn-project/constants/src/constants.gen.ts
cli_entry=labs/yarn-project/aztec/dest/bin/index.js
helper=noir-projects/fnd/scripts/genesis_constants.mjs

function die { echo "regenerate-genesis-constants: $*" >&2; exit 1; }
function phase { echo; echo "==> $*"; }

phase "Preflight"
[ -f "$constants_nr" ] || die "missing $constants_nr"
[ -f "$helper" ] || die "missing $helper"
[ -f "$cli_entry" ] || die "$cli_entry is not built. Run 'make labs-yarn-project' first."
if [ "$with_fixtures" = 1 ] && ! command -v anvil >/dev/null; then
  die "--fixtures needs anvil on PATH"
fi
# The measurement reflects the protocol contract artifacts the built client bundles, so a stale build yields stale
# numbers. Warn rather than abort: mtimes are only a proxy, and the fnd precommit hook rewrites every protocol
# contract .nr through `nargo fmt` on any commit that stages one, which moves their mtimes without changing content.
newest_source=$(find noir-projects/fnd/noir-contracts/contracts/protocol -name '*.nr' -newer "$cli_entry" -print -quit)
if [ -n "$newest_source" ]; then
  echo "  warning: protocol contract sources are newer than the build ($newest_source)."
  echo "           If you changed them, run 'make labs-yarn-project' first or the measurement below is stale."
fi

phase "Measure the canonical genesis"
measurement_file=$(mktemp)
trap 'rm -f "$measurement_file"' EXIT
node "$cli_entry" compute-genesis-values | sed -n '/^{/,$p' >"$measurement_file" ||
  die "compute-genesis-values failed"
[ -s "$measurement_file" ] || die "compute-genesis-values produced no JSON"

phase "Validate"
# Assigned separately so a helper failure aborts here; `eval "$(...)"` would swallow its exit status.
measured=$(node "$helper" parse "$measurement_file") || die "measurement failed validation"
eval "$measured"

echo "  GENESIS_NULLIFIER_TREE_ROOT = $NULLIFIER_ROOT"
echo "  GENESIS_BLOCK_HEADER_HASH   = $HEADER_HASH"
echo "  GENESIS_ARCHIVE_ROOT        = $ARCHIVE_ROOT"
echo "  seeds                       = $(echo "$SEEDS" | wc -w)"

function write_seeds_header {
  local file=$1
  {
    cat <<'EOF'
// GENERATED FILE - DO NOT EDIT.
// Regenerate with noir-projects/fnd/scripts/regenerate_genesis_constants.sh.
#pragma once

#include "field/field_element.hpp"

#include <vector>

namespace azteclabs::wsdb::world_state {

/**
 * @brief The protocol contracts' registration nullifiers, seeded into the nullifier tree of a production genesis.
 *
 * Derived from the protocol contract artifacts: per protocol contract, the class registration nullifier siloed by
 * ContractClassRegistry and the instance publication nullifier siloed by ContractInstanceRegistry. Sorted ascending
 * because the indexed nullifier tree requires unique, strictly increasing prefilled leaves. These determine
 * GENESIS_NULLIFIER_TREE_ROOT, GENESIS_BLOCK_HEADER_HASH and GENESIS_ARCHIVE_ROOT, so they are rewritten together
 * with those constants and never on their own.
 */
inline std::vector<fr> genesis_protocol_nullifiers()
{
    return {
EOF
    for seed in $SEEDS; do echo "        fr(\"$seed\"),"; done
    cat <<'EOF'
    };
}

} // namespace azteclabs::wsdb::world_state
EOF
  } >"$file"
}

if [ "$check_only" = 1 ]; then
  phase "Check"
  stale=0
  for pair in "GENESIS_NULLIFIER_TREE_ROOT $NULLIFIER_ROOT" "GENESIS_BLOCK_HEADER_HASH $HEADER_HASH" \
              "GENESIS_ARCHIVE_ROOT $ARCHIVE_ROOT"; do
    set -- $pair
    grep -q "$2" "$constants_nr" || { echo "  stale: $1 in $constants_nr"; stale=1; }
  done
  for seed in $SEEDS; do
    grep -q "$seed" "$seeds_hpp" || { echo "  stale: $seed missing from $seeds_hpp"; stale=1; }
  done
  grep -q "$ARCHIVE_ROOT" l1-contracts/test/fixtures/empty_checkpoint_1.json ||
    { echo "  stale: l1-contracts/test/fixtures/*_checkpoint_*.json (rerun with --fixtures)"; stale=1; }
  [ "$stale" = 0 ] || die "genesis constants are stale; rerun without --check"
  echo "  genesis constants are up to date"
  exit 0
fi

phase "Update the pinned sources"
node "$helper" write-constants "$constants_nr" "$NULLIFIER_ROOT" "$HEADER_HASH" "$ARCHIVE_ROOT"
write_seeds_header "$seeds_hpp"

phase "Regenerate the derived constants"
# constants-codegen embeds constants.nr at build time, so it must be rebuilt before the remake scripts run, or they
# will cheerfully reproduce the previous values.
make constants-codegen
./barretenberg/cpp/scripts/remake-constants.sh
./l1-contracts/scripts/remake-constants.sh
if [ -x labs/yarn-project/constants/scripts/remake-constants.sh ]; then
  (cd labs && ./yarn-project/constants/scripts/remake-constants.sh)
fi

phase "Verify the derived constants picked up the new values"
grep -q "$NULLIFIER_ROOT" "$cpp_constants" || die "$cpp_constants did not pick up the new nullifier root"
grep -q "$ARCHIVE_ROOT" "$cpp_constants" || die "$cpp_constants did not pick up the new archive root"
# Solidity groups digits with underscores; TypeScript emits a plain bigint literal.
tr -d '_' <"$sol_constants" | grep -q "$ARCHIVE_ROOT_DEC" || die "$sol_constants did not pick up the new archive root"
if [ -f "$ts_constants" ]; then
  grep -q "$ARCHIVE_ROOT_DEC" "$ts_constants" || die "$ts_constants did not pick up the new archive root"
fi

if [ "$with_fixtures" = 1 ]; then
  phase "Regenerate the L1 checkpoint fixtures"
  (
    cd labs/yarn-project/sequencer-client
    AZTEC_GENERATE_TEST_DATA=1 \
    AZTEC_L1_FIXTURES_DIR="$repo_root/l1-contracts/test/fixtures" \
    NODE_NO_WARNINGS=1 \
      node --experimental-vm-modules ../node_modules/.bin/jest \
        src/publisher/l1_publisher.integration.test.ts -t 'bloated txs building on each other' --maxWorkers=1
  ) || die "fixture regeneration failed"
  # The producer writes one fixture per block it builds; only checkpoints 1 and 2 are consumed by the Foundry tests.
  rm -f l1-contracts/test/fixtures/*_checkpoint_[3-9].json
  grep -q "$ARCHIVE_ROOT" l1-contracts/test/fixtures/empty_checkpoint_1.json ||
    die "regenerated fixtures do not carry the new archive root"
fi

phase "Stage"
git add "$constants_nr" "$seeds_hpp"
if [ "$with_fixtures" = 1 ]; then git add l1-contracts/test/fixtures/; fi

echo
git --no-pager diff --cached --stat -- "$constants_nr" "$seeds_hpp" l1-contracts/test/fixtures/
echo
if [ "$with_fixtures" = 1 ]; then
  echo "Done. Review the staged diff and commit."
else
  echo "Roots updated; L1 checkpoint fixtures are OUTSTANDING."
  echo "Rerun with --fixtures (needs anvil), or the Foundry checkpoint tests will fail."
fi
