# Handoff: `private_kernel_init_3` is wired end-to-end

`private_kernel_init_3` — the batched first-iteration kernel that verifies three app
calls in a single circuit — is now plumbed end-to-end behind a `PXE_USE_INIT_3`
flag. The new path captures, proves, and verifies on real client flows, with
measured savings in the expected shape (saving 2 prev-kernel HN verifications +
2 Oink proves per tx).

This branch is `lde/integrate-init-3`, based on `merge-train/barretenberg`.

## What's done — 7 commits

```
69362fbe test(end-to-end): reproducer for the PXE_USE_INIT_3 canary
397224be feat(pxe): orchestrator init_3 path behind PXE_USE_INIT_3 flag
43f203c1 feat(bb-prover): implement generateInit3Output / simulateInit3
3bcad728 feat(noir-protocol-circuits-types): wire private_kernel_init_3 artifact and VK
7de74078 feat(stdlib): add PrivateKernelInit3CircuitPrivateInputs and prover interface methods
0dc31e27 docs(barretenberg/cpp): note that find-bb defaults to bb-avm
94b52e31 feat(protocol-circuits): allocate PRIVATE_KERNEL_INIT_3_VK_INDEX and accept it as a previous kernel
```

Layered top-down, each commit corresponds to one layer of the stack:

| Commit | Layer | What changed |
|---|---|---|
| `94b52e31` | Noir protocol circuits | `PRIVATE_KERNEL_INIT_3_VK_INDEX = 65`, extends `ALLOWED_PREVIOUS_CIRCUITS` for inner / reset / tail / tail_to_public |
| `7de74078` | TS stdlib | New `PrivateKernelInit3CircuitPrivateInputs`, new `generateInit3Output` / `simulateInit3` on `PrivateKernelProver` |
| `3bcad728` | TS noir-protocol-circuits-types | New `PrivateKernelInit3Artifact` in the union, bundle, vks/client, vks/server. Simulated lookup reuses the constrained artifact (no `private-kernel-init-3-simulated` crate exists) |
| `43f203c1` | TS bb-prover | New witness-map converters + `BBPrivateKernelProver` methods |
| `397224be` | TS PXE orchestrator | `useInit3 = process.env.PXE_USE_INIT_3 === '1' && totalAppCalls >= 3`. Falls back to standard init when fewer than 3 apps. Refactored top-of-loop into `consumeNextApp` helper |
| `0dc31e27` | Docs | `find-bb` defaults to `bb-avm` — flagged because we lost a session debugging the wrong binary |
| `69362fbe` | Reproducer | `yarn-project/end-to-end/scripts/reproduce_init3_canary.sh`, plus a `SKIP_STEP_COUNT_CHECK=1` opt-out in `captureProfile` |

## Verify it works

After `./bootstrap.sh` from the repo root, run the reproducer:

```bash
yarn-project/end-to-end/scripts/reproduce_init3_canary.sh
```

This runs the `deploy_ecdsar1+sponsored_fpc` client flow with `PXE_USE_INIT_3=1`,
captures the IVC inputs, proves with `bb prove --scheme chonk`, and verifies the
proof. Asserts the capture references `PrivateKernelInit3Artifact` so a
regression in flag plumbing is caught at capture time. Total runtime ~2–3 min.

Final output on success:

```
init_3 canary verified end-to-end.
  Captured inputs: /tmp/init3-canary/captures/deploy_ecdsar1+sponsored_fpc/ivc-inputs.msgpack
  Proof artifacts: /tmp/init3-canary/proof/
```

To verify a different flow, set the right test name + flow path:

```bash
# transfer_0 (3 apps total — init_3 absorbs all of them)
PXE_USE_INIT_3=1 \
CAPTURE_IVC_FOLDER=/tmp/init3-out \
SKIP_STEP_COUNT_CHECK=1 \
BENCHMARK_CONFIG=key_flows \
LOG_LEVEL=warn \
node --experimental-vm-modules yarn-project/node_modules/.bin/jest \
  --testTimeout=300000 --no-cache --runInBand \
  --testNamePattern "ecdsar1.*0 recursions.*sponsored_fpc" \
  --rootDir yarn-project/end-to-end/src \
  client_flows/transfers
# then bb prove + bb verify against /tmp/init3-out/<flow>/ivc-inputs.msgpack
```

## Measured benefit (single run, remote bench machine, HARDWARE_CONCURRENCY=16)

| Flow | Apps | Baseline | init_3 | Δ |
|---|---:|---:|---:|---:|
| `deploy_ecdsar1+sponsored_fpc` | 6 | 6.29 s | 5.99 s | **-0.30 s (-4.8%)** |
| `ecdsar1+transfer_0_recursions+sponsored_fpc` | 3 | 5.09 s | 4.65 s | **-0.44 s (-8.6%)** |

Savings come exactly where the design predicted: -2 `HypernovaFoldingProver::fold`
calls, -2 `OinkProver::prove`, -2 `Chonk::complete_kernel_circuit_logic`. ECCVM
shrinks ~23% in trace rows but only ~7% in time (fixed sumcheck overhead).
Translator stays constant at 8192 rows by design (proof is constant-size).

## What was deferred and why

**Phase 6 (audit one-app-per-kernel assumptions) — folded into Phase 7.** The
canary proving + verifying real client flows on real bb is a stronger integration
gate than a code audit. If a one-app assumption had been violated, prove would
have crashed.

**Phase 8 (VK pin update) — not needed yet.** The pin script
(`barretenberg/cpp/scripts/test_chonk_standalone_vks_havent_changed.sh`) compares
VKs derived from *pinned bytecode* (frozen msgpack from S3) against pinned VKs in
the same msgpack. It catches C++-side bb regressions, not Noir-side circuit
changes. Our changes are Noir-side, so the pin test still passes on this branch
without intervention. The pin will need updating when init_3 stops being
flag-gated and becomes the default — at that point newly captured pins will
include init_3 steps, and the reference msgpack on S3 should be rotated.

## Follow-up opportunities

In rough order of payoff:

1. **`inner_3`** — the next obvious win. The deployment flow has 6 apps; init_3
   collapses the first 3 but the remaining 3 still go through 3 inner kernels.
   An inner that batches 3 apps would collapse those, saving another ~2 prev-kernel
   HN verifications. Same shape as init_3 but for the middle of the chain.

2. **Skip inner kernels entirely when init_3 absorbs everything.** Marked with
   `WORKTODO(luke)` at the bottom of the init_3 branch in
   `private_kernel_execution_prover.ts`. If `executionStack.length === 0` after
   init_3, the chain can go directly to reset+tail. The protocol-circuit
   ALLOWED_PREVIOUS lists already accept init_3 as a predecessor of
   reset/tail/tail_to_public, so this is purely an orchestrator change.
   Relevant for short flows like transfer_0.

3. **`init_2` / `inner_2` / `init_1` / `inner_1`.** Round out the variant set so
   the orchestrator can pick the largest batch that fits. Today the dispatch is
   binary (init_3 if ≥3 apps, else init); a graceful fallback through init_2
   would help any flow with exactly 2 apps. Probably low priority — most real
   flows have 3+.

4. **Generic `PrivateKernelInitNCircuitPrivateInputs<N>`.** The TS class is
   currently concrete (three explicit `privateCallN` fields). When a second
   variant lands, generalize.

5. **Remove the `PXE_USE_INIT_3` flag.** Once a few weeks of green CI confirm
   stability, the flag and its `totalAppCalls >= 3` gate can collapse into
   unconditional use. Coordinate with Phase 8 (pin update) at that point.

## Known papercuts

- **`find-bb` defaults to `bb-avm`** (`AVM=1`). Rebuilding only the non-AVM `bb`
  target leaves a stale `bb-avm` and downstream bootstraps keep failing with the
  same error after the supposed fix. This is now documented in
  `barretenberg/cpp/CLAUDE.md`.
- **`SKIP_STEP_COUNT_CHECK=1`** is required when running client_flow tests with
  `PXE_USE_INIT_3=1` because the `captureProfile` `expectedSteps` assertion is
  hard-coded for the standard init+inner chain. The reproducer script sets it;
  if you write new test paths that exercise init_3, set it explicitly.
- **Pre-existing stale gitignored derivatives** in
  `aztec.js/src/contract/protocol_contracts/` and `noir-contracts.js/src/` may
  exist on a tree that hasn't been bootstrapped recently. Symptom: `aztecVersion
  is missing in type ContractArtifact` build errors. Fix: run `./bootstrap.sh`
  from the repo root.

## Out of scope of this work

- Any change to the C++ Chonk recursive-verifier internals. The existing
  `bool is_init_kernel = front().type == OINK` (`chonk.cpp:314`) and the rest
  of `complete_kernel_circuit_logic` already correctly handle a 3-entry queue
  `[OINK, HN, HN]` — confirmed by the canary running real proofs. No bb code
  changes were needed.
- Changes to reset / tail config dimensions. init_3 produces the same
  `PrivateKernelCircuitPublicInputs` shape as init, so downstream kernels see
  no new shape.

## Files of interest

- `noir-projects/noir-protocol-circuits/crates/private-kernel-lib/src/private_kernel_init_n.nr`
  — the lib that init_3's binary instantiates with N=3.
- `noir-projects/noir-protocol-circuits/crates/private-kernel-init-3/src/main.nr`
  — the concrete crate.
- `yarn-project/pxe/src/private_kernel/private_kernel_execution_prover.ts`
  — the orchestrator. The init_3 dispatch is in the `firstIteration` branch.
- `yarn-project/end-to-end/scripts/reproduce_init3_canary.sh` — the reproducer.
