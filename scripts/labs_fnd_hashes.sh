#!/usr/bin/env bash
# Records the content hashes of the foundation components the labs submodule consumes in
# labs/labs-aztec-toolchain/fnd-hashes, one <name>=<hash> per line. The labs toolchain hash
# (foundation mode) is that directory's committed content, and every labs cache key composes
# it, so the labs build and test caches follow the foundation tree exactly. The list is the
# same set of providers as labs-deps in the Makefile: the binaries and everything the
# use-local manifests portal into.
set -euo pipefail
root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
out=$root/labs/labs-aztec-toolchain/fnd-hashes
components="barretenberg/cpp noir barretenberg/ts wsdb ipc-runtime l1-contracts protocol/constants-codegen noir-projects/fnd"
{
  for c in $components; do
    # Each bootstrap derives its ci3 root from its own repo; clear the inherited one.
    h=$(cd "$root/$c" && env -u root -u ci3 ./bootstrap.sh hash)
    [ -n "$h" ] || { echo "no hash from $c" >&2; exit 1; }
    echo "$c=$h"
  done
} > "$out"
cat "$out"
