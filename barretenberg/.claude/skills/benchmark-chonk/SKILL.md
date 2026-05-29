---
name: benchmark-chonk
description: Run realistic Chonk (client IVC) benchmarks using pinned protocol inputs. Covers native and WASM proving, per-circuit breakdowns, BB_BENCH instrumentation, and profiling code augmentation. Use when asked to benchmark, profile, or measure Chonk proving performance.
argument-hint: <action> e.g. "run", "compare", "wasm", "instrument <area>", "per-circuit", "download-inputs"
---

# Benchmark Chonk

Run realistic Chonk IVC benchmarks using **pinned protocol inputs** (real transaction flows captured from end-to-end tests).

**Chonk has no synthetic micro-benchmark.** Always benchmark Chonk via `bb prove --scheme chonk` against pinned `ivc-inputs.msgpack` for real transaction flows. If a Chonk proving question seems to call for a micro-benchmark, the answer is still `bb prove` on a real flow.

## Step 1: Get pinned IVC inputs

The real benchmark inputs are pinned to an S3 artifact keyed by a 16-character hash prefix. Download them:

```bash
barretenberg/cpp/scripts/chonk_inputs.sh download
```

This populates `barretenberg/cpp/chonk-pinned-flows/<flow>/ivc-inputs.msgpack`.

Available flows (typical):
- `ecdsar1+transfer_1_recursions+sponsored_fpc`
- `schnorr+deploy_tokenContract_with_registration+sponsored_fpc`
- `ecdsar1+amm_add_liquidity_1_recursions+sponsored_fpc`
- `ecdsar1+transfer_1_recursions+private_fpc`
- and more under `barretenberg/cpp/chonk-pinned-flows/` after downloading

The pinned hash prefix is maintained in `barretenberg/cpp/scripts/chonk-inputs.hash`. The S3 URL is:
```
https://aztec-ci-artifacts.s3.us-east-2.amazonaws.com/protocol/bb-chonk-inputs-<hash>.tar.gz
```

To update the pinned inputs (after protocol changes that affect VKs):
```bash
barretenberg/cpp/scripts/chonk_inputs.sh update
```

## Step 2: Build bb

```bash
cd barretenberg/cpp
cmake --preset clang20
cmake --build --preset clang20 --target bb
```

Build dir: `build`. To use a different native preset, build with that preset and set `NATIVE_PRESET` when running the benchmark script.

## Step 3: Run the benchmark

**Always set `HARDWARE_CONCURRENCY=8` for local runs.** The remote benchmarking machine uses 16, but local/shared machines should use 8. See `/remote-bench` for remote execution.

### Native

For the standard local path, download the pinned inputs and use the same benchmark script CI uses:

```bash
barretenberg/cpp/scripts/chonk_inputs.sh download
HARDWARE_CONCURRENCY=8 barretenberg/cpp/scripts/ci_benchmark_ivc_flows.sh native
```

The benchmark script defaults to `ecdsar1+transfer_0_recursions+sponsored_fpc`. If a flow fails, the pinned inputs remain in `barretenberg/cpp/chonk-pinned-flows/<flow>/ivc-inputs.msgpack`; rerun the same case by passing the flow directory:

```bash
HARDWARE_CONCURRENCY=8 barretenberg/cpp/scripts/ci_benchmark_ivc_flows.sh native \
  barretenberg/cpp/chonk-pinned-flows/<flow>
```

The CI benchmark also cross-checks the proof against the generated protocol VK artifacts under `noir-projects/noir-protocol-circuits/target`. That is a post-prove check, not part of the pinned input download.

For manual runs:

```bash
cd barretenberg/cpp

FLOW="schnorr+deploy_tokenContract_with_registration+sponsored_fpc"
OUTPUT_DIR="/tmp/chonk-bench-out"
mkdir -p $OUTPUT_DIR

HARDWARE_CONCURRENCY=8 ./build/bin/bb prove \
  -o $OUTPUT_DIR \
  --ivc_inputs_path chonk-pinned-flows/$FLOW/ivc-inputs.msgpack \
  --scheme chonk \
  -v \
  --print_bench \
  --bench_out_hierarchical $OUTPUT_DIR/benchmark_breakdown.json
```

### WASM (via wasmtime)

Use the CI benchmark script with the WASM runtime:

```bash
barretenberg/cpp/scripts/chonk_inputs.sh download
HARDWARE_CONCURRENCY=8 barretenberg/cpp/scripts/ci_benchmark_ivc_flows.sh wasm
```

For manual runs:

Build the WASM binary with threads enabled:

```bash
cd barretenberg/cpp
cmake --preset wasm-threads
cmake --build --preset wasm-threads --target bb
```

Run via wasmtime (the `scripts/wasmtime.sh` wrapper sets standard flags):

```bash
cd barretenberg/cpp

FLOW="schnorr+deploy_tokenContract_with_registration+sponsored_fpc"
OUTPUT_DIR="/tmp/chonk-bench-wasm"
mkdir -p $OUTPUT_DIR

# Copy inputs to a working dir wasmtime can access
cp chonk-pinned-flows/$FLOW/ivc-inputs.msgpack $OUTPUT_DIR/

cd $OUTPUT_DIR
HARDWARE_CONCURRENCY=8 BB_BENCH=1 \
  /path/to/barretenberg/cpp/scripts/wasmtime.sh \
  /path/to/barretenberg/cpp/build-wasm-threads/bin/bb prove \
    -o output \
    --ivc_inputs_path ivc-inputs.msgpack \
    --scheme chonk \
    -v \
    --print_bench \
    --bench_out_hierarchical benchmark_breakdown.json
```

The wasmtime wrapper sets:
- `-Wthreads=y -Sthreads=y` — enable WASM threads and shared memory
- `--env HARDWARE_CONCURRENCY` — thread count
- `--env BB_BENCH` — enable operation counting (`ENABLE_WASM_BENCH=ON` is set by the `wasm-threads` preset)
- `--dir=$HOME/.bb-crs --dir=.` — filesystem access for CRS and working directory

## Local runs are noisy — average 3 runs

Non-dedicated machines have variable CPU load. **Run the benchmark at least 3 times and average the results.** Only the remote benchmarking machine (see `/remote-bench` skill) provides stable, isolated CPU for single-run measurements.

When iterating locally on profiling code changes, relative comparisons (before vs after your change) are still valid on noisy machines — just ensure you compare runs taken close together under similar load.

## Using with the remote benchmarking machine

For noise-free, publishable results, use the `/remote-bench` skill to run on the dedicated EC2 instance. The two skills compose naturally:

1. `/benchmark-chonk download-inputs` — get pinned inputs locally
2. `/remote-bench` — build locally, scp binary + inputs to remote, run there, copy results back

See the `/remote-bench` skill for setup, lock management, and usage.

## BB_BENCH instrumentation system

### How it works

`BB_BENCH` is an always-compiled, low-overhead RAII profiling system.

**Header:** `barretenberg/cpp/src/barretenberg/common/bb_bench.hpp`
**Implementation:** `barretenberg/cpp/src/barretenberg/common/bb_bench.cpp`

**Macros:**
```cpp
BB_BENCH()                    // label = __func__
BB_BENCH_NAME("label")        // custom label (preferred)
BB_BENCH_ONLY_NAME("label")   // no Tracy, no nesting — lightweight
BB_BENCH_ENABLE_NESTING()     // set parent context for child operations
```

The macros create `BenchReporter` RAII objects that:
1. On construction: capture parent context + start time
2. On destruction: record elapsed time with parent association
3. Build a hierarchical call tree automatically

**Activation:** `BB_BENCH=1` env var, or `--print_bench` / `--bench_out_hierarchical` CLI flags.

### Google Benchmark integration

For `.bench.cpp` targets that integrate BB_BENCH into Google Benchmark counters:
```cpp
#include "barretenberg/common/google_bb_bench.hpp"

for (auto _ : state) {
    GOOGLE_BB_BENCH_REPORTER(state);  // clears stats, collects on destruction
    // ... benchmark body ...
}
```

`GOOGLE_BB_BENCH_REPORTER(state)` creates a `GoogleBbBenchReporter` which:
- **Constructor:** calls `GLOBAL_BENCH_STATS.clear()` — resets all accumulated stats
- **Destructor:** aggregates stats into Google Benchmark counters (each operation becomes a `(s)` suffixed counter)

### Per-circuit / per-accumulate breakdown

**Key function:** `bb::detail::GLOBAL_BENCH_STATS.clear()`
(`barretenberg/cpp/src/barretenberg/common/bb_bench.cpp`)

```cpp
void GlobalBenchStatsContainer::clear()
{
    std::unique_lock<std::mutex> lock(mutex);
    for (std::shared_ptr<TimeStatsEntry>& entry : entries) {
        entry->count = TimeStats();  // resets to zero without losing entry structure
    }
}
```

**Usage pattern for per-circuit profiling:**

The `--print_bench` output aggregates across all 19 circuits. To get per-circuit timing, temporarily instrument `barretenberg/cpp/src/barretenberg/bbapi/bbapi_chonk.cpp`:

1. Add `#include <chrono>` at the top
2. In `ChonkAccumulate::execute()`, wrap the `accumulate()` call:

```cpp
    info("ChonkAccumulate - accumulating circuit '", request.loaded_circuit_name, "'");
    bb::detail::GLOBAL_BENCH_STATS.clear();
    auto circuit_start = std::chrono::steady_clock::now();
    request.ivc_in_progress->accumulate(circuit, precomputed_vk);
    auto circuit_end = std::chrono::steady_clock::now();
    auto circuit_ms = std::chrono::duration_cast<std::chrono::milliseconds>(circuit_end - circuit_start).count();
    info("PER_CIRCUIT_TIME: circuit='",
         request.loaded_circuit_name,
         "' index=",
         request.ivc_stack_depth,
         " time_ms=",
         circuit_ms);
    bb::detail::GLOBAL_BENCH_STATS.print_aggregate_counts_hierarchical(std::cerr);
    request.ivc_stack_depth++;
```

3. Rebuild with `cd build && ninja bb` (only recompiles the changed file + relinks)
4. Run the benchmark, then grep for `PER_CIRCUIT_TIME` in the output
5. **Revert the instrumentation** after collecting data: `git checkout -- barretenberg/cpp/src/barretenberg/bbapi/bbapi_chonk.cpp`

This gives wall-clock time per circuit plus a per-circuit BB_BENCH breakdown. The `GLOBAL_BENCH_STATS.clear()` resets stats before each circuit so the hierarchical print shows only that circuit's work.

The same pattern works at any granularity — clear before, print after. This is how `GOOGLE_BB_BENCH_REPORTER` works internally.

### Output formats

| Flag | Format | Use case |
|------|--------|----------|
| `--print_bench` | Colorized tree on stderr | Human reading in terminal |
| `--bench_out <file>` | Flat JSON `{"op": time_ns}` | Simple metrics |
| `--bench_out_hierarchical <file>` | Nested JSON with parent/child | Dashboard, `extract_component_benchmarks.py` |

The hierarchical JSON format:
```json
{
  "operation_name": [
    {
      "parent": "parent_operation",
      "time": 1234567890,
      "time_max": 1234567890,
      "time_mean": 1234567890.0,
      "time_stddev": 12345.0,
      "count": 5,
      "num_threads": 8
    }
  ]
}
```

### Adding new instrumentation

When profiling reveals "missing time" (parent time - sum of children > 20%), add `BB_BENCH_NAME` to the uninstrumented functions:

```cpp
#include "barretenberg/common/bb_bench.hpp"

void MyProver::execute_phase() {
    BB_BENCH_NAME("MyProver::execute_phase");
    BB_BENCH_ENABLE_NESTING();  // allow child operations to track this as parent
    // ... function body ...
}
```

**Rules:**
- Place macro as the first statement in the scope you want to measure
- Use descriptive names: `"Chonk::accumulate::oink_phase"` not `"oink"`
- For templates: `BB_BENCH_NAME("ShpleminiProver<Flavor>::prove")` since `__func__` is ugly
- For sub-scopes, use braces to create a new scope
- `BB_BENCH_ENABLE_NESTING()` is needed when you want child `BB_BENCH_NAME` calls inside this function to show this function as their parent in the hierarchy

### Extracting component benchmarks

After running with `--bench_out_hierarchical`, extract key components:

```bash
python3 barretenberg/cpp/scripts/extract_component_benchmarks.py <output_dir> <name_path>
```

This reads `benchmark_breakdown.json`, finds operations matching key components (sumcheck, pcs, pippenger, commitment, circuit, oink, compute), and appends them to `benchmarks.bench.json` with stacked chart markers for the dashboard.

## A/B comparison

For Chonk A/B between branches, run `bb prove --scheme chonk` against the same pinned `ivc-inputs.msgpack` on each branch and compare the resulting `--bench_out_hierarchical` JSON manually. Use the **remote machine** (`/remote-bench`) for stable, single-run numbers.

The generic Google-Benchmark A/B scripts still exist for non-Chonk targets:

| Script | What it compares |
|--------|-----------------|
| `scripts/compare_branch_vs_baseline_remote.sh` | Generic native A/B (any `*_bench` target) |
| `scripts/compare_branch_vs_baseline_remote_wasm.sh` | Generic WASM A/B |

## Key scripts reference

| Script | Purpose |
|--------|---------|
| `scripts/chonk_inputs.sh` | Download, check, and update pinned inputs |
| `scripts/ci_benchmark_ivc_flows.sh` | CI: proves a flow, extracts components, uploads to dashboard |
| `scripts/benchmark_example_ivc_flow_remote.sh` | Proves a pinned flow on the remote machine (uses `/remote-bench`) |
| `scripts/wasmtime.sh` | wasmtime wrapper with standard flags |
| `scripts/extract_component_benchmarks.py` | Extract component timings from hierarchical breakdown |

## Tips

- **`HARDWARE_CONCURRENCY=8` for local, `16` for remote.** Always set this explicitly. Local/shared machines use 8; the remote benchmarking machine uses 16.
- **Local iteration is fine** — you can build, instrument, and run locally. Just average 3 runs for reliable numbers, or use the remote machine via `/remote-bench` for single-run accuracy.
- **Use `./bootstrap.sh` for initial builds** — it downloads cached artifacts and avoids build issues. Use `cmake --preset clang20 && cd build && ninja bb` for incremental rebuilds after code changes.
- **Build dir is `build/`** — the `clang20` preset outputs to `build/`, not `build-no-avm`. The `clang20-no-avm` preset also uses `build/` (it disables AVM at cmake level, not via directory name).
- **If the zig cache breaks** (missing `libubsan_rt.a` errors), delete `build/` and reconfigure: `rm -rf build && cmake --preset clang20`.
- **WASM preset:** `wasm-threads`. Build dir is `build-wasm-threads/`. The preset enables `ENABLE_WASM_BENCH=ON` automatically.
- **WASM is ~2.8x slower than native** — this ratio is consistent across all circuit types.
- **CRS:** Ensure `~/.bb-crs` exists. For WASM, wasmtime needs `--dir=$HOME/.bb-crs`.
- **`BB_BENCH=1` vs `--print_bench`:** Either activates profiling. `--print_bench` also triggers the hierarchical tree output to stderr. In Google-Benchmark targets that wrap their loops with `GOOGLE_BB_BENCH_REPORTER`, the same activation happens automatically when `BB_BENCH=1` is set.
- **Dashboard:** CI uploads breakdown data to `bench/bb-breakdown/` on S3. The dashboard at `ci3/dashboard/chonk-breakdowns/` visualizes it.
- **Rebuilding after instrumentation changes:** Only `ninja bb` is needed — no need to reconfigure.

## Presenting results

When sharing benchmark results, create an **HTML report** with an interactive visualization. Include:

- **Native vs WASM tabs** with per-circuit comparison table
- **Stacked bar charts** showing time distribution across circuits
- **Aggregation by circuit type** (kernel vs app vs infra)
- **Summary cards** with total time, slowdown ratio, and heaviest circuit
- **Color-coded circuit types**: kernel (blue), app (red), infra (gray)

Prefer the benchmark dashboard for CI results. For local comparisons, keep the HTML report as a local artifact unless the reviewer asks for a shared upload.
