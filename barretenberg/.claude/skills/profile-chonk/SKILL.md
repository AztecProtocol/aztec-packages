---
name: profile-chonk
description: Run the Chonk (client-IVC) prover on the remote bencher and collect Perfetto-compatible JSON traces. Supports both native and WASM runtimes. Generates a one-click Perfetto UI link for visual analysis. Use when asked to profile, trace, or visualize Chonk proving performance.
argument-hint: "[--wasm] [<flow> | --all]  e.g. transfer_1 or --wasm --all"
---

# Profile Chonk

Collect Perfetto traces for the Chonk (client-IVC) prover on the remote bencher and generate a Perfetto UI link.

Pass `--wasm` to profile the WASM runtime instead of native. Everything else is identical.

This is the profiling counterpart to `/benchmark-chonk` (which focuses on timing numbers) — use this when you want a visual trace in Perfetto UI.

## Prerequisites

Do the `/remote-bench` prerequisites first: the environment check (refuse to proceed if `BB_SSH_*` is unset), the remote bencher contract, and the lock rules. Run Step 3 below (lock, scp, ssh, download) as **one shell script in one Bash call**; otherwise the lock is released before the transfer.

## Step 1: Get pinned inputs

Always re-download so that stale inputs (e.g. from before a VK-breaking change like a trace layout shift) are replaced. The download is idempotent and fast.

```bash
cd barretenberg/cpp
FLOW="ecdsar1+transfer_0_recursions+sponsored_fpc"   # small smoke flow
INPUTS_ROOT="chonk-pinned-flows"

./scripts/chonk_inputs.sh download
ls "$INPUTS_ROOT"   # the available flows
```

## Step 2: Build bb

**Native:**
```bash
cmake --preset clang20-no-avm
cmake --build --preset clang20-no-avm --target bb
# Binary: build/bin/bb
```

**WASM (`--wasm`):** the `wasm-threads` preset builds with `ENABLE_WASM_BENCH=OFF`, which compiles out BB_BENCH and every trace writer: no output file is written. Reconfigure with `ENABLE_WASM_BENCH=ON`:
```bash
cmake --preset wasm-threads -DENABLE_WASM_BENCH=ON
cmake --build --preset wasm-threads --target bb
# Binary: build-wasm-threads/bin/bb
```

## Step 3: Run on remote and collect traces

Set these variables first:

```bash
FLOW="ecdsar1+transfer_0_recursions+sponsored_fpc"
HARDWARE_CONCURRENCY=${HARDWARE_CONCURRENCY:-16}
INPUTS_ROOT="chonk-pinned-flows"

# Acquire remote lock (released when this shell exits: keep everything below in the same shell)
source scripts/_benchmark_remote_lock.sh
```

**Native:**
```bash
REMOTE_DIR="$BB_SSH_CPP_PATH/build"
LOCAL_OUT="/tmp/chonk-profiles/native/$FLOW"
mkdir -p "$LOCAL_OUT"

ssh $BB_SSH_KEY $BB_SSH_INSTANCE "mkdir -p $REMOTE_DIR/profile-$FLOW && rm -f $REMOTE_DIR/profile-$FLOW/*.json"
scp $BB_SSH_KEY build/bin/bb "$BB_SSH_INSTANCE:$REMOTE_DIR/bin/bb"
scp $BB_SSH_KEY "$INPUTS_ROOT/$FLOW/ivc-inputs.msgpack" "$BB_SSH_INSTANCE:$REMOTE_DIR/profile-$FLOW/ivc-inputs.msgpack"

ssh $BB_SSH_KEY $BB_SSH_INSTANCE "
  set -euo pipefail
  cd $REMOTE_DIR
  HARDWARE_CONCURRENCY=$HARDWARE_CONCURRENCY BB_BENCH=1 \
  ./bin/bb prove \
    --scheme chonk -v \
    -o profile-$FLOW/out \
    --ivc_inputs_path             profile-$FLOW/ivc-inputs.msgpack \
    --trace_out_perfetto           profile-$FLOW/$FLOW.perfetto.json \
    --trace_out_perfetto_aggregate profile-$FLOW/$FLOW.perfetto.aggregate.json \
    --bench_out_hierarchical       profile-$FLOW/$FLOW.breakdown.json \
    2>                             profile-$FLOW/$FLOW.stderr.log
"
```

**WASM (`--wasm`):**
```bash
REMOTE_DIR="$BB_SSH_CPP_PATH/build-wasm-threads"
LOCAL_OUT="/tmp/chonk-profiles/wasm/$FLOW"
mkdir -p "$LOCAL_OUT"

ssh $BB_SSH_KEY $BB_SSH_INSTANCE "mkdir -p $REMOTE_DIR/bin && mkdir -p $REMOTE_DIR/profile-$FLOW && rm -f $REMOTE_DIR/profile-$FLOW/*.json"
scp $BB_SSH_KEY build-wasm-threads/bin/bb "$BB_SSH_INSTANCE:$REMOTE_DIR/bin/bb"
scp $BB_SSH_KEY "$INPUTS_ROOT/$FLOW/ivc-inputs.msgpack" "$BB_SSH_INSTANCE:$REMOTE_DIR/profile-$FLOW/ivc-inputs.msgpack"

ssh $BB_SSH_KEY $BB_SSH_INSTANCE "
  set -euo pipefail
  cd $REMOTE_DIR
  HARDWARE_CONCURRENCY=$HARDWARE_CONCURRENCY \
  /home/ubuntu/.wasmtime/bin/wasmtime run \
    -Wthreads=y -Sthreads=y -Wshared-memory=y \
    --env HARDWARE_CONCURRENCY --env HOME --env BB_BENCH=1 \
    --dir=\$HOME/.bb-crs --dir=. \
    ./bin/bb prove \
      --scheme chonk -v \
      -o profile-$FLOW/out \
      --ivc_inputs_path             profile-$FLOW/ivc-inputs.msgpack \
      --trace_out_perfetto           profile-$FLOW/$FLOW.perfetto.json \
      --trace_out_perfetto_aggregate profile-$FLOW/$FLOW.perfetto.aggregate.json \
      --bench_out_hierarchical       profile-$FLOW/$FLOW.breakdown.json \
      2>                             profile-$FLOW/$FLOW.stderr.log
"
```

**Download results (both runtimes):**
```bash
for f in "$FLOW.perfetto.json" "$FLOW.perfetto.aggregate.json" "$FLOW.breakdown.json" "$FLOW.stderr.log"; do
  scp $BB_SSH_KEY "$BB_SSH_INSTANCE:$REMOTE_DIR/profile-$FLOW/$f" "$LOCAL_OUT/$f"
done
echo "Results in: $LOCAL_OUT/"
```

To profile multiple flows, loop `FLOW` over the directories in `chonk-pinned-flows/`.

## Step 4: Open the trace in Perfetto

Default: open https://ui.perfetto.dev, choose "Open trace file" and pick `$LOCAL_OUT/$FLOW.perfetto.json`. Nothing leaves your machine.

To share a link, publish the trace only if the user explicitly asks for it. Perfetto opens a trace by URL with `https://ui.perfetto.dev/#!/?url=<raw_url>`, where `<raw_url>` is a publicly readable raw file URL (for example the raw URL of a public gist). A public gist is readable by anyone; traces contain only timing data, but confirm with the user first.

## Step 5: Analyze threading (optional)

`extract_perfetto_zone.py` (next to this file) reports, per invocation of a zone, the wall time, the summed per-thread busy time (`cpu_sum`), the number of busy threads and the utilization `cpu_sum / (wall × threads_busy)`, plus the top direct children by CPU.

Run this sequence to get a full picture of the proving pipeline:

```bash
TRACE="$LOCAL_OUT/$FLOW.perfetto.json"

for zone in \
  "Chonk::prove" \
  "Chonk::accumulate" \
  "HypernovaFoldingProver::sumcheck" \
  "OinkProver::prove" \
  "ShpleminiProver::prove" \
  "trace populate" \
  "construct_trace_data" \
  "compute_permutation_argument_polynomials"; do
  echo "=== $zone ==="
  python3 ../.claude/skills/profile-chonk/extract_perfetto_zone.py "$TRACE" "$zone" --top 5
done
```

After running, summarize findings as a markdown table with columns: zone, invocations, total wall time, avg thread utilization %, top child. Call out zones with utilization below 50% — those are the parallelism bottlenecks.

## Output files reference

All results land in `/tmp/chonk-profiles/{native,wasm}/<flow>/` (outside the repo, not git-tracked):

| File | Contents |
|------|----------|
| `<flow>.perfetto.json` | Per-call Chrome Trace Event JSON — the main trace for Perfetto UI |
| `<flow>.perfetto.aggregate.json` | Synthesized aggregate trace (smaller, lossy) — quick overview |
| `<flow>.breakdown.json` | `--bench_out_hierarchical` output — hierarchical op counts and timings |
| `<flow>.stderr.log` | stderr with `-v` timings — human-readable stage timings |

## Tips

- **One run is sufficient** — the remote bencher is isolated; no need to average.
- **Aggregate vs per-call:** `*.aggregate.json` loads faster in Perfetto but loses per-call detail. Use per-call for hot-spot identification.
- **Side-by-side comparison:** Run native first, then `--wasm` with the same flow, and compare the two traces' threading patterns.
