# epochs_first_slot proposer pipelining review

## Initial diff summary

- Owned test: `end-to-end/src/e2e_epochs/epochs_first_slot.test.ts`.
- Committed branch diff checked with:
  - `git diff origin/master...HEAD -- end-to-end/src/e2e_epochs/epochs_first_slot.test.ts`
- Against `origin/master...HEAD`, this test is a new file on the branch. The new test:
  - Starts 8 validator nodes over a mocked gossip network with committee size 3.
  - Enables `enableProposerPipelining: true`.
  - Uses `aztecSlotDurationInL1Slots: 6`.
  - Warps to the build window immediately before epoch 4's first slot.
  - Sends 2 txs and asserts blocks exist for the first two slots of the epoch.
  - Filters only exact `proposer-rollup-check-failed` / `Rollup contract check failed` events before asserting no significant sequencer failures.
- Current worktree diff is comment-only in this file:
  - Explains why `aztecSlotDurationInL1Slots` is widened from 3 to 6 under proposer pipelining.
  - Clarifies the warp target for the build window before the first slot of the epoch.
- The test itself already enables `enableProposerPipelining: true`, uses `aztecSlotDurationInL1Slots: 6`, and filters expected pipelined self-proposal rollup-check spam.

## Review concerns checked

- Proposer pipelining offset:
  - `epoch-cache/src/epoch_cache.ts` defines `PROPOSER_PIPELINING_SLOT_OFFSET = 1`.
  - The test warps to `epochStart - L2_SLOT_DURATION - L1_BLOCK_TIME`, then interval mining advances one L1 block to the start of the last slot before the epoch, so the pipelined target slot is the epoch first slot.
- Slot and timestamp math:
  - `getSlotRangeForEpoch(epoch)` starts at `epoch * epochDuration`.
  - `getTimestampRangeForEpoch(epoch)` starts at `l1GenesisTime + startSlot * slotDuration`.
  - With local default `ethereumSlotDuration = 8` and `aztecSlotDurationInL1Slots = 6`, the L2 slot is 48s locally. In production defaults the same ratio is 72s/12s.
- Timing constants:
  - `aztecSlotDurationInL1Slots: 6` gives 6 L1 blocks of room per L2 slot, matching the production ratio from `ethereum/src/generated/l1-contracts-defaults.ts` (`ETHEREUM_SLOT_DURATION=12`, `AZTEC_SLOT_DURATION=72`).
  - Validator nodes use `l1PublishingTime: test.L1_BLOCK_TIME_IN_S - 1`, leaving inclusion before the L1 slot boundary.
- Fail-event filtering:
  - `watchSequencerEvents` records `block-build-failed`, `checkpoint-publish-failed`, and `proposer-rollup-check-failed`.
  - The test filters only `proposer-rollup-check-failed` events with exact reason `Rollup contract check failed`, consistent with comparable e2e epoch tests and A-910 behavior.
  - Other fail events remain significant.

## Test commands

- Planned focused command:
  - `ANVIL_PORT=18545 LOG_LEVEL=verbose NODE_NO_WARNINGS=1 yarn --cwd end-to-end test:e2e e2e_epochs/epochs_first_slot.test.ts --runInBand --detectOpenHandles`
- Executed focused command:
  - `ANVIL_PORT=18545 LOG_LEVEL=verbose NODE_NO_WARNINGS=1 yarn --cwd end-to-end test:e2e e2e_epochs/epochs_first_slot.test.ts --runInBand --detectOpenHandles`

## Anvil port

- `18545`

## Results

- Passed.
- Jest summary:
  - `Test Suites: 1 passed, 1 total`
  - `Tests: 1 passed, 1 total`
  - `Time: 225.424 s`
- Jest reported two open handles from native `CustomGC` modules (`snappy` and `@crate-crypto/node-eth-kzg`) after the pass.

## Notable log excerpts / symptoms

- Setup used the expected timing:
  - `ethereumSlotDuration: 8`
  - `aztecSlotDuration: 48`
  - `enableProposerPipelining: true`
  - sequencer timetable logged `pipelining: true`.
- Warp / first-slot behavior:
  - L1 block 13 was mined at L2 slot 127, epoch 3.
  - Validator prepared checkpoint proposal 1 for slot 128 while wall-clock slot was 127.
  - Checkpoint 1 built block 1 for slot 128 with 1 tx.
  - Validator then prepared checkpoint proposal 2 for target slot 129 during wall-clock slot 128.
  - Checkpoint 2 built block 2 for slot 129 with 1 tx.
- Expected pipelining noise observed:
  - `ProposedCheckpointNotSequentialError: Proposed checkpoint 2 is not sequential: expected 1 (confirmed + 1)` before checkpoint 1 was confirmed.
  - Repeated `proposer-rollup-check-failed` events with reason `Rollup contract check failed` and `Rollup__InvalidArchive(...)`; these match the filtered A-910 class.
- Confirmation:
  - Checkpoint 1 was published at slot 128 to the rollup contract.
  - Checkpoint 2 L1 transaction was later sent for slot 129.
- Teardown/noise after the test had already satisfied assertions:
  - During shutdown, later empty checkpoint work for slot 130 timed out collecting attestations and emitted `checkpoint-publish-failed`.
  - Several validators logged `Native instance is closed` / world-state queue stopped while processing late gossip during teardown.

## Changes made

- Created this review notes file.
- No edits made to `epochs_first_slot.test.ts` by this review. Existing worktree edits in that file are comment-only.

## Final status

- Green locally with the focused command above on Anvil port `18545`.
- Residual risk: the test's fail-event assertion is evaluated before teardown, so teardown-time sequencer failures from later slot/checkpoint work are not part of the assertion. The focused behavior under review, blocks in epoch slots 128 and 129 under pipelining, passed.
