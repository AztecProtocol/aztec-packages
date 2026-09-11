#!/usr/bin/env bash
set -euo pipefail

# Deletes everything under the bundled foundry subtree's out/ that forge's cache does not reference.
#
# The subtree is copied from a parent l1-contracts built with its tests, so out/ carries an artifact
# for every test contract — ~100MB of the ~140MB package, for sources the bundle does not even ship.
# The deploy path (yarn-project/ethereum's forge script run) only ever reads the artifacts named by
# cache/solidity-files-cache.json, so anything absent from the cache is dead weight. Deriving the
# keep set from the cache rather than a name pattern keeps this correct as contracts come and go.

# Defaults to the bundle the copy script produces; takes a path so it can be run against an
# extracted package tarball.
cd "${1:-$(git rev-parse --show-toplevel)/l1-contracts/l1-artifacts/l1-contracts}"

cache="cache/solidity-files-cache.json"
[ -f "$cache" ] || { echo "Error: $cache not found. Run copy-foundry-artifacts.sh first." >&2; exit 1; }
[ -d out ] || { echo "Error: out/ not found. Run copy-foundry-artifacts.sh first." >&2; exit 1; }

keep=$(mktemp) all=$(mktemp)
trap 'rm -f "$keep" "$all"' EXIT

# Every artifact a cached source compiled to, plus the build-info each of those builds refers back to.
jq -r '([.files[].artifacts[][][].path] + [.builds[] | "build-info/" + . + ".json"]) | unique[]' \
  "$cache" | sort -u > "$keep"
find out -type f -printf '%P\n' | sort > "$all"

# A forge cache whose shape we no longer understand would yield an empty keep set and take the whole
# of out/ with it, leaving a package that silently recompiles (or fails) at deploy time.
kept=$(wc -l < "$keep")
if [ "$kept" -lt 100 ]; then
  echo "Error: cache named only $kept artifacts; refusing to prune. Has the forge cache format changed?" >&2
  exit 1
fi

before=$(du -sk out | cut -f1)
comm -23 "$all" "$keep" | sed 's|^|out/|' | tr '\n' '\0' | xargs -0 --no-run-if-empty rm -f
find out -type d -empty -delete
after=$(du -sk out | cut -f1)

echo "Pruned $(( (before - after) / 1024 ))MB of unreferenced artifacts from out/ ($(( before / 1024 ))MB -> $(( after / 1024 ))MB)."
