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

## Opus Review

**Verdict: APPROVE WITH NITS**

The other agent's analysis is substantively correct and well-reasoned. I independently verified:

- `CheckpointProposalJob.waitForValidParentCheckpointOnL1` exists at `sequencer-client/src/sequencer/checkpoint_proposal_job.ts:399`, called from `:244` only when `isPipelining` is true.
- The `parent-not-on-l1` discard reason is real: emitted at `checkpoint_proposal_job.ts:433` when `checkpointedNumber < parentCheckpointNumber`, registered in metrics at `metrics.ts:154`, and exercised by unit tests at `checkpoint_proposal_job.test.ts:894-903`.
- The test does call `eth.setAutomine(false)` and `eth.setIntervalMining(0)` (lines 110-111) and waits on `SequencerState.PUBLISHING_CHECKPOINT` (lines 127, 133).

**Soundness of the change**

The expanded comment is a clear improvement over the original, and the tightened wait (checking `getState()` before attaching the listener) closes a real registration race. The "fundamentally incompatible" framing is **defensible**: the test's assertion is that the sequencer reaches `PUBLISHING_CHECKPOINT` while L1 mining is paused, but `waitForValidParentCheckpointOnL1` blocks on the parent landing on L1 before allowing the pipelined child to publish. With mining paused, the parent cannot land, so the child is discarded (`parent-not-on-l1`) before reaching `PUBLISHING_CHECKPOINT`. Unlike `epochs_l1_reorgs` (where pipelining could conceivably be reworked), here the test's whole premise — a paused L1 — directly contradicts pipelining's sync precondition. "Fundamentally incompatible" is fair.

**The dangling reference**

The `PIPELINING.md §7.4 / Pattern C` reference is **dangling and should be removed**, matching the A-918 fix in commit `09279f8325`. Verified:

- No `PIPELINING.md` exists anywhere in the repo (`find` returned empty).
- `sequencer-client/src/sequencer/README.md` has section `### Pipelining Mode` at line 121 but no `§7.4`, no "Pattern C" anywhere — its top-level sections only go to "Complete Example" (line 539).
- The same dangling reference appears in `epochs_proof_fails.parallel.test.ts` (§7.3) and `epochs_l1_reorgs.parallel.test.ts` (§7.5), confirming the citation is templated, not grounded.

The other agent's "Review concerns checked" did not flag this dangling citation, which is the only real gap in the analysis. Otherwise the prose, the comment expansion, and the reasoning about the gate are all accurate.

**Suggested change**

```diff
-    // Pipelining is fundamentally incompatible with this test's design — see PIPELINING.md
-    // §7.4 / Pattern C.
+    // Pipelining is fundamentally incompatible with this test's design.
```

No other concerns. The race fix and comment expansion are net improvements; the dangling doc reference is the only thing worth correcting before merge.
