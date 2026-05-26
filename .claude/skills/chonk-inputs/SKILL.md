---
name: chonk-inputs
description: Manage pinned Chonk IVC inputs and the Chonk/rollup UltraHonk proving checks. Use when updating, testing, benchmarking, or reviewing the CI flow for Chonk input refreshes.
argument-hint: <action> e.g. "download", "check", "refresh-pr", "benchmark", "ultrahonk"
---

# Chonk Inputs

Pinned Chonk IVC inputs live in an S3 tarball keyed by `barretenberg/cpp/scripts/chonk-inputs.hash`. The owner scripts are:

- `barretenberg/cpp/scripts/pinned_chonk_inputs.sh` for shared shell helpers.
- `barretenberg/cpp/scripts/chonk_inputs.sh` for download, check, and update.
- `barretenberg/cpp/scripts/ci_update_chonk_inputs.sh` for the PR push-back step.

Use the scripts instead of open-coding URLs, hashes, temp paths, or bucket listings.

## Common Commands

Download or repair the local fixture directory:

```bash
barretenberg/cpp/scripts/chonk_inputs.sh download
```

Check pinned VK compatibility without updating:

```bash
barretenberg/cpp/scripts/chonk_inputs.sh check
```

Refresh the pin locally:

```bash
barretenberg/cpp/scripts/chonk_inputs.sh update
```

In PR CI, refresh via the `ci-refresh-chonk` label or a `--ci-refresh-chonk` head-commit marker. The follow-up refresh commit includes `--ci-skip`.
Proving is handled by the pinned-input tests; the CI push-back step runs one small pinned flow before committing a refreshed hash.

## Benchmark and Proving Checks

Barretenberg owns the Chonk and rollup UltraHonk benchmark commands. Use `barretenberg/cpp/bootstrap.sh bench_cmds` to inspect the CI command list, or `bench_ivc` for a focused Chonk run.

The benchmark scripts restore or regenerate their inputs when missing:

```bash
barretenberg/cpp/scripts/chonk_inputs.sh download
barretenberg/cpp/scripts/ci_benchmark_ivc_flows.sh native

barretenberg/cpp/scripts/ci_benchmark_ultrahonk_circuits.sh parity_base \
  ../../yarn-project/end-to-end/ultrahonk-bench-inputs 8
```

Keep Chonk benchmark command enumeration in barretenberg; `yarn-project/end-to-end/bootstrap.sh build_bench_capture` is only for live input capture during pin refresh.

## Review Checklist

- Do not use `aws s3 ls` or depend on bucket listing. Verify exact object URLs.
- Use `.cache/` for scratch state and clean job-specific subdirectories.
- Keep refresh commits scoped to `barretenberg/cpp/scripts/chonk-inputs.hash`.
- Run `bash -n` on edited shell scripts and `yq e . .github/workflows/ci3.yml` after workflow edits.
- For update-step changes, run `.cache/chonk-ux-harness/run.sh` when available.
