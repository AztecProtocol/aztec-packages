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

## Pins to keep in sync

A bb/proof-system change that rotates VKs touches THREE tracked pins, and all of them feed the captured Chonk flows:

- The mock artifact pin `noir-projects/fnd/mock-protocol-circuits/pinned-build.tar.gz` freezes mock protocol circuit bytecode and VKs used by Chonk fixture capture.
- The standard-contracts pin `noir-projects/labs/noir-contracts/pinned-standard-contracts.tar.gz` freezes the `contracts/standard/` artifacts with their precomputed VKs and deterministic addresses. `noir-contracts/bootstrap.sh build` extracts it and excludes `standard/` from recompilation, so these VKs only refresh via `pin-standard-build` (step 5).
- The Chonk flow pin `barretenberg/cpp/scripts/chonk-inputs.hash` points to the S3 tarball of captured `ivc-inputs.msgpack` flows. Those msgpacks embed bytecode, witnesses, circuit kinds, and precomputed VKs — including the standard-contract VKs above, so the standard-contracts pin must be correct *before* recapturing flows.

`noir-projects/fnd/noir-protocol-circuits/pinned-build.tar.gz` is not a current tracked pin on the `next` line. `noir-projects/bootstrap.sh pin-build` may generate it as untracked local build output; do not commit it unless intentionally reintroducing that large artifact pin.

If a bb/proof-system change can affect VKs, refresh in this order:

1. Rebuild the AVM-enabled bb binary so the regenerated VKs reflect the change. `cmake --build build --target bb` is not enough: `noir-projects/fnd/noir-protocol-circuits/bootstrap.sh` resolves the bb binary via `barretenberg/cpp/scripts/find-bb`, which returns `bb-avm` (not `bb`) unless `AVM=0`. From `barretenberg/cpp/`:
   ```bash
   cmake --preset default -DAVM=ON
   cmake --build build --target bb-avm
   ```
2. Repin Noir artifacts with the AVM-enabled binary: `./bootstrap.sh pin-build` from `noir-projects/`. Do not set `AVM=0` — the `*-tx-base-public` circuits verify an AVM proof, so non-AVM `bb` fails their VK generation with "AVM recursion is not supported in this build". Because pin-build runs under `set +e`, that failure does not abort the run; it silently archives an incomplete `pinned-build.tar.gz` with stale/missing VKs.
3. Keep the tracked `noir-projects/fnd/mock-protocol-circuits/pinned-build.tar.gz` diff.
4. Remove the generated untracked `noir-projects/fnd/noir-protocol-circuits/pinned-build.tar.gz` unless intentionally reintroducing that large pin.
5. Repin the standard contracts **iteratively, and regenerate their address stamps**. A stale standard-contracts pin surfaces as a "Computed VK differs from precomputed VK" mismatch on a `standard/` contract function during chonk capture verification. Repinning is not a single command: `pin-standard-build` compiles the standard contracts against the *current* `standard_addresses.nr` and tarballs them — it does NOT regenerate the stamps, and standard contracts can reference each other's deterministic addresses. Because a contract's address depends on its bytecode, which depends on the addresses it embeds, you must repeat the re-pin + stamp-regeneration until a round changes nothing (the addresses stop moving):
   ```bash
   cd noir-projects/labs/noir-contracts
   # repeat this pair until `generate` makes no change (exits 0, no "Changed values"):
   BB=$(realpath ../../barretenberg/cpp/build/bin/bb-avm) ./bootstrap.sh pin-standard-build
   (cd ../../yarn-project && yarn workspace @aztec/standard-contracts generate)   # rewrites stamps; exits non-zero on drift
   ```
   `BB` defaults to non-AVM `bb`; set it to `bb-avm` explicitly. Once converged, run `noir-projects/bootstrap.sh` once to recompile dependents against the final addresses, then commit the pin **together with** the two regenerated stamp files:
   - `yarn-project/standard-contracts/src/standard_contract_data.ts`
   - `noir-projects/labs/aztec-nr/aztec/src/standard_addresses.nr`

   Two failure modes if you cut corners: skipping the stamp regen rotates the contract addresses out from under the committed stamps → a cascade of contract-class / "address not updated" failures; stopping before the addresses stabilize leaves a pinned contract calling another standard contract's *previous* address → e2e capture aborts with `Function artifact not found for contract 0x…` during flow execution.
6. Recapture and upload Chonk flows with `barretenberg/cpp/scripts/chonk_inputs.sh update` (only after step 5 is committed, since the capture embeds the standard-contract VKs).

After pin-build, sanity-check that the tracked tarball is a full pin, not the empty/incomplete shell a silent failure leaves behind: `tar tzf noir-projects/fnd/mock-protocol-circuits/pinned-build.tar.gz | grep -c '\.json$'` should list every circuit (a 400-byte tarball containing only `./` and `./keys/` means the build produced nothing).

A refreshed Chonk flow pin alone can still contain stale VKs if the capture used stale Noir artifacts. `ChonkPinnedIvcInputsTest.AllPinnedFlows` uses the embedded VKs with the default policy, so stale VKs may surface later as generated-proof verification failure rather than the explicit `chonk_inputs.sh check` VK-mismatch message.

## Diagnosing an `AllPinnedFlows` failure

Decide whether you have a pin problem or something upstream **before** repinning or re-uploading:

- **Download / hash failure** (`failed to download … may be stale`, `InvalidAccessKeyId`) → a pin/upload problem. Refresh the flow pin; for `InvalidAccessKeyId`, the build+capture is fine but your AWS creds are expired — the canonical fix is the `ci-refresh-chonk` label so CI uploads with its own creds.
- **Prove / verify failure** (e.g. `ChonkVerifier: verification failed at PI pairing points check`, `Failed to verify the generated proof`) → does NOT by itself mean the flow pin is stale, and re-capturing the flow pin will not fix it. Factor out the pin by re-running the test against a freshly-captured local flow set (the test honors `CHONK_PINNED_IVC_INPUTS_DIR`, with no hash/marker check):
  ```bash
  CHONK_PINNED_IVC_INPUTS_DIR=$(pwd)/yarn-project/end-to-end/chonk-pinned-flows \
  CHONK_PINNED_IVC_FLOW=<flow> AZTEC_REPO_ROOT=$(pwd) \
    ./barretenberg/cpp/build/bin/bbapi_tests --gtest_filter='ChonkPinnedIvcInputsTest.AllPinnedFlows'
  ```
  (`CHONK_PINNED_IVC_FLOW` filters to one flow dir for a fast loop; omit it to run all.) If a freshly-captured flow fails identically, the flow pin is not the cause — an embedded *precomputed* VK is stale. Run `bb check --scheme chonk` over the flows to name the function (`VK mismatch detected for function <contract>:<fn>`); if it's a `standard/` contract, the cause is the standard-contracts pin (step 5), not the flow pin.

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
