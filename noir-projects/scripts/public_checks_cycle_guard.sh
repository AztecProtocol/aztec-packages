#!/usr/bin/env bash
#
# Cycle guard for public_checks. Run from CI.
#
# public_checks's external functions must NOT reference its own canonical address. The contract
# crate may transitively depend on `canonical_addresses` through `aztec-nr/aztec` (which exports the
# stamp for app-side consumers in `public_checks::utils`), but the contract's compiled bytecode must
# not embed `PUBLIC_CHECKS_ADDRESS`: the public-facing functions (`check_timestamp`,
# `check_block_number`) don't reference it, so the helper is tree-shaken out of the contract artifact.
# This script enforces that invariant.
#
# Exit non-zero with a remediation message on failure.

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
ARTIFACT="$ROOT/noir-projects/noir-contracts/target/public_checks_contract-PublicChecks.json"
LIB_NR="$ROOT/noir-projects/aztec-nr/canonical_addresses/src/public_checks.nr"

if [ ! -f "$ARTIFACT" ]; then
  echo "public_checks artifact not found at $ARTIFACT — run bootstrap first." >&2
  exit 1
fi

if [ ! -f "$LIB_NR" ]; then
  echo "canonical_addresses public_checks.nr not found at $LIB_NR — run \`yarn workspace @aztec/canonical-contracts run regen:public-checks-address\` from yarn-project/." >&2
  exit 1
fi

stamped_address=$(grep -A1 'from_field' "$LIB_NR" | grep -o '0x[0-9a-fA-F]*')
if [ -z "$stamped_address" ] || [ "$stamped_address" = "0x0" ]; then
  exit 0
fi

stamped_field=$(printf '%s' "$stamped_address" | sed 's/^0x//' | tr 'A-F' 'a-f')

if jq -r '.. | .bytecode? // empty' "$ARTIFACT" | grep -i "$stamped_field" >/dev/null; then
  echo "public_checks must not embed its own address; bytecode contains $stamped_address." >&2
  echo "Audit any change that pulls \`public_checks::utils\` helpers into one of the contract's external functions; verify tree-shaking still elides them from the artifact." >&2
  exit 1
fi

echo "public_checks cycle guard: ok"
