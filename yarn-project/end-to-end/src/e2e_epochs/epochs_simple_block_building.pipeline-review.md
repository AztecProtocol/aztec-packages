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
