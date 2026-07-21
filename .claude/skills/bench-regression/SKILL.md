---
name: bench-regression
description: Check a PR for performance regressions by comparing its benchmark run against its merge-base on next. Use when a dev asks "did my PR regress anything?" or wants to vet benchmark impact before merge.
argument-hint: [pr-ref] (defaults to HEAD)
---

# PR benchmark regression check

Compares a PR's benchmark run against its baseline (merge-base on `next`, optionally a window of
baseline runs) and reports only the regressions that (a) are statistically real and (b) plausibly
relate to what the PR changed. The data-pulling and diff math are done by `ci3/bench_compare`; your
job is to get a run, invoke the script, then filter the output with judgement.

## How benchmark data is stored (context)

Each CI benchmark run uploads a single `bench-out/bench.json` (a flat array of `{name, unit, value}`,
`customSmallerIsBetter` — higher = worse) to the build-cache, keyed by the commit's **git tree hash**
(`bench-<treehash>.tar.gz`, ~40 KB). A PR only produces one on an *uploadable* run: labels
`ci-full-no-test-cache`, `ci-full`, or a merge-queue run. `ci3/bench_compare` pulls these per-run
blobs — never the multi-MB per-branch `data.js` graph history.

## Steps

### 1. Get a benchmark run for the PR

- Default to `HEAD` (or the ref the user gives). Try step 2 directly — `ci3/bench_compare` fails
  clearly if the commit has no bench data.
- **If there's no run and the user is fine using the last one:** walk back the branch for the most
  recent benched commit — `for c in $(git rev-list -n 30 HEAD); do ci3/bench_compare "$c" >/dev/null 2>&1 && echo "$c" && break; done` — and use that commit.
- **If a fresh run is needed:** tell the user to add the `ci-full-no-test-cache` label to the PR (that
  triggers x-bench on a dedicated metal box and uploads) and to re-run this once CI finishes. Do not
  block waiting unless asked.

### 2. Determine the baseline branch — do NOT assume `next`

The comparison is `merge-base(PR, baseline)`, so the baseline MUST be the PR's *actual* target branch.
A PR onto `v5-next` or a `merge-train/*` branch compared against `next` would report the entire
branch-vs-branch perf delta as bogus regressions. Get it from the PR itself:

```bash
gh pr view <pr-or-branch> --json baseRefName -q .baseRefName   # e.g. next, v5-next, merge-train/spartan
git fetch origin <baseRefName>                                  # ensure origin/<baseRefName> is current
```

(You do NOT need to worry about cross-branch data mixups: the bench cache is content-addressed by git
tree hash, so `next`, `v5-next`, etc. already occupy different keys — a next commit's tree is only ever
benched by next-content. The only thing you control, and must get right, is *which branch's lineage*
you merge-base against.)

### 3. Run the comparison

```bash
ci3/bench_compare <pr-commit> --baseline origin/<baseRefName> --window 5 --out /tmp/bench-report.json
```

- Always pass `--baseline` explicitly (the script auto-detects via `gh` if omitted, but be explicit).
  It prints `baseline = …` to stderr — confirm it matches the PR's target before trusting the numbers.
- `--window 5` averages the merge-base + 4 preceding baseline runs, yielding `stddev` and `z` per bench
  — essential for separating real regressions from flaky benches. Use `--window 1` if history is sparse.
- JSON on `--out` is `{ meta, benches:[{name,unit,pr,baseline,n,pct,stddev,z,status}] }`, sorted by
  `pct` desc. Human summary on stderr.

### 4. Filter to what matters (your judgement)

Read the JSON and keep a regression only if **all** hold:

- **Statistically real:** `z >= ~4` (the PR value is ≥4 baseline-stddevs above the mean). A large
  `pct` with small/absent `z` is baseline noise — a flaky bench (e.g. `p2p/BatchTxRequester/.../duration`
  hitting a 30 s timeout, `pct` in the thousands) — **ignore it**. When window is 1 (no `z`), fall back
  to requiring a large `pct` AND a meaningful absolute magnitude.
- **Material magnitude:** skip tiny absolutes (e.g. `0.01 ms -> 0.02 ms` = +100% but noise).
- **Plausibly caused by the PR:** map the bench `name` prefix to the PR's changed areas. Get the diff
  with `git diff --name-only $(git merge-base HEAD origin/next)..HEAD | cut -d/ -f1-2 | sort -u`, then
  keep benches whose names start with a touched area (`yarn-project/simulator`, `barretenberg/cpp`,
  `avm-transpiler`, …) and treat far-away regressions (a TS-only PR moving a C++ proving bench) as
  drift/noise, not this PR.

### 5. Report

List the surviving regressions with `baseline -> pr unit`, `pct`, and `z`, grouped by area, and give a
one-line verdict (clean / N real regressions in <area>). Note anything you filtered out and why, so
the dev can override your judgement.

## Notes

- Baseline is `origin/next` by default; `git fetch` it first if stale (`ci3/bench_compare` errors if
  the ref is missing).
- Requires `jq`, `python3`, and read access to the build-cache (the public `build-cache.aztec-labs.com`
  endpoint needs no creds; the in-VPC S3 path is a fallback).
- To author or wire up new benchmarks, see the `adding-benchmarks` skill; this skill only *checks* them.
