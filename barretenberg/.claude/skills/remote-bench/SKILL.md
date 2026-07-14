---
name: remote-bench
description: Run benchmarks on the dedicated remote EC2 benchmarking machine for noise-free, single-run results. Handles env var validation, lock management, binary transfer, and result collection. Use with /benchmark-chonk or any BB benchmark target.
argument-hint: <target> e.g. "bb", "ultra_honk_bench", "wasm bb"
---

# Remote Bench

Run barretenberg benchmarks on the dedicated remote EC2 instance for stable, noise-free measurements. This machine is isolated from shared workloads — results from a single run are publishable without averaging.

**This skill is a transport layer.** It handles: env validation, locking, binary transfer, remote execution, result retrieval. It does NOT know what to benchmark — combine it with `/benchmark-chonk` or other benchmark skills for the actual workload.

## Prerequisites — environment check

**MANDATORY: Refuse to proceed if these are not set.**

Before doing anything, verify the three required environment variables exist:

```bash
# Check all three are set
if [[ -z "$BB_SSH_KEY" || -z "$BB_SSH_INSTANCE" || -z "$BB_SSH_CPP_PATH" ]]; then
  echo "ERROR: Remote benchmarking environment not configured."
  echo "Required variables:"
  echo "  BB_SSH_KEY        — SSH key flag (e.g. -i /path/to/key.pem)"
  echo "  BB_SSH_INSTANCE   — EC2 hostname"
  echo "  BB_SSH_CPP_PATH   — Remote repo path (e.g. /home/ubuntu/aztec-packages/barretenberg/cpp)"
  echo ""
  echo "See barretenberg/cpp/scripts/README.md for setup instructions."
  echo "Ask a crypto eng team member for the SSH key and hostname."
  exit 1
fi

# Verify connectivity
ssh $BB_SSH_KEY $BB_SSH_INSTANCE "echo ok" || {
  echo "ERROR: Cannot connect to remote machine. Check BB_SSH_KEY and BB_SSH_INSTANCE."
  exit 1
}
```

**If the env is not set up, stop and tell the user.** Do not attempt to run benchmarks locally as a fallback — the user invoked `/remote-bench` because they want stable results.

## Remote bencher contract

The bencher is an execution host only. It is not a Git workspace and not a
toolchain bootstrap host.

For private branches and private repos, build the benchmark binary locally in
the session workspace, then copy the built binary and required input/result
files with `scp`. The bencher should receive binaries and data, not source
history.

Do not send git bundles to the bencher. Do not create remote worktrees. Do not
fetch private branches from GitHub on the bencher. Do not install per-session
toolchains such as WASI SDK on the shared bencher to make a build work there.

If local build tooling is missing (`emcc`, WASI SDK, CMake preset support, or
similar), stop and report a local devbox/copy-base bootstrap issue. Fix the
local build environment so it can produce the binary; do not mutate the shared
bencher as a workaround.

### Setup (one-time)

Add to `~/.zshrc` (ask a crypto eng team member for actual values):
```bash
export BB_SSH_KEY="-i /mnt/user-data/<username>/remote-bb-worker.pem"
export BB_SSH_INSTANCE="<hostname>"
export BB_SSH_CPP_PATH="/home/ubuntu/aztec-packages/barretenberg/cpp"
```

Full setup and troubleshooting: `barretenberg/cpp/scripts/README.md`

## Lock mechanism

The remote machine is a **shared resource**. A file lock (`~/BENCHMARK_IN_PROGRESS`) prevents concurrent benchmarks from corrupting results.

### Acquiring the lock

```bash
source barretenberg/cpp/scripts/_benchmark_remote_lock.sh
```

This script (meant to be **sourced**, not run):
1. Polls `~/BENCHMARK_IN_PROGRESS` on the remote machine (10 retries, 10s apart)
2. If still locked after 100s, **exits the calling script** with an error
3. Creates the lock file
4. Registers a trap to delete the lock on exit (including Ctrl-C)

The lock auto-releases when the sourcing script exits.

### When the lock is stuck

If a previous session crashed without cleaning up:

```bash
# Check if something is actually running
ssh $BB_SSH_KEY $BB_SSH_INSTANCE "pgrep -a bb || echo 'nothing running'"

# If nothing is running, safe to remove the stale lock
ssh $BB_SSH_KEY $BB_SSH_INSTANCE "rm ~/BENCHMARK_IN_PROGRESS"
```

### Multi-session coordination

When multiple Claude sessions need the remote machine:
- The lock is first-come-first-served. If locked, the session should **tell the user** and suggest waiting or doing other work.
- Sessions should **not** loop/poll for the lock — just report it's busy and let the user decide.

## Usage patterns

### Pattern 1: Native benchmark (any target)

The standard flow used by `scripts/benchmark_remote.sh`:

```bash
cd barretenberg/cpp

BENCHMARK="bb"                    # or ultra_honk_bench, etc. (Chonk: use bb with --scheme chonk on real example flows — there is no synthetic chonk benchmark)
PRESET="clang20-no-avm"          # or clang20
BUILD_DIR="build-no-avm"         # matches preset

# 1. Build locally
cmake --preset $PRESET
cmake --build --preset $PRESET --target $BENCHMARK

# 2. Acquire lock + transfer
source scripts/_benchmark_remote_lock.sh
scp $BB_SSH_KEY ./$BUILD_DIR/bin/$BENCHMARK $BB_SSH_INSTANCE:$BB_SSH_CPP_PATH/build/

# 3. Run remotely
ssh $BB_SSH_KEY $BB_SSH_INSTANCE \
  "cd $BB_SSH_CPP_PATH/build && HARDWARE_CONCURRENCY=16 <COMMAND>"

# 4. Copy results back
scp $BB_SSH_KEY $BB_SSH_INSTANCE:$BB_SSH_CPP_PATH/build/<result_files> .
```

Or use the convenience script:
```bash
./scripts/benchmark_remote.sh <target> "<command>" <preset> <build_dir>
```

### Pattern 2: Chonk with pinned inputs on remote

Combines with `/benchmark-chonk`:

```bash
cd barretenberg/cpp

FLOW="schnorr+deploy_tokenContract_with_registration+sponsored_fpc"

# 1. Build bb locally
cmake --preset clang20-no-avm
cmake --build --preset clang20-no-avm --target bb

# 2. Transfer inputs + binary
source scripts/_benchmark_remote_lock.sh
scp $BB_SSH_KEY \
  chonk-pinned-flows/$FLOW/ivc-inputs.msgpack \
  $BB_SSH_INSTANCE:$BB_SSH_CPP_PATH/build/
scp $BB_SSH_KEY ./build-no-avm/bin/bb $BB_SSH_INSTANCE:$BB_SSH_CPP_PATH/build/

# 3. Run with full profiling
ssh $BB_SSH_KEY $BB_SSH_INSTANCE \
  "cd $BB_SSH_CPP_PATH/build && \
   HARDWARE_CONCURRENCY=16 BB_BENCH=1 ./bb prove \
     -o output \
     --ivc_inputs_path ivc-inputs.msgpack \
     --scheme chonk \
     -v \
     --print_bench \
     --bench_out_hierarchical benchmark_breakdown.json"

# 4. Retrieve results
scp $BB_SSH_KEY $BB_SSH_INSTANCE:$BB_SSH_CPP_PATH/build/benchmark_breakdown.json .
```

Or use the convenience script:
```bash
./scripts/benchmark_example_ivc_flow_remote.sh bb "$FLOW"
```

### Pattern 3: WASM benchmark on remote

```bash
cd barretenberg/cpp

# 1. Build WASM locally
cmake --preset wasm-threads
cmake --build --preset wasm-threads --target bb

# 2. Transfer
source scripts/_benchmark_remote_lock.sh
ssh $BB_SSH_KEY $BB_SSH_INSTANCE "mkdir -p $BB_SSH_CPP_PATH/build-wasm-threads"
scp $BB_SSH_KEY ./build-wasm-threads/bin/bb $BB_SSH_INSTANCE:$BB_SSH_CPP_PATH/build-wasm-threads/

# 3. Also transfer inputs if benchmarking Chonk
scp $BB_SSH_KEY \
  chonk-pinned-flows/$FLOW/ivc-inputs.msgpack \
  $BB_SSH_INSTANCE:$BB_SSH_CPP_PATH/build-wasm-threads/

# 4. Run via wasmtime on remote
ssh $BB_SSH_KEY $BB_SSH_INSTANCE \
  "cd $BB_SSH_CPP_PATH/build-wasm-threads && \
   HARDWARE_CONCURRENCY=16 \
   /home/ubuntu/.wasmtime/bin/wasmtime run \
     -Wthreads=y -Sthreads=y \
     --env HARDWARE_CONCURRENCY \
     --env HOME \
     --env BB_BENCH=1 \
     --dir=\$HOME/.bb-crs \
     --dir=. \
     ./bb <COMMAND>"
```

Or use the convenience script:
```bash
./scripts/benchmark_wasm_remote.sh <target> "<command>"
```

### Pattern 4: A/B branch comparison

Compare current branch vs baseline (builds and runs both on remote):

```bash
# Native
./scripts/compare_branch_vs_baseline_remote.sh <target> '<filter>'

# WASM
./scripts/compare_branch_vs_baseline_remote_wasm.sh <target> '<filter>'
```

For Chonk A/B, do not use a synthetic benchmark — measure `bb prove --scheme chonk` against pinned `ivc-inputs.msgpack` for both branches and compare manually.

These use Google Benchmark's `compare.py` for statistical analysis. Note: comparison scripts check out the baseline branch locally, so your working tree must be clean.

## Scripts reference

| Script | Purpose |
|--------|---------|
| `scripts/benchmark_remote.sh` | Generic: build locally, scp, run remotely |
| `scripts/benchmark_wasm_remote.sh` | Same for WASM (wasmtime on remote) |
| `scripts/benchmark_example_ivc_flow_remote.sh` | Chonk with pinned inputs on remote (the only realistic Chonk bench) |
| `scripts/compare_branch_vs_baseline_remote.sh` | Generic A/B native |
| `scripts/compare_branch_vs_baseline_remote_wasm.sh` | Generic A/B WASM |
| `scripts/_benchmark_remote_lock.sh` | Lock mechanism (source it, don't run it) |

## Remote machine details

| Property | Value |
|----------|-------|
| User | `ubuntu` |
| wasmtime | `/home/ubuntu/.wasmtime/bin/wasmtime` |
| CRS | `~/.bb-crs` |
| Native build dir | `$BB_SSH_CPP_PATH/build` |
| WASM build dir | `$BB_SSH_CPP_PATH/build-wasm-threads` |
| Default `HARDWARE_CONCURRENCY` | `16` |

## Tips

- **Always check the env first.** If `BB_SSH_KEY`, `BB_SSH_INSTANCE`, or `BB_SSH_CPP_PATH` are missing, stop and tell the user.
- **One run is enough** on the remote machine — it's isolated. No need to average 3 runs like on shared machines.
- **Release the lock promptly** — don't hold it while analyzing results locally.
- **Build locally, run remotely** — the remote machine is for execution only. Never build on it.
- **HARDWARE_CONCURRENCY=16** is the standard on the remote machine. Match it for WASM comparisons.

## Input artifacts: validate freshness BEFORE building

A stale input file on the bencher fails in the worst possible order: you build
two large binaries (minutes), ship them, and only then discover the artifact
predates a serialization change ("Missing field ..."). The September-2025
`~/avm_inputs.bin` cost a full bb-avm A/B build before its first parse error.

Rules, in order, before building anything against an input artifact found on
the bencher (or any ad-hoc path):

1. **Check the mtime first**: `ssh ... ls -la <artifact>`. If it predates the
   last serialization-affecting change to its format (when in doubt: more than
   a few weeks old), treat it as stale until proven otherwise.
2. **Parse-smoke it with an existing binary before any build**: any current
   binary that can read the format (even a stale-ish one already on the box)
   surfaces a format mismatch in seconds.
3. **Prefer pinned, regenerable inputs over found files**: chonk flows have
   `scripts/chonk_inputs.sh download` (content-hash pinned, CI-refreshed).
   For formats without a pinned pipeline (e.g. AVM inputs), say so explicitly
   in the report and propose regeneration rather than silently substituting a
   proxy workload.
