---
name: remote-bench
description: Run benchmarks on the remote bencher, the dedicated EC2 machine for noise-free, single-run results. Handles env var validation, lock management, binary transfer, and result collection. Use with /benchmark-chonk or any BB benchmark target.
argument-hint: <target> e.g. "bb", "ultra_honk_bench", "wasm bb"
---

# Remote Bench

The **remote bencher** is a dedicated EC2 machine, isolated from shared workloads. One run there is publishable without averaging. Build locally, copy the binary and inputs over, run there, copy results back. `barretenberg/cpp/scripts/benchmark_remote.sh` is the canonical sequence; read it for the exact steps.

**This skill is a transport layer.** It does NOT know what to benchmark — combine it with `/benchmark-chonk` or other benchmark skills for the actual workload. For "did my PR regress?" answered from CI runs, use the root `bench-regression` skill instead.

## Prerequisites — environment check

**MANDATORY: refuse to proceed if `BB_SSH_KEY`, `BB_SSH_INSTANCE` or `BB_SSH_CPP_PATH` is unset.** Check only that the variables are non-empty; do not stat the key path (`BB_SSH_KEY` is an ssh flag such as `-i /path/key.pem`).

```bash
if [[ -z "$BB_SSH_KEY" || -z "$BB_SSH_INSTANCE" || -z "$BB_SSH_CPP_PATH" ]]; then
  echo "ERROR: remote bencher not configured (BB_SSH_KEY, BB_SSH_INSTANCE, BB_SSH_CPP_PATH)."
  echo "See barretenberg/cpp/scripts/README.md; ask a crypto eng team member for the key and hostname."
  exit 1
fi
ssh $BB_SSH_KEY $BB_SSH_INSTANCE "echo ok"
```

**If the env is not set up, stop and tell the user.** Do not run the benchmark locally as a fallback — the user invoked `/remote-bench` because they want stable results. One-time setup and troubleshooting: `barretenberg/cpp/scripts/README.md`.

## Remote bencher contract

The bencher is an execution host only: it receives binaries and data, not source history. Never:

- send git bundles to the bencher;
- create remote worktrees;
- fetch private branches from GitHub on the bencher;
- install per-session toolchains (such as WASI SDK) on the bencher to make a build work there.

If local build tooling is missing (`emcc`, WASI SDK, CMake preset support, or similar), stop and report a local devbox/copy-base bootstrap issue. Fix the local build environment; do not mutate the shared bencher.

## Lock

The bencher is shared. `scripts/_benchmark_remote_lock.sh` (source it, don't run it) polls `~/BENCHMARK_IN_PROGRESS` on the bencher 10 times, 10 s apart, then creates it and registers an EXIT/INT trap that deletes it.

- **Run lock, transfer, run and retrieve in one shell, i.e. one Bash call.** Each agent Bash call is its own shell: the lock is released when the sourcing shell exits, so a later scp/ssh in another call runs unlocked. The convenience scripts do this for you.
- If the lock is still held after the 10 retries, the sourced script runs `exit 1`, which ends the calling shell.
- If the lock is held, tell the user and suggest waiting or doing other work. Do **not** loop or poll for it.
- Release the lock promptly; do not hold it while analysing results locally.
- Stale lock after a crash: check `ssh $BB_SSH_KEY $BB_SSH_INSTANCE "pgrep -a bb || echo 'nothing running'"`; if nothing runs, `ssh $BB_SSH_KEY $BB_SSH_INSTANCE "rm ~/BENCHMARK_IN_PROGRESS"`.

## Usage patterns

All commands run from `barretenberg/cpp`.

### Native benchmark (any target)

```bash
./scripts/benchmark_remote.sh <target> ["<command>"] [preset] [build_dir]
```

Defaults: command `./<target>`, preset `clang20-no-avm`, build dir `build` (`clang20`, `clang20-no-avm` and `clang20-assert` all build into `build/`), `HARDWARE_CONCURRENCY=16`. The binary lands in `$BB_SSH_CPP_PATH/build`. Chonk has no synthetic benchmark: measure `bb prove --scheme chonk` on real example flows.

### Chonk with pinned inputs

Copy `chonk-pinned-flows/<flow>/ivc-inputs.msgpack` (see `/benchmark-chonk`) next to the binary, then run with the full profiling flags, in the same shell as the lock:

```bash
FLOW="schnorr+deploy_tokenContract_with_registration+sponsored_fpc"
cmake --preset clang20-no-avm && cmake --build --preset clang20-no-avm --target bb
source scripts/_benchmark_remote_lock.sh
scp $BB_SSH_KEY chonk-pinned-flows/$FLOW/ivc-inputs.msgpack ./build/bin/bb $BB_SSH_INSTANCE:$BB_SSH_CPP_PATH/build/
ssh $BB_SSH_KEY $BB_SSH_INSTANCE "cd $BB_SSH_CPP_PATH/build && \
  HARDWARE_CONCURRENCY=16 BB_BENCH=1 ./bb prove -o output --ivc_inputs_path ivc-inputs.msgpack --scheme chonk \
  -v --print_bench --bench_out_hierarchical benchmark_breakdown.json"
scp $BB_SSH_KEY $BB_SSH_INSTANCE:$BB_SSH_CPP_PATH/build/benchmark_breakdown.json .
```

`scripts/benchmark_example_ivc_flow_remote.sh bb "$FLOW"` wraps this with `--print_bench` only. It passes the build dir `build-no-avm`, which no preset produces, so it fails until the script is fixed; use the commands above. It also copies the inputs before taking the lock.

### WASM benchmark

Build `wasm-threads` locally and copy `build-wasm-threads/bin/bb` (and any inputs) to `$BB_SSH_CPP_PATH/build-wasm-threads/`. Run it with:

```bash
ssh $BB_SSH_KEY $BB_SSH_INSTANCE "cd $BB_SSH_CPP_PATH/build-wasm-threads && HARDWARE_CONCURRENCY=16 \
  /home/ubuntu/.wasmtime/bin/wasmtime run -Wthreads=y -Sthreads=y \
  --env HARDWARE_CONCURRENCY --env HOME --env BB_BENCH=1 --dir=\$HOME/.bb-crs --dir=. ./bb <COMMAND>"
```

`scripts/benchmark_wasm_remote.sh <target> "<command>"` mounts only `--dir=..` and sets neither `BB_BENCH` nor the CRS directory, so use the command above when the workload needs the CRS or BB_BENCH output.

### A/B branch comparison

```bash
./scripts/compare_branch_vs_baseline_remote.sh <target> '<filter>'       # native
./scripts/compare_branch_vs_baseline_remote_wasm.sh <target> '<filter>'  # WASM
```

Both build each branch locally (checking out the baseline in your working tree, so the tree must be clean) and run both binaries on the bencher, then compare with Google Benchmark's `compare.py`. The native baseline defaults to `merge-train/barretenberg` and honours `BASELINE_BRANCH`; the WASM script hard-codes `master`.

For Chonk A/B, do not use a synthetic benchmark — measure `bb prove --scheme chonk` against pinned `ivc-inputs.msgpack` for both branches and compare manually.

## Remote machine details

| Property | Value |
|----------|-------|
| User | `ubuntu` |
| wasmtime | `/home/ubuntu/.wasmtime/bin/wasmtime` |
| CRS | `~/.bb-crs` |
| Native build dir | `$BB_SSH_CPP_PATH/build` |
| WASM build dir | `$BB_SSH_CPP_PATH/build-wasm-threads` |
| Default `HARDWARE_CONCURRENCY` | `16` (match it for WASM comparisons) |

## Input artifacts: validate freshness BEFORE building

A stale input file fails in the worst order: you build and ship two large binaries, and only then hit a serialization error ("Missing field ..."). Before building anything against an input artifact found on the bencher (or any ad-hoc path):

1. **Check the mtime first**: `ssh ... ls -la <artifact>`. If it predates the last serialization-affecting change to its format (when in doubt: more than a few weeks old), treat it as stale until proven otherwise.
2. **Parse-smoke it with an existing binary before any build**: any current binary that can read the format (even a stale-ish one already on the box) surfaces a format mismatch in seconds.
3. **Prefer pinned, regenerable inputs over found files**: chonk flows have `scripts/chonk_inputs.sh download` (content-hash pinned, CI-refreshed). For formats without a pinned pipeline (e.g. AVM inputs), say so explicitly in the report and propose regeneration rather than silently substituting a proxy workload.
