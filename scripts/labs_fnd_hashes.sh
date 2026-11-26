#!/usr/bin/env bash
# Records the identity of the foundation components the labs submodule consumes in
# labs/labs-aztec-toolchain/fnd-hashes, one <name>=<value> per line. The labs toolchain hash
# (foundation mode) is that directory's committed content, and every labs cache key composes
# it, so the labs build and test caches follow the foundation tree exactly.
#
# The values are ci3's: the labs-use-local make step runs this with its prerequisites (the
# providers, LABS_PROVIDERS in the Makefile) in the environment as CI3_KEY_<NAME>, each the hash of
# that provider's outputs (or its key). A provider whose inputs have uncommitted changes is
# disabled-cache, which disables labs caching too.
set -euo pipefail
root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
out=$root/labs/labs-aztec-toolchain/fnd-hashes
values=$(env | grep '^CI3_KEY_' | sort || true)
[ -n "$values" ] || { echo "labs_fnd_hashes: no CI3_KEY_* values: run it through 'make labs-use-local'" >&2; exit 1; }
# The optional toolchain binaries this tree built (bb-avm is skipped by AVM=0 builds,
# noir-execute by the noir-from-release flow); their presence is part of the toolchain's identity,
# since labs falls back to the WASM simulator when noir-execute is absent.
optional=""
[ -f "$root/barretenberg/cpp/build/bin/bb-avm" ] && optional+=" bb-avm"
[ -f "$root/noir/noir-repo/target/release/noir-execute" ] && optional+=" noir-execute"
{
  sed 's/^CI3_KEY_//' <<<"$values"
  echo "optional=${optional# }"
} >"$out"
cat "$out"
