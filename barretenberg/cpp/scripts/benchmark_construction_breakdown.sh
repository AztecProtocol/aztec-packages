#!/usr/bin/env bash
# One-off: measure circuit construction vs total proving cost on remote, native + wasm.
# Assumes binaries are already built (clang20-no-avm -> build-no-avm, wasm-threads -> build-wasm-threads)
# and that pinned IVC inputs have been downloaded under yarn-project/end-to-end/example-app-ivc-inputs-out/.
set -eu

HARDWARE_CONCURRENCY=${HARDWARE_CONCURRENCY:-16}
OUT_DIR=${OUT_DIR:-/tmp/chonk-construction-bench}
mkdir -p "$OUT_DIR"

FLOWS=(
  "small:ecdsar1+transfer_0_recursions+sponsored_fpc"
  "medium:ecdsar1+transfer_1_recursions+sponsored_fpc"
  "large:ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc"
)

# Move to barretenberg/cpp
cd "$(dirname "$0")/.."

# Acquire remote lock (trap cleanup on exit)
source scripts/_benchmark_remote_lock.sh

REMOTE_BASE=$BB_SSH_CPP_PATH
REMOTE_WORK="$REMOTE_BASE/build-construction-bench"

ssh $BB_SSH_KEY $BB_SSH_INSTANCE "mkdir -p $REMOTE_WORK"

# Push binaries once
scp $BB_SSH_KEY build/bin/bb $BB_SSH_INSTANCE:$REMOTE_WORK/bb-native
scp $BB_SSH_KEY build-wasm-threads/bin/bb $BB_SSH_INSTANCE:$REMOTE_WORK/bb.wasm

# Push msgpacks for all flows
for entry in "${FLOWS[@]}"; do
  label="${entry%%:*}"
  flow="${entry#*:}"
  src="../../yarn-project/end-to-end/example-app-ivc-inputs-out/$flow/ivc-inputs.msgpack"
  scp $BB_SSH_KEY "$src" "$BB_SSH_INSTANCE:$REMOTE_WORK/ivc-inputs-$label.msgpack"
done

run_native () {
  local label="$1"
  local local_log="$OUT_DIR/native-$label.log"
  local local_json="$OUT_DIR/native-$label.json"
  echo ">>> native $label"
  ssh $BB_SSH_KEY $BB_SSH_INSTANCE "
    cd $REMOTE_WORK &&
    HARDWARE_CONCURRENCY=$HARDWARE_CONCURRENCY ./bb-native prove \
      -o output-native-$label \
      --ivc_inputs_path ivc-inputs-$label.msgpack \
      --scheme chonk \
      -v \
      --print_bench \
      --bench_out_hierarchical breakdown-native-$label.json
  " >"$local_log" 2>&1 || { echo 'native run failed — see log'; tail -40 "$local_log"; exit 1; }
  scp $BB_SSH_KEY "$BB_SSH_INSTANCE:$REMOTE_WORK/breakdown-native-$label.json" "$local_json"
}

run_wasm () {
  local label="$1"
  local local_log="$OUT_DIR/wasm-$label.log"
  local local_json="$OUT_DIR/wasm-$label.json"
  echo ">>> wasm $label"
  # wasmtime needs --dir for CRS and working dir. Use HOME-less explicit path.
  ssh $BB_SSH_KEY $BB_SSH_INSTANCE "
    cd $REMOTE_WORK &&
    HARDWARE_CONCURRENCY=$HARDWARE_CONCURRENCY BB_BENCH=1 /home/ubuntu/.wasmtime/bin/wasmtime run \
      --env HARDWARE_CONCURRENCY \
      --env HOME \
      --env BB_BENCH \
      -Wthreads=y -Wshared-memory=y -Sthreads=y \
      --dir=\$HOME/.bb-crs \
      --dir=. \
      ./bb.wasm prove \
        -o output-wasm-$label \
        --ivc_inputs_path ivc-inputs-$label.msgpack \
        --scheme chonk \
        -v \
        --print_bench \
        --bench_out_hierarchical breakdown-wasm-$label.json
  " >"$local_log" 2>&1 || { echo 'wasm run failed — see log'; tail -40 "$local_log"; exit 1; }
  scp $BB_SSH_KEY "$BB_SSH_INSTANCE:$REMOTE_WORK/breakdown-wasm-$label.json" "$local_json" || true
}

for entry in "${FLOWS[@]}"; do
  label="${entry%%:*}"
  run_native "$label"
done

for entry in "${FLOWS[@]}"; do
  label="${entry%%:*}"
  run_wasm "$label"
done

echo "All runs complete. Logs and JSON in $OUT_DIR/"
