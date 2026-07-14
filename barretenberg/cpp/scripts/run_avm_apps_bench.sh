#!/usr/bin/env bash
# Runs the AVM public-tx apps simulation benchmark and writes github-action-benchmark JSON to
# bench-out/<name>.bench.json. bench_merge then prefixes the metric names with this component's
# directory, so they appear on the dashboard under "barretenberg/cpp/...".
# This is the script used by ./bootstrap.sh bench_cmds.
set -eu

cd $(dirname $0)/..

bin=$1

name=avm-apps-simulation/public-tx
mkdir -p bench-out/$(dirname $name)

export HARDWARE_CONCURRENCY=${CPUS:-8}

# Fixture inputs (contract artifacts + the storage-proof input). The binary also auto-discovers these
# by walking up from the cwd, but set them explicitly so the bench is robust to where it is invoked.
repo_root=$(git rev-parse --show-toplevel)
export AVM_CONTRACT_ARTIFACTS_DIR="$repo_root/noir-projects/noir-contracts/target"
export AVM_STORAGE_PROOF_JSON="$repo_root/barretenberg/cpp/src/vm2_contracts/account_proof.json"

BENCH_OUTPUT="bench-out/$name.bench.json" "$bin"
