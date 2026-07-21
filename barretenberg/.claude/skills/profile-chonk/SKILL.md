---
name: profile-chonk
description: Run the Chonk (client-IVC) prover on the remote EC2 and collect Perfetto-compatible JSON traces. Supports both native and WASM runtimes. Generates a one-click Perfetto UI link for visual analysis. Use when asked to profile, trace, or visualize Chonk proving performance.
argument-hint: "[--wasm] [<flow> | --all]  e.g. transfer_1 or --wasm --all"
---

# Profile Chonk

Collect Perfetto traces for the Chonk (client-IVC) prover on the remote EC2 benchmarking machine and generate a one-click Perfetto UI link.

Pass `--wasm` to profile the WASM runtime instead of native. Everything else is identical.

This is the profiling counterpart to `/benchmark-chonk` (which focuses on timing numbers) — use this when you want a visual trace in Perfetto UI.

## Prerequisites — environment check

**MANDATORY: Refuse to proceed if these are not set. Check ONLY that the variables are non-empty — do NOT separately check whether the key file path exists; the SSH connection test below is sufficient.**

```bash
if [[ -z "$BB_SSH_KEY" || -z "$BB_SSH_INSTANCE" || -z "$BB_SSH_CPP_PATH" ]]; then
  echo "ERROR: Remote benchmarking environment not configured."
  echo "  BB_SSH_KEY        — SSH key flag (e.g. -i /path/to/key.pem)"
  echo "  BB_SSH_INSTANCE   — EC2 hostname"
  echo "  BB_SSH_CPP_PATH   — Remote repo path (e.g. /home/ubuntu/aztec-packages/barretenberg/cpp)"
  exit 1
fi
ssh $BB_SSH_KEY $BB_SSH_INSTANCE "echo ok" || { echo "ERROR: Cannot connect."; exit 1; }
```

Ask a crypto eng team member for the SSH key and hostname.

## Remote bencher contract

The bencher is a runner, not a Git workspace or toolchain bootstrap host.

For private branches and private repos, the canonical workflow is:

1. Build the native or WASM `bb` binary locally in the session workspace.
2. Copy only the built binary plus the pinned input files to the bencher.
3. Run that copied binary on the bencher and copy trace outputs back.

Do not send git bundles to the bencher. Do not create remote worktrees. Do not
fetch private branches from GitHub on the bencher. Do not install per-session
toolchains such as WASI SDK on the shared bencher to make a build work there.

If the local session cannot build because `emcc`, WASI SDK, or another build
tool is missing, stop and report it as a local devbox/copy-base bootstrap issue.
The fix is to make the local build environment complete enough to produce the
binary, not to mutate the shared bencher.

## Available flows

```
ecdsar1+transfer_0_recursions+sponsored_fpc   (small smoke flow)
ecdsar1+transfer_1_recursions+sponsored_fpc
ecdsar1+transfer_1_recursions+private_fpc
ecdsar1+storage_proof_7_layers+sponsored_fpc
```

## Step 1: Get pinned inputs

Always re-download so that stale inputs (e.g. from before a VK-breaking change like a trace layout shift) are replaced. The download is idempotent and fast.

```bash
cd barretenberg/cpp
FLOW="ecdsar1+transfer_0_recursions+sponsored_fpc"
INPUTS_ROOT="chonk-pinned-flows"

./scripts/chonk_inputs.sh download
```

## Step 2: Build bb

**Native:**
```bash
cmake --preset clang20-no-avm
cmake --build --preset clang20-no-avm --target bb
# Binary: build/bin/bb
```

**WASM (`--wasm`):**
```bash
cmake --preset wasm-threads
cmake --build --preset wasm-threads --target bb
# Binary: build-wasm-threads/bin/bb
```

## Step 3: Run on remote and collect traces

Set these variables first:

```bash
FLOW="ecdsar1+transfer_0_recursions+sponsored_fpc"
HARDWARE_CONCURRENCY=${HARDWARE_CONCURRENCY:-16}
INPUTS_ROOT="chonk-pinned-flows"

# Acquire remote lock (auto-releases on exit)
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

To profile multiple flows, loop `FLOW` over the values in the Available flows section above.

## Step 4: Generate a Perfetto link

```bash
TRACE="$LOCAL_OUT/$FLOW.perfetto.json"

GIST_URL=$(gh gist create --public "$TRACE" | tail -1)
GIST_ID=$(basename "$GIST_URL")
RAW_URL=$(gh api "gists/$GIST_ID" --jq '.files | to_entries[0].value.raw_url')
echo "Perfetto link: https://ui.perfetto.dev/#!/?url=$RAW_URL"
```

Click the link — Perfetto UI fetches and opens the trace. Share with teammates; anyone with the link sees the same trace.

> **Note:** The gist is public. Traces contain only timing/performance data — no keys or secrets.

## Step 5: Analyze threading (optional)

Write this script to `/tmp/extract_perfetto_zone.py` (Claude: use the Write tool) and run it:

```python
#!/usr/bin/env python3
"""Extract multi-threading insights for a named zone from a BB_BENCH Perfetto trace.

Usage: extract_perfetto_zone.py <trace.perfetto.json> <zone_name> [--top N]
"""
import json
import sys
from collections import defaultdict


def load_events(path):
    with open(path) as f:
        data = json.load(f)
    evs = data["traceEvents"] if isinstance(data, dict) else data
    return [e for e in evs if e.get("ph") == "X" and "ts" in e and "dur" in e]


def union_coverage(intervals):
    if not intervals:
        return 0
    intervals.sort()
    total = 0
    cur_s, cur_e = intervals[0]
    for s, e in intervals[1:]:
        if s <= cur_e:
            cur_e = max(cur_e, e)
        else:
            total += cur_e - cur_s
            cur_s, cur_e = s, e
    total += cur_e - cur_s
    return total


def analyze(events, target, top_n=5):
    targets = [e for e in events if e.get("name") == target]
    if not targets:
        print(f"No events named '{target}' in trace.", file=sys.stderr)
        sys.exit(1)

    by_thread = defaultdict(list)
    for e in events:
        by_thread[(e.get("pid", 0), e.get("tid", 0))].append(e)
    for k in by_thread:
        by_thread[k].sort(key=lambda e: e["ts"])

    print(f"=== {target}: {len(targets)} invocation(s) ===\n")

    agg_wall = 0
    agg_cpu = 0
    agg_threads = set()

    for idx, win in enumerate(targets):
        ws = win["ts"]
        we = ws + win["dur"]
        wall = win["dur"]

        busy_per_tid = {}
        for (_pid, tid), thread_events in by_thread.items():
            intervals = []
            for e in thread_events:
                es, ee = e["ts"], e["ts"] + e["dur"]
                if ee <= ws or es >= we:
                    continue
                intervals.append((max(es, ws), min(ee, we)))
            if not intervals:
                continue
            busy = union_coverage(intervals)
            if busy > 0:
                busy_per_tid[tid] = busy

        threads_busy = len(busy_per_tid)
        cpu_sum = sum(busy_per_tid.values())
        util = cpu_sum / (wall * threads_busy) if threads_busy and wall else 0.0

        children_stats = defaultdict(lambda: {"cpu": 0, "count": 0, "tids": set()})
        for e in events:
            if e["ts"] < ws or e["ts"] + e["dur"] > we:
                continue
            if e.get("args", {}).get("parent") != target:
                continue
            s = children_stats[e["name"]]
            s["cpu"] += e["dur"]
            s["count"] += 1
            s["tids"].add(e.get("tid", 0))

        agg_wall += wall
        agg_cpu += cpu_sum
        agg_threads |= set(busy_per_tid.keys())

        print(
            f"[{idx:3d}] wall={wall/1000:9.2f} ms  "
            f"threads_busy={threads_busy:<3} "
            f"cpu_sum={cpu_sum/1000:10.2f} ms  util={util*100:5.1f}%"
        )
        top_tids = sorted(busy_per_tid.items(), key=lambda x: -x[1])[:8]
        tid_str = "  ".join(f"t{tid}:{b/1000:.1f}ms" for tid, b in top_tids)
        print(f"      per-thread (top 8): {tid_str}")

        if children_stats:
            top = sorted(children_stats.items(), key=lambda x: -x[1]["cpu"])[:top_n]
            print(f"      top {len(top)} direct children by CPU:")
            for name, st in top:
                print(
                    f"         {st['cpu']/1000:9.2f} ms  "
                    f"count={st['count']:<5} "
                    f"threads={len(st['tids']):<3} {name}"
                )
        print()

    if len(targets) > 1:
        n = len(agg_threads)
        util = agg_cpu / (agg_wall * n) if agg_wall and n else 0.0
        print(f"--- Aggregate over {len(targets)} invocations ---")
        print(f"  total wall : {agg_wall/1000:.2f} ms")
        print(f"  total cpu  : {agg_cpu/1000:.2f} ms")
        print(f"  threads    : {n}")
        print(f"  utilization: {util*100:.1f}% (of {n}-thread ideal)")


def main():
    args = sys.argv[1:]
    top_n = 5
    if "--top" in args:
        i = args.index("--top")
        top_n = int(args[i + 1])
        del args[i : i + 2]
    if len(args) != 2:
        print("Usage: extract_perfetto_zone.py <trace.perfetto.json> <zone> [--top N]", file=sys.stderr)
        sys.exit(2)
    events = load_events(args[0])
    analyze(events, args[1], top_n=top_n)


if __name__ == "__main__":
    main()
```

Run this sequence to get a full picture of the proving pipeline:

```bash
TRACE="$LOCAL_OUT/$FLOW.perfetto.json"

for zone in \
  "Chonk::prove" \
  "Chonk::accumulate" \
  "HypernovaFoldingProver::fold" \
  "OinkProver::prove" \
  "ShpleminiProver::prove" \
  "trace populate" \
  "construct_trace_data" \
  "compute_permutation_argument_polynomials"; do
  echo "=== $zone ==="
  python3 /tmp/extract_perfetto_zone.py "$TRACE" "$zone" --top 5
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

- **One run is sufficient** — the remote machine is isolated; no need to average.
- **WASM is ~2.8× slower than native** — expected; the ratio is consistent across circuit types.
- **Aggregate vs per-call:** `*.aggregate.json` loads faster in Perfetto but loses per-call detail. Use per-call for hot-spot identification.
- **Lock contention:** If the remote lock is held, tell the user and suggest waiting. Do not poll or retry in a loop.
- **Side-by-side comparison:** Run native first, then `--wasm` with the same flow, and share both Perfetto links to compare threading patterns.
