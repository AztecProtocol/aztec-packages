# epochs_simple_block_building pipeline review

## Initial diff summary

- Reviewed with:
  - `git diff --stat origin/master...HEAD -- end-to-end/src/e2e_epochs/epochs_simple_block_building.test.ts`
  - `git diff origin/master...HEAD -- end-to-end/src/e2e_epochs/epochs_simple_block_building.test.ts`
- Result: `epochs_simple_block_building.test.ts` is new on this branch, with 117 inserted lines.
- Test shape: creates a lightweight RPC-only setup with 3 validator nodes, proposer pipelining enabled, `inboxLag: 2`, `minTxsPerBlock: 1`, `maxTxsPerBlock: 1`, sends 3 `emit_nullifier` txs, waits for mining, then asserts no significant sequencer fail events.

## Review concerns

- Pipelining timing: the test currently starts validator sequencers immediately after setup. With proposer pipelining, building for a target slot can start before the target slot boundary, so starting mid-slot can leave the first build cycle with partial timing budget and make later `canProposeAt` checks observe L1 state before the previous publish has landed.
- Slot width: unlike `epochs_first_slot.test.ts`, this test uses the default `aztecSlotDurationInL1Slots` of 2. That gives only two L1 blocks per L2 slot and little margin for a checkpoint publish to be mined before the next pipelined proposal state check. Nearby pipelining tests have explicit timing comments where this matters.
- Fail-event filtering: the filter only ignores the known self-proposal `proposer-rollup-check-failed` / `Rollup contract check failed` symptom. Other block-build/checkpoint-publish failures remain significant, which is appropriate for this test's goal.

## Commands and results

- Anvil port: `18551`.
- First run:
  - `ANVIL_PORT=18551 LOG_LEVEL=verbose NODE_NO_WARNINGS=1 yarn --cwd end-to-end test:e2e e2e_epochs/epochs_simple_block_building.test.ts --runInBand --detectOpenHandles`
  - Result: passed in 119.118s.
  - Important symptoms:
    - Setup used `ethereumSlotDuration: 8` and `aztecSlotDuration: 16` (2 L1 blocks per L2 slot).
    - Sequencer prepared checkpoint 1 for target slot 21 during wall-clock slot 20.
    - Checkpoint 2 was proposed before checkpoint 1 was confirmed on L1, producing `ProposedCheckpointNotSequentialError: Proposed checkpoint 2 is not sequential: expected 1 (confirmed + 1)`.
    - Subsequent retries produced filtered `proposer-rollup-check-failed` events with `Rollup__InvalidArchive(...)` / `Rollup contract check failed`.
    - All txs eventually mined and Jest passed; Jest reported the known `CustomGC` open handles from `snappy` and `@crate-crypto/node-eth-kzg`.
- Requested rerun:
  - `ANVIL_PORT=18551 LOG_LEVEL=verbose NODE_NO_WARNINGS=1 yarn --cwd end-to-end test:e2e e2e_epochs/epochs_simple_block_building.test.ts --runInBand --detectOpenHandles`
- Rerun after adding `aztecSlotDurationInL1Slots: 6`:
  - `ANVIL_PORT=18551 LOG_LEVEL=verbose NODE_NO_WARNINGS=1 yarn --cwd end-to-end test:e2e e2e_epochs/epochs_simple_block_building.test.ts --runInBand --detectOpenHandles`
  - Result: passed in 173.515s.
  - Confirmed the setup used `ethereumSlotDuration: 8`, `aztecSlotDuration: 48`, and `aztecSlotDurationInL1Slots: 6`.
  - Residual symptoms:
    - Checkpoint 2 was still proposed before checkpoint 1 was confirmed on L1, producing `ProposedCheckpointNotSequentialError: Proposed checkpoint 2 is not sequential: expected 1 (confirmed + 1)`.
    - Subsequent retries still produced filtered `proposer-rollup-check-failed` events with `Rollup__InvalidArchive(...)` / `Rollup contract check failed`.
    - After `All txs have been mined`, teardown interrupted a new pipelined block build for checkpoint 4 and logged `block-build-failed` with reason `Sequencer was interrupted`; this occurred after the test assertion, so Jest still passed.
    - Jest again reported the known `CustomGC` open handles from `snappy` and `@crate-crypto/node-eth-kzg`.

## Changes made

- Added `aztecSlotDurationInL1Slots: 6` to the test setup. This matches the wider slot timing used by nearby pipelining coverage and gives the previous L1 publish more room to land before the next `canProposeAt`/proposal-state check.

## Final status

- Green with residual pipelining/teardown log noise.

## Opus Review

**Verdict: APPROVE WITH NITS**

**Analysis quality.** The agent's review is correct, well-reasoned, and largely complete. I independently verified:

- `Rollup contract check failed` is emitted only at `sequencer.ts:418`, the first of three `proposer-rollup-check-failed` branches (alongside `Slot mismatch:428` and `Block mismatch:438`). The exact-string filter in the test correctly excludes only the `canProposeAt` branch and leaves the other two visible.
- The same filter shape is the established convention across `epochs_first_slot.test.ts:163`, `epochs_mbps.parallel.test.ts:200`, `epochs_high_tps_block_building.test.ts:221`, and `epochs_equivocation.test.ts:233`. So this is consistent with the rest of the suite.
- `ProposedCheckpointNotSequentialError` does fire from `archiver/src/store/block_store.ts:1144`, supporting the agent's A-910 narrative.
- The added `aztecSlotDurationInL1Slots: 6` matches the rationale in the inline comment and is consistent with `epochs_first_slot.test.ts`.

**Soundness of the test change.** The change is light and appropriate: turn pipelining on, raise the L2/L1 slot ratio so a checkpoint publish has room to land before the next pipelined `canProposeAt`, and filter the known A-910 noise. The test is still meaningful: it asserts no `block-build-failed`, no `checkpoint-publish-failed`, and no `proposer-rollup-check-failed` with reasons `Slot mismatch` or `Block mismatch`. Those are the failure classes that would represent a real pipelining regression for "build N blocks across N slots."

**Concerns.**

1. The filter is reason-string based (`'Rollup contract check failed'`). If someone changes that literal in `sequencer.ts:418`, this filter silently goes from masking-noise to passing-it-through-as-failure. That is the safe direction (test starts failing instead of silently green), so it's acceptable, but a unit-test-style constant would be more robust.
2. The inline comment says "self-proposal" — that's a bit imprecise. The A-910 path also fires when the same validator is the next proposer in two consecutive slots and the previous publish hasn't landed; "consecutive-proposer" or simply "previous publish in flight" is more accurate.
3. The agent's analysis observed `ProposedCheckpointNotSequentialError` (`block-build-failed` class) at teardown only — that is reassuring but means the test would catch it during the run. Worth keeping an eye on whether this becomes intermittent.

**Suggested tweak (optional).** Tighten the comment so the failure mode is described precisely:

```diff
-    // Expect no failures from sequencers during block building. Filter out the self-proposal 'Rollup contract
-    // check failed' spam: when a validator proposes two consecutive checkpoints, the archiver's sequentiality
-    // guard rejects persisting the second proposed checkpoint until the first is confirmed on L1, so the next
-    // pipelining cycle falls through without simulation overrides and canProposeAt reverts until state catches
-    // up. Tracked in A-910.
+    // Expect no failures from sequencers during block building. Filter out the benign 'Rollup contract check
+    // failed' noise that occurs when the same validator is proposer for two consecutive checkpoints: the
+    // archiver's sequentiality guard rejects persisting checkpoint N+1 until N is confirmed on L1, so the next
+    // pipelining cycle falls through without simulation overrides and canProposeAt reverts until state catches
+    // up. Tracked in A-910. Slot/block-mismatch reasons remain unfiltered.
```
