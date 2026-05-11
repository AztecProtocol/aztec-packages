#!/usr/bin/env bash
#
# Cycle guard for auth_registry. Run from CI.
#
# auth_registry must NOT depend (directly or transitively as a Nargo dep) on the
# canonical_addresses crate. The non-cycling two-pass build relies on the fact
# that auth_registry's compiled bytecode does not embed its own address: only
# the public-path wrappers in aztec-nr/authwit do, and those get tree-shaken.
# This script enforces both halves of that invariant.
#
# Exit non-zero with a remediation message on failure.

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
NARGO_TOML="$ROOT/noir-projects/noir-contracts/contracts/canonical/auth_registry_contract/Nargo.toml"
ARTIFACT="$ROOT/noir-projects/noir-contracts/target/auth_registry_contract-AuthRegistry.json"
LIB_NR="$ROOT/noir-projects/aztec-nr/canonical_addresses/src/lib.nr"

if grep -q '^canonical_addresses[[:space:]]*=' "$NARGO_TOML"; then
  echo "auth registry must not depend on its own address; use the private authwit path or move logic to a non-protocol helper." >&2
  exit 1
fi

if [ ! -f "$ARTIFACT" ]; then
  echo "auth_registry artifact not found at $ARTIFACT — run bootstrap first." >&2
  exit 1
fi

if [ ! -f "$LIB_NR" ]; then
  echo "canonical_addresses lib.nr not found at $LIB_NR — run \`yarn workspace @aztec/canonical-contracts run regen:auth-registry-address\` from yarn-project/." >&2
  exit 1
fi

stamped_address=$(grep -A1 'from_field' "$LIB_NR" | grep -o '0x[0-9a-fA-F]*')
if [ -z "$stamped_address" ] || [ "$stamped_address" = "0x0" ]; then
  exit 0
fi

stamped_field=$(printf '%s' "$stamped_address" | sed 's/^0x//' | tr 'A-F' 'a-f')

if jq -r '.. | .bytecode? // empty' "$ARTIFACT" | grep -i "$stamped_field" >/dev/null; then
  echo "auth registry must not depend on its own address; bytecode embeds the stamped address $stamped_address." >&2
  echo "Audit the use of public-path authwit helpers; verify tree-shaking still elides them from auth_registry." >&2
  exit 1
fi

echo "auth_registry cycle guard: ok"
