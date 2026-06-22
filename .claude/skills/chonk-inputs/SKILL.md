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

## Artifact Pin vs Flow Pin

There are two current pins to keep in sync:

- The tracked artifact pin is `noir-projects/mock-protocol-circuits/pinned-build.tar.gz`. It freezes mock protocol circuit bytecode and VKs used by Chonk fixture capture.
- The Chonk flow pin is `barretenberg/cpp/scripts/chonk-inputs.hash`, which points to the S3 tarball of captured `ivc-inputs.msgpack` flows. Those msgpacks embed bytecode, witnesses, circuit kinds, and precomputed VKs.

`noir-projects/noir-protocol-circuits/pinned-build.tar.gz` is not a current tracked pin on the `next` line. `noir-projects/bootstrap.sh pin-build` may generate it as untracked local build output; do not commit it unless intentionally reintroducing that large artifact pin.

If a bb/proof-system change can affect VKs, refresh in this order:

1. Repin Noir artifacts with native bb, e.g. `AVM=0 ./bootstrap.sh pin-build` from `noir-projects/`.
2. Keep the tracked `noir-projects/mock-protocol-circuits/pinned-build.tar.gz` diff.
3. Remove the generated untracked `noir-projects/noir-protocol-circuits/pinned-build.tar.gz` unless intentionally reintroducing that large pin.
4. Recapture and upload Chonk flows with `barretenberg/cpp/scripts/chonk_inputs.sh update`.

A refreshed Chonk flow pin alone can still contain stale VKs if the capture used stale Noir artifacts. `ChonkPinnedIvcInputsTest.AllPinnedFlows` uses the embedded VKs with the default policy, so stale VKs may surface later as generated-proof verification failure rather than the explicit `chonk_inputs.sh check` VK-mismatch message.

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
