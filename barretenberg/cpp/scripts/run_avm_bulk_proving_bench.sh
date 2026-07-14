#!/usr/bin/env bash
# Runs the AVM bulk proving benchmark and writes github-action-benchmark JSON to
# bench-out/<name>.bench.json. This fully proves and verifies the bulk_testing tx, so it needs the
# global CRS (auto-located via the standard bb crs path). bench_merge then prefixes the metric names
# with this component's directory, so they appear on the dashboard under "barretenberg/cpp/...".
# This is the script used by ./bootstrap.sh bench_cmds.
set -eu

cd $(dirname $0)/..

bin=$1

name=avm-bulk-proving/public-tx
mkdir -p bench-out/$(dirname $name)

export HARDWARE_CONCURRENCY=${CPUS:-16}

# Contract artifacts. The binary also auto-discovers these by walking up from the cwd, but set them
# explicitly so the bench is robust to where it is invoked.
repo_root=$(git rev-parse --show-toplevel)
export AVM_CONTRACT_ARTIFACTS_DIR="$repo_root/noir-projects/noir-contracts/target"

BENCH_OUTPUT="bench-out/$name.bench.json" "$bin"
