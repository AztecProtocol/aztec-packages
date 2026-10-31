#!/usr/bin/env bash
# Recompiles the fixture programs into ../fixtures: each artifact, and for the programs with a
# Prover.toml the witness stack `nargo execute` solves it to. Uses the nargo this tree builds, which
# must be the noir version rust/Cargo.toml's acvm crates are.
set -euo pipefail
cd "$(dirname "$0")"
NARGO=${NARGO:-$(git rev-parse --show-toplevel)/noir/noir-repo/target/release/nargo}
rm -rf target
$NARGO compile --workspace --silence-warnings
for program in simple acir_calls; do
  $NARGO execute --package $program --silence-warnings
done
for artifact in target/*.json; do
  cp "$artifact" ../fixtures/
done
for witness in target/*.gz; do
  cp "$witness" "../fixtures/$(basename "$witness" .gz).witness.gz"
done
rm -rf target
