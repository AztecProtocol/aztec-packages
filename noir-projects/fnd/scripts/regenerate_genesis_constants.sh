#!/usr/bin/env bash
# Regenerate the canonical genesis, in one shot. This script is the single source of truth.
#
# A production network's genesis world state seeds the protocol contracts' registration nullifiers. Those nullifiers
# are derived from the protocol contract artifacts, so anything that rotates a protocol class id — a contract source
# change, a compiler bump, a transpiler change — moves them, and with them the genesis roots. Several tracked files
# record those values and must move together, or the tree is inconsistent and CI breaks late:
#
#   1. protocol/genesis/{genesis.json,index.js}
#        The @aztec-foundation/protocol-genesis package: the world state inputs (the nullifiers among them) and the
#        nullifier tree root, genesis block header hash and archive root they produce. Every consumer reads the
#        genesis from here; l1-contracts generates its test constant from genesis.json at build time.
#   2. native-packages/wsdb/cpp/src/world_state/genesis_protocol_nullifiers.hpp
#        The same values for wsdb's tests, which check that the native world state reports the roots the reference
#        world state measured. (barretenberg's own tests use a fixed synthetic genesis instead: bb is upstream of the
#        protocol contracts, so nothing in it may depend on them.)
#
# Not touched either: the L1 checkpoint fixtures. They build on whatever archive root the tests deploy the rollup with,
# which l1-contracts takes from the fixtures themselves, so they do not depend on the genesis
# (l1-contracts/scripts/regenerate_checkpoint_fixtures.sh regenerates them when the checkpoint format changes).
#
# Deliberately NOT touched: the deployed-network pins in labs' mainnet_compatibility.test.ts and
# testnet_compatibility.test.ts. Those record what a live network was deployed with. They change only at a governance
# upgrade, never as a side effect of regeneration; if they start failing, that is a release decision for a human.
#
# Usage:
#   noir-projects/fnd/scripts/regenerate_genesis_constants.sh [--check]
#
#   --check      measure and compare only; write nothing. Exits non-zero if anything is stale. CI runs this.
#
# The script edits and `git add`s files; it does not commit, branch, or push. Unlike the Noir bump script it does not
# degrade to best-effort: a missing dependency, a failed measurement or a replacement that did not match is a hard
# failure, because a half-applied regeneration produces a tree whose genesis values disagree with each other.
set -euo pipefail

repo_root=$(git rev-parse --show-toplevel)
cd "$repo_root"

check_only=0
for arg in "$@"; do
  case "$arg" in
    --check) check_only=1 ;;
    -h|--help) sed -n '2,33p' "$0"; exit 0 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

genesis_pkg=protocol/genesis
seeds_hpp=native-packages/wsdb/cpp/src/world_state/genesis_protocol_nullifiers.hpp
helper=noir-projects/fnd/scripts/genesis_constants.mjs
artifacts=(noir-projects/fnd/noir-contracts/target/{contract_instance_registry_contract-ContractInstanceRegistry,contract_class_registry_contract-ContractClassRegistry,fee_juice_contract-FeeJuice}.json)

function die { echo "regenerate-genesis-constants: $*" >&2; exit 1; }
function phase { echo; echo "==> $*"; }

phase "Preflight"
[ -d "$genesis_pkg" ] || die "missing $genesis_pkg"
[ -f "$helper" ] || die "missing $helper"
for artifact in "${artifacts[@]}"; do
  [ -f "$artifact" ] || die "$artifact is not built. Run 'make noir-projects-fnd' first."
done
for package in bb.js-api wsdb-ref; do
  [ -f "barretenberg/ts/$package/dest/index.js" ] ||
    die "barretenberg/ts/$package is not built. Run 'make bb-ts bb-wsdb-ref' first."
done
# The measurement reflects the built protocol contract artifacts, so a stale build yields stale numbers. Warn rather
# than abort: mtimes are only a proxy, and the fnd precommit hook rewrites every protocol contract .nr through
# `nargo fmt` on any commit that stages one, which moves their mtimes without changing content.
newest_source=$(find noir-projects/fnd/noir-contracts/contracts/protocol -name '*.nr' -newer "${artifacts[0]}" -print -quit)
if [ -n "$newest_source" ]; then
  echo "  warning: protocol contract sources are newer than the build ($newest_source)."
  echo "           If you changed them, run 'make noir-projects-fnd' first or the measurement below is stale."
fi

phase "Measure the canonical genesis"
staging=$(mktemp -d)
trap 'rm -rf "$staging"' EXIT
measurement_file=$staging/measurement.json
# The tree parameters come straight from constants.nr, through the same codegen every consumer uses, so the
# measurement never reads a stale or missing generated header.
echo '["NULLIFIER_TREE_HEIGHT", "NOTE_HASH_TREE_HEIGHT", "PUBLIC_DATA_TREE_HEIGHT", "L1_TO_L2_MSG_TREE_HEIGHT",
  "ARCHIVE_HEIGHT", "MAX_NULLIFIERS_PER_TX", "MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX",
  "DOM_SEP__BLOCK_HEADER_HASH"]' >"$staging/selection.json"
protocol/constants-codegen/scripts/generate.sh --cpp "$staging/constants.hpp" --selection "$staging/selection.json" ||
  die "generating the tree parameters from constants.nr failed"
node "$helper" measure "$repo_root" "$staging/constants.hpp" "${artifacts[@]}" >"$measurement_file" ||
  die "measuring the genesis failed"
[ -s "$measurement_file" ] || die "measuring the genesis produced no JSON"

phase "Validate"
# Assigned separately so a helper failure aborts here; `eval "$(...)"` would swallow its exit status.
measured=$(node "$helper" parse "$measurement_file") || die "measurement failed validation"
eval "$measured"

echo "  nullifier tree root = $NULLIFIER_ROOT"
echo "  block header hash   = $HEADER_HASH"
echo "  archive root        = $ARCHIVE_ROOT"
echo "  seeds               = $(echo "$SEEDS" | wc -w)"

# The same values for wsdb's tests, which rebuild the canonical genesis in the native world state.
function write_seeds_header {
  local file=$1 field_include=$2 namespace=$3 field=$4
  {
    cat <<EOF
// GENERATED FILE - DO NOT EDIT.
// Regenerate with noir-projects/fnd/scripts/regenerate_genesis_constants.sh.
#pragma once

#include "$field_include"

#include <vector>

namespace $namespace {

/**
 * @brief The protocol contracts' registration nullifiers, seeded into the nullifier tree of a production genesis.
 *
 * Derived from the protocol contract artifacts: per protocol contract, the class registration nullifier siloed by
 * ContractClassRegistry and the instance publication nullifier siloed by ContractInstanceRegistry. Sorted ascending
 * because the indexed nullifier tree requires unique, strictly increasing prefilled leaves. A copy, for the tests, of
 * protocol/genesis/genesis.json, which the same script writes from the same measurement.
 */
inline std::vector<$field> genesis_protocol_nullifiers()
{
    return {
EOF
    for seed in $SEEDS; do echo "        $field(\"$seed\"),"; done
    cat <<EOF
    };
}

/**
 * @brief The genesis roots the seed vector above produces, measured by the reference world state.
 */
inline $field genesis_nullifier_tree_root()
{
    return $field("$NULLIFIER_ROOT");
}

inline $field genesis_block_header_hash()
{
    return $field("$HEADER_HASH");
}

inline $field genesis_archive_root()
{
    return $field("$ARCHIVE_ROOT");
}

} // namespace $namespace
EOF
  } >"$file"
}

# Every generated file is written to the staging directory first, so --check compares exactly what a regeneration
# would write.
node "$helper" write-package "$measurement_file" "$staging"
write_seeds_header "$staging/wsdb_seeds.hpp" field/field_element.hpp azteclabs::wsdb::world_state fr
generated=(
  "$staging/genesis.json:$genesis_pkg/genesis.json"
  "$staging/index.js:$genesis_pkg/index.js"
  "$staging/wsdb_seeds.hpp:$seeds_hpp"
)

if [ "$check_only" = 1 ]; then
  phase "Check"
  stale=0
  for pair in "${generated[@]}"; do
    cmp -s "${pair%%:*}" "${pair#*:}" || { echo "  stale: ${pair#*:}"; stale=1; }
  done
  [ "$stale" = 0 ] || die "the genesis is stale; run noir-projects/fnd/scripts/regenerate_genesis_constants.sh"
  echo "  the genesis is up to date"
  exit 0
fi

phase "Update the generated files"
for pair in "${generated[@]}"; do
  cp "${pair%%:*}" "${pair#*:}"
done


phase "Stage"
git add "$genesis_pkg/genesis.json" "$genesis_pkg/index.js" "$seeds_hpp"

echo
git --no-pager diff --cached --stat -- "$genesis_pkg" "$seeds_hpp"
echo
echo "Done. Review the staged diff and commit."
