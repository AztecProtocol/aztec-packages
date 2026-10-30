---
name: adding-benchmarks
description: Add new benchmarks to the CI pipeline. Guides through creating benchmark JSON files, integrating with bootstrap.sh, and ensuring proper CI upload via ci3.yml workflow.
---

# Adding Benchmarks

## Benchmark System Overview

Benchmarks flow through the system as follows:
1. **Generation**: Each package produces `bench-out/*.bench.json` files
2. **Aggregation**: `bench_merge` in root `bootstrap.sh` combines all files, prefixing names with the path up to `/bench-out`. Labs benches (`labs_bench_cmds`, run from `labs/`) therefore get a `labs/yarn-project/...` prefix.
3. **Upload**: CI caches the merged JSON, and the `ci3.yml` "Upload benchmarks" step publishes it with `ci3/upload_benchmarks`
4. **Display**: Results appear at the dashboard with historical tracking

**Live dashboard:** https://aztecprotocol.github.io/benchmark-page-data/bench/?branch=next

## How Benchmark Names Work

### Name Construction

The **final benchmark name** combines two parts:

1. **Package prefix** (added automatically by `bench_merge`): Based on where the file lives
2. **Local name** (what you write in JSON): Your metric identifier

### Dashboard Grouping

The dashboard splits names by `/` to create a collapsible tree. The **last segment** becomes the chart name, everything before it becomes the group hierarchy.

| Full Name | Group Path | Chart Name |
|-----------|------------|------------|
| `labs/yarn-project/stdlib/Tx/private/getTxHash/avg` | `labs/yarn-project/stdlib/Tx/private/getTxHash` | `avg` |
| `labs/yarn-project/kv-store/Map/Individual insertion` | `labs/yarn-project/kv-store/Map` | `Individual insertion` |
| `barretenberg/sol/Add2HonkVerifier` | `barretenberg/sol` | `Add2HonkVerifier` |

### Naming Best Practices

**Use `/` to create logical groupings:**
```json
[
  {"name": "Tx/private/getTxHash/avg", "value": 1.2, "unit": "ms"},
  {"name": "Tx/private/getTxHash/p50", "value": 1.1, "unit": "ms"},
  {"name": "Tx/public/getTxHash/avg", "value": 2.3, "unit": "ms"}
]
```

**Avoid flat names** - they create no hierarchy and are hard to navigate:
```json
[
  {"name": "tx_private_gettxhash_avg", "value": 1.2, "unit": "ms"}
]
```

**Common suffixes:**
- Timing: `avg`, `p50`, `p95`, `p99`, `min`, `max`, `total`
- Size: `_opcodes`, `_gates`, `memory`
- Rate: `gasPerSecond`, `jobs_per_sec`

## Required JSON Format

All benchmark files must be arrays using the `customSmallerIsBetter` format:

```json
[
  {"name": "category/metric_name", "value": 12345, "unit": "gas"},
  {"name": "category/another_metric", "value": 100.5, "unit": "ms"}
]
```

**Rules:**
- Must be a JSON array `[...]`, not an object
- Each entry needs `name`, `value`, `unit`
- `value` must be numeric (lower is better)
- File must end with `.bench.json`

**Optional fields** (`ci3/upload_benchmarks` writes entries verbatim; the dashboard decides what it renders):
- `range` (string): Variance info (e.g., `"± 5%"`)
- `extra` (string): Metadata — used for stacked chart grouping (see below)

## Stacked Charts

To render multiple metrics as a **single stacked area chart** (e.g., component breakdowns), add an `extra` field with a `stacked:GROUP_NAME` value. Entries sharing the same GROUP_NAME are overlaid on one chart.

```json
[
  {"name": "proving/cpus-8/total_ms", "value": 31663, "unit": "ms"},
  {"name": "proving/cpus-8/oink_prove_ms", "value": 4992, "unit": "ms", "extra": "stacked:proving/cpus-8/components"},
  {"name": "proving/cpus-8/sumcheck_ms", "value": 3318, "unit": "ms", "extra": "stacked:proving/cpus-8/components"},
  {"name": "proving/cpus-8/circuit_ms", "value": 4642, "unit": "ms", "extra": "stacked:proving/cpus-8/components"}
]
```

**How it works:**
- `extra: "stacked:GROUP_NAME"` → entries with the same GROUP_NAME are rendered as one stacked chart
- No `extra` field → individual line chart (default behavior)
- Stacked entries still appear as individual charts on the main dashboard; the stacked view is rendered by a custom dashboard page
- The GROUP_NAME becomes the chart title (after `bench_merge` prefixing, same as `name`)
- `ci3/upload_benchmarks` copies entries unchanged into the benchmark-action data format. Which fields the dashboard renders is decided in `benchmark-page-data`, so do not rely on fields other than `name`, `value`, `unit`, `range` and `extra`

**When to use stacked charts:**
- Component-level timing breakdowns (e.g., sumcheck, PCS, circuit construction)
- Resource allocation views (e.g., memory by subsystem)
- Any case where you want to see how a total decomposes into parts over time

## Adding a New Benchmark

### Step 1: Create the Benchmark

**C++ (barretenberg)**: `barretenberg/cpp/scripts/run_bench.sh <native|wasm> <name> <binary> <gtest filter>` runs one Google Benchmark binary and writes `bench-out/<name>.bench.json`. See `bench_cmds` in `barretenberg/cpp/bootstrap.sh`.

**TypeScript** (labs `yarn-project`, which lives in aztec-node; see the aztec-node `adding-benchmarks` skill for the full TS flow):
```typescript
// my.bench.test.ts
import { Timer } from '@aztec-labs/foundation/timer';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

describe('MyComponent benchmarks', () => {
  const results: { name: string; value: number; unit: string }[] = [];

  afterAll(async () => {
    if (process.env.BENCH_OUTPUT) {
      await mkdir(path.dirname(process.env.BENCH_OUTPUT), { recursive: true });
      await writeFile(process.env.BENCH_OUTPUT, JSON.stringify(results));
    }
  });

  it('benchmark operation', async () => {
    const timer = new Timer();
    // ... operation to benchmark ...
    results.push({ name: 'MyComponent/operation/avg', value: timer.ms(), unit: 'ms' });
  });
});
```

**Shell** (jq-based):
```bash
mkdir -p bench-out
jq -n '[
  {name: "metric1", value: '$VALUE1', unit: "ms"},
  {name: "metric2", value: '$VALUE2', unit: "gas"}
]' > bench-out/my-component.bench.json
```

**Python**:
```python
import json
benchmark_list = [{"name": "category/metric", "value": 12345, "unit": "gas"}]
with open("bench-out/my-component.bench.json", "w") as f:
    json.dump(benchmark_list, f)
```

### Step 2: Register in bootstrap.sh

Add to the package's `bench_cmds` function. Root `bench_cmds` collects `barretenberg/{ts,cpp,sol}`, `noir-projects/fnd/noir-protocol-circuits` and `l1-contracts`, then the labs benches. For example, in `barretenberg/cpp/bootstrap.sh`:

```bash
function bench_cmds {
  prefix="$hash:CPUS=8"
  echo "$prefix barretenberg/cpp/scripts/run_bench.sh native bb-micro-bench/native/ultra_honk $native_build_dir/bin/ultra_honk_bench construct_proof_ultrahonk_power_of_2/20$"
}
```

A labs TS bench registers as `echo "$hash BENCH_OUTPUT=bench-out/my_component.bench.json yarn-project/scripts/run_test.sh <package>/src/my.bench.test.ts"` in `labs/yarn-project/bootstrap.sh`.

**Options:** `:ISOLATE=1`, `:CPUS=8`, `:MEM=16g`, `:TIMEOUT=7200`

**CPUS Suggestion:** For long running or compute-heavy benchmarks allocate CPUs (`:CPUS=N`). Benchmarks have strict scheduling, so if you request X CPUs, you'll have them available for consistent results.

**ISOLATE Suggestion:** Use `:ISOLATE=1` when your benchmark needs a clean, isolated environment with no network access and pinned resources. This runs the test in a Docker container, ensuring reproducible results without interference from other processes.

**MEM Suggestion:** Use `:MEM=Xg` (e.g., `:MEM=16g`) for memory-intensive benchmarks that may exceed the default allocation (CPUS × 4GB). Pair with `:ISOLATE=1` since memory limits are enforced via Docker.

**TIMEOUT Suggestion:** Use `:TIMEOUT=N` (in seconds) for benchmarks that take longer than the default timeout. For example, `:TIMEOUT=1800` for 30 minutes, `:TIMEOUT=7200` for 2 hours.

**Naming gotcha (labs TS):** Name a TS bench `*.bench.test.ts` (with a dot before `bench`). The unit-test sweep in `labs/yarn-project/bootstrap.sh` skips files matching `\.bench\.test\.ts$`, so a `_bench.test.ts` file also runs as a unit test. `bench_cmds` lists bench files explicitly, whatever their name.

### Step 3: Verify

```bash
# Run locally (labs TS; for other components run the command you added to bench_cmds)
BENCH_OUTPUT=bench-out/test.bench.json yarn test src/my.bench.test.ts

# Validate JSON
jq . bench-out/test.bench.json
jq 'all(has("name") and has("value") and has("unit"))' bench-out/test.bench.json
```

The second `jq` prints `true` or `false` and exits 0 either way, so read its output.

## CI Details

**Benchmarks upload when** (`.github/ci3_labels_to_env.sh`):
- The PR has the `ci-full` or `ci-full-no-test-cache` label.
- The run is a merge-queue run (`merge_group` event or `ci-merge-queue` label), except `merge-queue-ci`.

Merge-queue runs into `next` publish to `bench/next`. Everything else publishes to `bench/prs`.

**10-commit visibility window:** The dashboard only shows benchmarks that ran in the last 10 commits. If a benchmark stops running, it disappears after ~10 merges.

## Reference Implementations

- **C++**: `barretenberg/cpp/scripts/run_bench.sh` (registered in `barretenberg/cpp/bootstrap.sh bench_cmds`)
- **Python**: `l1-contracts/scripts/generate_benchmark_json.py`
- **TypeScript** (labs): `labs/yarn-project/stdlib/src/tx/tx_bench.test.ts`
- **Shell** (labs): `labs/yarn-project/p2p/testbench/consolidate_benchmarks.sh`
- **Circuits**: `noir-projects/fnd/noir-protocol-circuits/scripts/run_bench.sh`
