---
name: track-e2e-times
description: Collect and aggregate e2e test wall-clock timings — run the suite with the timing instrumentation on, find the per-worker JSONL it produces, and print per-test sums plus a ranked span leaderboard. Use when asked to measure, profile, or break down where the e2e suite spends time.
argument-hint: <folder-with-jsonl>
---

# Track e2e times

The e2e suite is instrumented to record, per test, how long it spends in jest before/after hooks and
the test body, plus a set of named **spans** for the repeated operations that dominate e2e wall-clock
(standing up the environment, waiting for blocks/checkpoints/proofs, client-side proving, warp scans).
This skill covers two things and nothing else:

1. **Collect** — run the suite with timing on and locate the JSONL it writes.
2. **Aggregate** — turn that JSONL into per-test sum tables and a ranked span leaderboard locally.

There is a separate, out-of-band workflow for publishing aggregate numbers to a running tracking log;
that is not part of this skill. Everything here is local: run, find the files, print tables.

## How the instrumentation works

The jest `testEnvironment` for `end-to-end` is `src/shared/timing_env.mjs`, wired in
`yarn-project/end-to-end/package.json`. It is always installed but **gated on the `TEST_TIMING_FILE`
env var**: when that var is unset it behaves like the base environment and records nothing (the
`testSpan()` wrapper in `src/fixtures/timing.ts` calls through with zero overhead). Set `TEST_TIMING_FILE`
to a path and the environment writes JSONL there.

Relevant env vars:

- `TEST_TIMING_FILE` — path to the JSONL output file. **Required** to turn timing on. The environment
  *appends*, and runs once per jest worker process, so a single file accumulates every suite that
  worker ran. Use one file per test command.
- `TEST_TIMING_SPANS=1` — optional. Additionally emit one `type:"span"` line per individual span
  occurrence (owner, span tag, ms) for deep dives. Off by default to keep the file one line per test.

## Step 1 — Collect: run the suite with timing on

Run any e2e test (or the whole suite) with `TEST_TIMING_FILE` pointed at a scratch path. From
`yarn-project`:

```bash
TEST_TIMING_FILE=/tmp/e2e-timings.jsonl \
  yarn workspace @aztec/end-to-end test:e2e e2e_block_building.test.ts
```

For the per-occurrence span lines as well:

```bash
TEST_TIMING_FILE=/tmp/e2e-timings.jsonl TEST_TIMING_SPANS=1 \
  yarn workspace @aztec/end-to-end test:e2e e2e_block_building.test.ts
```

If a run spreads across several jest workers and each worker writes its own file, collect them all
into one folder and point the aggregation at the folder — the recipes below read `*.jsonl`.

To aggregate a CI run instead of a local one, the per-worker JSONL each CI test command produced is
uploaded to S3 keyed by the job's `CI_LOG_ID`. From the repo root:

```bash
./ci.sh test-timings <CI_LOG_ID> <folder>
```

That downloads every `<LOG_ID>.log.gz` for the job and gunzips them to `*.jsonl` in `<folder>`. The
`CI_LOG_ID` is the decimal id in a job's `ci.aztec-labs.com/<id>` dashboard URL.

## The JSONL line schema

One JSON object per line, one line per test and one suite-scoped line per file. Fields:

| Field | Meaning |
|---|---|
| `suite` | The `.test.ts` basename the line came from. |
| `type` | `"test"` (one `it()`), `"suite"` (the file's `beforeAll`/`afterAll`, `name` is `null`), or `"span"` (a raw occurrence, only with `TEST_TIMING_SPANS=1`). |
| `name` | Full test name (describe chain + `it`), or `null` for a suite line. |
| `status` | `"passed"` / `"failed"`. |
| `beforeHooksMs` | Sum of `beforeEach` hooks (test lines) or `beforeAll` (suite line). |
| `afterHooksMs` | Sum of `afterEach` hooks (test lines) or `afterAll` (suite line). |
| `bodyMs` | The `it()` body wall-clock (test lines only). |
| `setupFnMs` / `teardownFnMs` | Back-compat fields, derived from the `setup:env:<mode>` / `teardown:env` spans. |
| `totalMs` | Whole-test wall-clock (test lines), or `beforeHooksMs + afterHooksMs` (suite line). |
| `startedAt` | ISO timestamp of test start (test lines). |
| `commit` / `branch` / `runId` | Run metadata from `COMMIT_HASH` / `TARGET_BRANCH`|`REF_NAME` / `RUN_ID` (may be `null` locally). |
| `spans` | Map of `category:label` tag → `{ count, totalMs, busyMs, maxMs }` (see below). |

All `*Ms` values are integers (rounded at flush).

### The span model

Each test/suite line carries a `spans` map. For every `category:label` tag the test touched it records:

- **`count`** — number of occurrences. Multiplicity is itself a signal (e.g. waited for a checkpoint
  14× points at a loop that could batch).
- **`totalMs`** — naive sum of the occurrences' durations. Correct for serial repeats.
- **`busyMs`** — wall-clock of the **union** of the occurrences' `[start, end)` intervals. This is
  concurrency-correct: a `Promise.all` of 12 concurrent 3s spans reads ~3s here, not ~36s. A
  `busyMs ≪ totalMs` gap flags work run serially that could be parallel.
- **`maxMs`** — longest single occurrence, to catch one pathological wait hiding in a cheap average.

Tags follow a stable `category:label` taxonomy (`setup:`, `wait:`, `tx:`, `warp:`, `wallet:`,
`deploy:`, `other:`), tagged **by concept, not by function** — e.g. every checkpoint waiter maps to
`wait:checkpoint` — so a tag is a stable aggregation key regardless of which helper a test called.

Spans do **not** partition `bodyMs`: a parent span includes its children, so `sum(spans) ≠ bodyMs`.
Tagging is at the leaf wait/spawn/tx level where additivity holds. `busyMs` is the right number to
rank by; sum `busyMs` per tag across the run to see where wall-clock goes.

## Step 2 — Aggregate locally

### Per-test sums

`row.sh` (this directory) prints a one-line summary of the run's aggregate sums (test count, overall,
setup, setup.ts-fn, body, teardown) plus the wall-clock window:

```bash
bash row.sh <folder-with-jsonl>
```

It reads `*.jsonl` from the folder, sums the buckets across all `type:"test"` lines, and prints to
stderr. It warns if the test count is far below a full run (~950) — a partial or cache-served run is
not comparable to a full one.

> Sums, not wall-clock: files run in parallel, so the column sums far exceed the run's actual wall
> time. The `(HH:MM–HH:MM)` window the script prints is the real wall-clock span.

### Span leaderboard

The ranked "where does the suite spend wall-clock" table is a small jq over the `spans` maps. It rolls
every tag up across all test and suite lines, summing `busyMs` and `count`, taking the max `maxMs`, and
sorts by total `busyMs` descending:

```bash
cat <folder>/*.jsonl | jq -rs '[ .[] | select(.type=="test" or .type=="suite") | (.spans // {}) | to_entries[] ]
  | group_by(.key)
  | map({ tag: .[0].key, count: (map(.value.count) | add),
          busyMs: (map(.value.busyMs) | add), maxMs: (map(.value.maxMs) | max) })
  | sort_by(-.busyMs) | .[] | "\(.busyMs)\t\(.count)\t\(.maxMs)\t\(.tag)"'
```

Output columns are `busyMs`, `count`, `maxMs`, `tag` — the top rows are where to invest in speedups.

For a single tag's per-test breakdown (which tests contribute the most to one tag):

```bash
cat <folder>/*.jsonl | jq -rs --arg tag wait:checkpoint '
  [ .[] | select(.type=="test" or .type=="suite") | select(.spans[$tag])
    | { name, busyMs: .spans[$tag].busyMs, count: .spans[$tag].count } ]
  | sort_by(-.busyMs) | .[] | "\(.busyMs)\t\(.count)\t\(.name)"'
```

With `TEST_TIMING_SPANS=1`, each `type:"span"` line is a single occurrence (`name` = owning test,
`span` = tag, `ms` = duration), so you can histogram or list the raw occurrences of one tag directly.

## Key points

- **Timing is off unless `TEST_TIMING_FILE` is set** — the instrumentation is zero-cost when unset and
  cannot change test behavior or timing.
- **One file per worker, appended** — collect all of a run's files into one folder before aggregating.
- **Rank by `busyMs`** — it is concurrency-correct; `totalMs` double-counts parallel work.
- **`spans` is additive across lines** but not within a test (parents include children); sum per tag
  across the run, do not expect spans to add up to `bodyMs`.
- **Full-run vs full-run only** — a partial or cache-served run emits far fewer than ~950 tests and is
  not comparable.

## Reference

- `row.sh` (this directory) — aggregate JSONL → summary sums + leaderboard.
- `yarn-project/end-to-end/src/shared/timing_env.mjs` — the jest timing environment that writes the JSONL.
- `yarn-project/end-to-end/src/fixtures/timing.ts` — the `testSpan()` / `testSpanSync()` / `withTestSpanOwner()` wrappers.
- `./ci.sh test-timings <CI_LOG_ID> <folder>` — download a CI job's per-worker JSONL (repo root).
