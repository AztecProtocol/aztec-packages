# Chonk IVC Pipelining: Phase A/B Split

## What it does

Overlaps the next circuit's construction with the current circuit's accumulation in `PrivateExecutionSteps::accumulate()`. Circuit construction is split into two phases:

- **Phase A** (`build_non_recursion_constraints`): all constraint types except recursion. These have no dependency on IVC state (op_queue, verification_queue). Runs on a background thread with a null op_queue.
- **Phase B** (`build_recursion_and_finalize_constraints`): recursion constraints (Honk, HN, Chonk, AVM) + finalize. Requires the real op_queue from the previous circuit's accumulate. Runs on the main thread after accumulate completes.

During circuit *i*'s accumulate, a persistent background worker constructs Phase A of circuit *i+1*. When accumulate finishes, Phase B attaches the real op_queue and completes the builder, then the next accumulate begins immediately.

## Key invariant: null op_queue in Phase A

The `MegaCircuitBuilder` is constructed with `op_queue = nullptr` during Phase A. Any code that touches the op_queue during Phase A (i.e. any `queue_ecc_*` method) will hit a `BB_ASSERT` at the access site in `mega_circuit_builder.cpp`. This makes the contract "non-recursion constraints must not emit goblin ECC ops" load-bearing at runtime, rather than implicit.

After Phase A, `builder.attach_op_queue(real_queue)` installs the real IVC op_queue and calls `initialize_new_subtable()`. This is the only sanctioned way to transition from Phase A to Phase B.

## Files modified

| File | What changed |
| ---- | ------------ |
| `dsl/acir_format/acir_format.{cpp,hpp}` | Split `build_constraints` into `build_non_recursion_constraints` + `build_recursion_and_finalize_constraints`. The original `build_constraints` is preserved as a call to both in sequence. |
| `stdlib_circuit_builders/mega_circuit_builder.hpp` | Constructors tolerate `op_queue_in == nullptr` (skip `initialize_new_subtable`). New `attach_op_queue()` method with assert that current op_queue is null. |
| `stdlib_circuit_builders/mega_circuit_builder.cpp` | `BB_ASSERT(op_queue != nullptr, ...)` at top of all six `queue_ecc_*` methods. |
| `chonk/private_execution_steps.cpp` | `PhaseAWorker` class (persistent background thread), `NO_PIPELINE` / `NO_TRIM` env-var toggles, `malloc_trim(0)` after each accumulate iteration. |
| `api/api_chonk.cpp` | `check_pipelined_vks` updated to use null-op_queue Phase A/B path. Added per-circuit RSS measurement diagnostic (malloc_trim + /proc/self/status). |
| `bb/cli.cpp` | `check_pipeline` subcommand wired to `check_pipelined_vks`. |

## PhaseAWorker: persistent background thread

Replaces `std::async(std::launch::async, ...)` which spawned a fresh OS thread per circuit. The persistent worker lives for the duration of `accumulate()`, blocks on a `condition_variable` when idle (zero CPU cost), and reuses a single glibc malloc arena across all Phase A invocations.

The `std::async` approach was investigated and found to produce nondeterministic memory overhead due to glibc per-thread arena accumulation: each new thread gets its own arena, and freed pages from cross-thread alloc/free patterns stay resident in orphaned arenas. The persistent worker bounds this to one arena.

In practice, the persistent worker had only marginal impact on memory variance (~5-10 MB tighter range vs std::async). The dominant source of VmRSS variance is glibc arena fragmentation from multi-threaded allocation pressure, not thread spawning.

## malloc_trim investigation

`malloc_trim(0)` after each accumulate iteration forces glibc to return free pages to the OS. Findings:

- Baseline (no pipelining) carries ~150-200 MB of allocator slack in VmRSS that `malloc_trim` reclaims.
- This slack is NOT visible in `mallinfo2().uordblks` (live heap), only in VmRSS.
- `malloc_trim` cost: ~0.8 s per AMM proving run (~7% wall).
- The CI dashboard's headline `memory` metric is VmRSS (via `ci3/memusage` / `ps -o rss=`), so trim directly reduces the dashboard number.
- Trim is gated by `NO_TRIM` env var (trim runs unless `NO_TRIM=1` is set).

## Benchmark results

### Dedicated bench machine, AMM flow (`ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc`)

4 runs/mode, first discarded as warmup, median of remaining 3. `benchmark_pipeline_flows_remote.sh`.

| Mode           | Wall med | Peak med | Wall delta vs baseline | Peak delta vs baseline |
| -------------- | -------- | -------- | ---------------------- | ---------------------- |
| baseline       |  11.95 s |   756 MB |                      - |                      - |
| pipelined      |  11.45 s |   863 MB |        -0.50 s (-4.2%) |       +107 MB (+14.2%) |
| baseline-trim  |  12.77 s |   591 MB |        +0.82 s (+6.9%) |       -165 MB (-21.8%) |
| pipelined-trim |  12.27 s |   605 MB |        +0.32 s (+2.7%) |       -151 MB (-20.0%) |

### Dedicated bench machine, 3-flow comparison (pipelined without trim only)

| Flow                             | Wall base | Wall pipe | Wall % | Peak base | Peak pipe |  Peak % |
| -------------------------------- | --------- | --------- | ------ | --------- | --------- | ------- |
| `transfer_0_recursions`          |    5.69 s |    5.62 s |  -1.2% |    354 MB |    417 MB |  +17.8% |
| `amm_add_liquidity_1_recursions` |   11.97 s |   11.41 s |  -4.7% |    734 MB |    838 MB |  +14.2% |
| `storage_proof_7_layers`         |   16.06 s |   15.10 s |  -6.0% |   1112 MB |   1467 MB |  +31.9% |

### CI dashboard comparison (last 20 merge-train/spartan runs, branch=prs)

| Flow                             | Native wall | Native mem | Wasm wall | Wasm mem |
| -------------------------------- | ----------- | ---------- | --------- | -------- |
| `amm_add_liquidity_1_recursions` |    14.08 s  |     508 MB |   38.79 s |   522 MB |
| `storage_proof_7_layers`         |    18.59 s  |     846 MB |   55.32 s |   848 MB |

### CI machine, PR commit e0827aec (pipelined, no trim, from child logs)

| Runtime | Wall  | Peak   | vs dashboard baseline                      |
| ------- | ----- | ------ | ------------------------------------------ |
| native  | ~13 s | 790 MB | -1 s (-7%), +282 MB (+55%) vs 508 MB/14.1s |
| wasm    | ~39 s | 598 MB | +0.5 s (+1%), +76 MB (+15%) vs 522 MB/38.8s |

Wasm wall improvement is within noise (single sample). Wasm memory cost is +76 MB with no wall benefit. This is the structural cost of one extra in-flight builder, without glibc arena amplification (wasm uses a single linear heap, not per-thread arenas).

## Key findings

### Memory cost is flow-dependent and scales superlinearly

Wall savings grow roughly linearly with circuit count. Memory cost grows faster than linearly — larger flows have larger peak builders and more allocator churn. AMM (+14%) is the best trade; storage_proof_7_layers (+32%) is worse.

### The per-circuit builder RSS measurement

`bb check_pipeline --scheme chonk --ivc_inputs_path <path>` runs each circuit through the Phase A/B path and reports per-circuit RSS delta (with malloc_trim between circuits). For the AMM flow:

- Largest builder: `private_kernel_reset` at 89 MB
- Most builders: 30-45 MB
- Smallest: `SponsoredFPC` at 1 MB, `Token:prepare_private_balance_increase` at 2 MB

The structural floor for pipelining memory cost = size of the builder being constructed in Phase A at the moment the main thread's accumulate is at peak RSS. In practice this is NOT the largest builder (89 MB) because the largest builder doesn't coincide with the largest accumulate. For AMM, the actual peak overlap adds ~32-47 MB structurally, with allocator slack on top.

### VmRSS vs live heap vs dashboard

- `mallinfo2().uordblks` (live heap): ~395 MB for AMM baseline. Reported by `--memory_profile_out`. Per-stage data is generated by `extract_memory_benchmarks.py` but **never reaches the dashboard** (entries are appended to `benchmarks.bench.json` but dropped before publication).
- VmRSS: ~508-756 MB for AMM baseline depending on machine. Reported by `ci3/memusage` (`ps -o rss=` sampled every 100ms) and by `/usr/bin/time -f '%M'` (`getrusage().ru_maxrss`). This IS the dashboard metric `app-proving/<flow>/native/memory`.
- The gap (~150-300 MB) is glibc allocator slack: pages retained in per-thread arenas but not in use. `malloc_trim(0)` closes this gap.
- Different machines have different slack depending on core count (glibc creates 8 * nproc arenas), cgroup settings, and glibc version.

### CI infrastructure notes

- The `ci-full` label enables `USE_TEST_CACHE=1` which causes the bench engine to skip commands whose redis cache key matches a prior run. Barretenberg-only C++ changes often don't bust the cache key, so AMM bench results get silently reused. Use `ci-full-no-test-cache` instead.
- The final `bench-out/bench.json` tarball is cached in S3 keyed on `git rev-parse HEAD^{tree}`. `cache_upload` skips if the key exists. Re-running CI on the same commit (even with a different label) reuses the stale tarball. To bust: make a tree-changing commit or delete the S3 object.
- `build_bench` (which populates the IVC capture fixtures needed for `ci_benchmark_ivc_flows.sh`) is invoked via the `yarn-project-benches` Makefile target, which runs as part of `make full`.

## Env var toggles

| Variable       | Default   | Effect                                                    |
| -------------- | --------- | --------------------------------------------------------- |
| `NO_PIPELINE`  | unset     | Set to `1` to disable pipelining (all circuits built on main thread via unified `create_circuit`). |
| `NO_TRIM`      | unset     | Set to `1` to disable `malloc_trim(0)` after each accumulate iteration. |

Both are read once at the start of `accumulate()`. They're intended for A/B benchmarking, not production deployment configuration.

## Benchmarking scripts

### `barretenberg/cpp/scripts/benchmark_pipeline_flows_remote.sh`

Runs the full A/B matrix on the dedicated remote bench machine. Builds bb locally, scps the binary + msgpack inputs to the remote, runs N iterations per (flow, mode) via ssh, prints a markdown summary table. Uses `benchmark_remote.sh` for the build/scp/ssh plumbing.

```bash
cd barretenberg/cpp
# Default: AMM flow, 4 modes (baseline, pipelined, baseline-trim, pipelined-trim), 4 runs each
./scripts/benchmark_pipeline_flows_remote.sh

# Custom
./scripts/benchmark_pipeline_flows_remote.sh \
  --flows "ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc ecdsar1+storage_proof_7_layers+sponsored_fpc" \
  --runs 5 --modes "baseline pipelined"
```

Requires `BB_SSH_KEY`, `BB_SSH_INSTANCE`, `BB_SSH_CPP_PATH` env vars and msgpack inputs on disk (run `test_chonk_standalone_vks_havent_changed.sh --download_pinned_inputs` first).

### `barretenberg/cpp/scripts/bench_pipeline_compare.sh`

Same comparison but runs locally (no remote). Uses `ci3/memusage` for peak RSS measurement. Useful for quick iteration on the dev box.

```bash
cd $(git rev-parse --show-toplevel)
barretenberg/cpp/scripts/bench_pipeline_compare.sh --flows "ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc" --runs 4
```

## Current status and open questions

**Status**: benchmarked, not shipped. Results are promising on AMM (pipelined-trim gives -20% memory / +2.7% wall vs baseline), less clear on larger flows (storage_proof_7_layers: pipelined gives -6% wall but +32% memory).

**Open questions**:
1. Does pipelined-trim recover memory on storage_proof_7_layers the same way it does on AMM? If so, the composite trade (trim + pipeline) may be shippable across all flows.
2. Should pipelining be gated on flow size (`num_circuits >= N`) to avoid paying the memory cost on small flows where the wall benefit is negligible?
3. The wasm story is weaker: no wall benefit, +15% memory, and `malloc_trim` doesn't exist in wasm. Is the wasm regression acceptable given browser memory constraints?
4. Should the `build_non_recursion_constraints` / `build_recursion_and_finalize_constraints` split be kept even if pipelining doesn't ship? It's a clean refactor on its own.
