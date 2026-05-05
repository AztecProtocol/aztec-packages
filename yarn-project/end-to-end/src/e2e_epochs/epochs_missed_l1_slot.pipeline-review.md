# epochs_missed_l1_slot pipeline review

## Initial diff summary

- Command: `git diff -- end-to-end/src/e2e_epochs/epochs_missed_l1_slot.test.ts`
- Result: no diff output at task start.
- Correction from parent: most relevant changes are committed on this branch, not uncommitted.
- Command: `git diff origin/master...HEAD -- end-to-end/src/e2e_epochs/epochs_missed_l1_slot.test.ts`
- Result: `epochs_missed_l1_slot.test.ts` is a new file relative to `origin/master`, adding the missed-L1-slot regression test with proposer pipelining intentionally disabled.
- Command: `git status --short -- end-to-end/src/e2e_epochs/epochs_missed_l1_slot.test.ts end-to-end/src/e2e_epochs/epochs_missed_l1_slot.pipeline-review.md`
- Result at task start: no tracked/untracked output for the target test; notes file did not exist.

## Review concerns checked

- L1/L2 timing: test uses `aztecSlotDurationInL1Slots: 6`, so with the local default L1 block time of 8s the L2 slot is 48s. This gives enough room to select a checkpoint before the last L1 slot of its L2 slot.
- Missed L1 slot simulation: test pauses Anvil via `setAutomine(false)` and `setIntervalMining(0)`, then resumes with a manual mine and restored interval mining.
- Epoch/slot boundary math: the selected checkpoint must have `ev.timestamp < slotStart + (L2_SLOT_DURATION - L1_BLOCK_TIME)`, which excludes checkpoints published in the final L1 slot of the L2 slot. `nextSlotNumber = checkpointSlotNumber + 1` is the slot expected to build after the missed-L1-block condition.
- Checkpoint publish timing: the test waits for `PUBLISHING_CHECKPOINT` while L1 mining is paused, then resumes mining so the pending L1 proposal can land.
- Pipelining correctness: comments explicitly keep proposer pipelining disabled. This matches `CheckpointProposalJob.waitForValidParentCheckpointOnL1`, which discards pipelined work with `parent-not-on-l1` if the parent does not land/sync on L1. That gate is incompatible with pausing L1 mining while waiting for `PUBLISHING_CHECKPOINT`.
- `canProposeAt` / proposal state assumptions: with pipelining disabled, the rollup check should use current L1 state without pending-parent overrides. The test asserts sequencer progression from the missed-L1 sync signal, not pipelined parent handling.
- Fail-event filtering: this test does not currently watch sequencer fail events, so there is no filtering surface to review in the test body.
- Determinism concern before execution: the `state-changed` listener is registered only after mining is paused. If the sequencer enters `PUBLISHING_CHECKPOINT` during the 1500ms sleep or before listener registration, the test can miss the transition and time out even though behavior is correct.

## Commands and results

- Subagents: no subagent tool was available in this session, so test execution and log inspection were done directly.
- First run command: `ANVIL_PORT=18549 LOG_LEVEL=verbose NODE_NO_WARNINGS=1 yarn --cwd end-to-end test:e2e e2e_epochs/epochs_missed_l1_slot.test.ts --runInBand --detectOpenHandles`
- First run result: PASS, 1 test passed in 62.268s. Jest reported 2 `CustomGC` open handles from `snappy` and `@crate-crypto/node-eth-kzg`.
- First run observed log excerpts:
  - `enableProposerPipelining:false`
  - `Preparing checkpoint proposal 1 for target slot 1 during wall-clock slot 1`
  - `Checkpoint 1 in slot 1 at L1 timestamp 1777989225`, with `slotStart=1777989217` and `lastL1SlotStart=1777989257`
  - `Pausing L1 block production (simulating missed L1 slots)...`
  - `L1 mining paused at L1 timestamp 1777989225`
  - `Waiting for sequencer to reach PUBLISHING_CHECKPOINT during mining pause...`
- Rerun command after test edit: `ANVIL_PORT=18549 LOG_LEVEL=verbose NODE_NO_WARNINGS=1 yarn --cwd end-to-end test:e2e e2e_epochs/epochs_missed_l1_slot.test.ts --runInBand --detectOpenHandles`
- Rerun result: PASS, 1 test passed in 61.608s. Jest again reported the same 2 `CustomGC` open handles from `snappy` and `@crate-crypto/node-eth-kzg`.
- Rerun important log excerpts:
  - `enableProposerPipelining:false`
  - `Checkpoint 1 in slot 1 at L1 timestamp 1777989775`, with `slotStart=1777989767` and `lastL1SlotStart=1777989807`
  - `L1 mining paused at L1 timestamp 1777989775`
  - `Preparing checkpoint proposal 2 for target slot 2 during wall-clock slot 2`, with `syncedToL2Slot:1` and `pipeliningEnabled:false`
  - `Sequencer reached PUBLISHING_CHECKPOINT during mining pause`
  - `Published checkpoint 2 at slot 2 to rollup contract`
  - `Checkpoint 2 published in slot 2`

## Anvil port

- Required port: `18549`

## Changes made

- Created this review notes file.
- Made the `PUBLISHING_CHECKPOINT` wait observe `sequencer.getState()` before attaching the `state-changed` listener, avoiding a race where the state transition occurs before listener registration.

## Final status

- PASS after rerun.
- Residual risk: the test intentionally keeps proposer pipelining disabled because the missed-L1-slot simulation pauses L1 mining; enabling pipelining would exercise `parent-not-on-l1` discard behavior instead of this regression.
- Residual symptom: `--detectOpenHandles` reports two existing native `CustomGC` handles (`snappy`, `@crate-crypto/node-eth-kzg`) even though the suite passes.
