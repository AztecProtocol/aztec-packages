#!/usr/bin/env bash
# Run the real Chonk (client-IVC) WASM prover on a remote benchmarking EC2 and
# collect Perfetto-compatible JSON traces for pinned example-app flows.
#
# Required env vars (same contract as the other *_remote.sh scripts):
#   BB_SSH_KEY       e.g. '-i /path/key.pem'
#   BB_SSH_INSTANCE  e.g. ubuntu@ec2-host
#   BB_SSH_CPP_PATH  path to <repo>/barretenberg/cpp on the remote
#
# Usage:
#   ./profile_chonk_wasm_remote.sh <flow>        # one flow
#   ./profile_chonk_wasm_remote.sh --all         # all three pinned flows
#
# Outputs (under ./chonk-wasm-profiles/<flow>/ locally):
#   <flow>.perfetto.json            per-call Chrome Trace Event JSON
#   <flow>.perfetto.aggregate.json  synthesized aggregate trace
#   <flow>.breakdown.json           --bench_out_hierarchical output
#   <flow>.stderr.log               wasmtime stderr capture
set -euo pipefail

ALL_FLOWS=(
  "ecdsar1+transfer_1_recursions+sponsored_fpc"
  "ecdsar1+transfer_1_recursions+private_fpc"
  "ecdsar1+storage_proof_7_layers+sponsored_fpc"
)

: "${BB_SSH_KEY:?BB_SSH_KEY is required (e.g. '-i /path/key.pem')}"
: "${BB_SSH_INSTANCE:?BB_SSH_INSTANCE is required (e.g. ubuntu@host)}"
: "${BB_SSH_CPP_PATH:?BB_SSH_CPP_PATH is required (remote barretenberg/cpp path)}"
HARDWARE_CONCURRENCY=${HARDWARE_CONCURRENCY:-16}

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <flow> | --all" >&2
  echo "Flows: ${ALL_FLOWS[*]}" >&2
  exit 1
fi

if [[ "$1" == "--all" ]]; then
  FLOWS=("${ALL_FLOWS[@]}")
else
  FLOWS=("$1")
fi

cd "$(dirname "$0")/.."
CPP_ROOT=$PWD
REPO_ROOT=$(git rev-parse --show-toplevel)
INPUTS_ROOT="$REPO_ROOT/yarn-project/end-to-end/example-app-ivc-inputs-out"
OUT_ROOT="${CHONK_WASM_PROFILES_OUT:-$HOME/chonk-wasm-profiles}"
mkdir -p "$OUT_ROOT"

# Ensure pinned inputs are on disk; the checker script knows how to fetch them.
missing_inputs=0
for flow in "${FLOWS[@]}"; do
  if [[ ! -f "$INPUTS_ROOT/$flow/ivc-inputs.msgpack" ]]; then
    missing_inputs=1
    echo "Missing: $INPUTS_ROOT/$flow/ivc-inputs.msgpack" >&2
  fi
done
if [[ $missing_inputs -eq 1 ]]; then
  echo "Downloading pinned inputs via test_chonk_standalone_vks_havent_changed.sh..."
  "$CPP_ROOT/scripts/test_chonk_standalone_vks_havent_changed.sh" --download_pinned_inputs
fi

echo "==> Building WASM bb (wasm-threads preset; ENABLE_WASM_BENCH=ON)"
cmake --preset wasm-threads
cmake --build --preset wasm-threads --target bb

# Acquire remote lock; cleanup is handled via trap inside the sourced script.
source "$CPP_ROOT/scripts/_benchmark_remote_lock.sh"

REMOTE_DIR="$BB_SSH_CPP_PATH/build-wasm-threads"
ssh $BB_SSH_KEY $BB_SSH_INSTANCE "mkdir -p $REMOTE_DIR/bin"

echo "==> Uploading bb WASM binary"
scp $BB_SSH_KEY "$CPP_ROOT/build-wasm-threads/bin/bb" "$BB_SSH_INSTANCE:$REMOTE_DIR/bin/bb"

for flow in "${FLOWS[@]}"; do
  echo "==> Flow: $flow"
  LOCAL_FLOW_OUT="$OUT_ROOT/$flow"
  mkdir -p "$LOCAL_FLOW_OUT"
  REMOTE_FLOW_DIR="$REMOTE_DIR/profile-$flow"

  ssh $BB_SSH_KEY $BB_SSH_INSTANCE "mkdir -p $REMOTE_FLOW_DIR && rm -f $REMOTE_FLOW_DIR/*.json"
  echo "  uploading ivc-inputs.msgpack"
  scp $BB_SSH_KEY "$INPUTS_ROOT/$flow/ivc-inputs.msgpack" \
      "$BB_SSH_INSTANCE:$REMOTE_FLOW_DIR/ivc-inputs.msgpack"

  REMOTE_CMD=$(cat <<REMOTE
set -euo pipefail
cd $REMOTE_DIR
HARDWARE_CONCURRENCY=$HARDWARE_CONCURRENCY \
/home/ubuntu/.wasmtime/bin/wasmtime run \
  -Wthreads=y -Sthreads=y -Wshared-memory=y \
  --env HARDWARE_CONCURRENCY --env HOME --env BB_BENCH=1 \
  --dir=\$HOME/.bb-crs --dir=. \
  ./bin/bb prove \
    --scheme chonk \
    -v \
    -o profile-$flow/out \
    --ivc_inputs_path profile-$flow/ivc-inputs.msgpack \
    --trace_out_perfetto           profile-$flow/$flow.perfetto.json \
    --trace_out_perfetto_aggregate profile-$flow/$flow.perfetto.aggregate.json \
    --bench_out_hierarchical       profile-$flow/$flow.breakdown.json \
  2> profile-$flow/$flow.stderr.log
REMOTE
)
  echo "  running bb prove under wasmtime (HARDWARE_CONCURRENCY=$HARDWARE_CONCURRENCY)"
  ssh $BB_SSH_KEY $BB_SSH_INSTANCE "$REMOTE_CMD"

  echo "  downloading results"
  for f in "$flow.perfetto.json" "$flow.perfetto.aggregate.json" "$flow.breakdown.json" "$flow.stderr.log"; do
    scp $BB_SSH_KEY "$BB_SSH_INSTANCE:$REMOTE_FLOW_DIR/$f" "$LOCAL_FLOW_OUT/$f"
  done
  echo "  done -> $LOCAL_FLOW_OUT/"
done

echo "All profiles available under: $OUT_ROOT"
