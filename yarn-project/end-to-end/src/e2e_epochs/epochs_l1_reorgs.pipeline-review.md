# epochs_l1_reorgs.parallel pipeline review

## Initial diff summary

- Baseline requested by parent correction: `origin/master...HEAD`.
- Command: `git diff origin/master...HEAD -- end-to-end/src/e2e_epochs/epochs_l1_reorgs.parallel.test.ts`
- Result: the file is new relative to `origin/master`.
- Relevant branch history for this file:
  - `581417af92 refactor(e2e): enable pipelining in e2e_epochs tests (#22544)`
  - `6a8fe0df6a docs(pipelining): document why pipelining stays off in epochs_l1_reorgs.parallel (A-917)`
- Current unstaged diff for the target test was empty at task start.
- Concurrent/unrelated workspace changes observed and left untouched:
  - `end-to-end/src/e2e_epochs/epochs_first_slot.test.ts`
  - several untracked review notes and files outside this task.
- Sandbox symptom: read-only commands initially failed with `bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted`; repeated read-only commands with approval.

## Review concerns

- L1/L2 timing: setup uses 4s L1 slots, 36s L2 slots, 4 L2 slots per epoch, 8s block build duration, and `l1PublishingTime: 2`. This provides multiple L1 blocks per L2 slot while keeping reorg tests fast.
- Epoch and proof-window math: proof-window waits are based on `getEpochNumberForCheckpoint()` and `waitUntilLastSlotOfProofSubmissionWindow()`, which computes one L2 slot before the proof submission deadline. This is preferable to hard-coded L1 block counts.
- Pipelining correctness: proposer pipelining is intentionally not enabled. The tests cancel, hold, remove, and reinsert L1 proposal/proof/message transactions. Pipelining assumes a parent checkpoint can be treated as landed during child simulation; these tests intentionally violate that assumption through L1 reorgs.
- `canProposeAt` / proposal state assumptions: with pipelining disabled, proposals are checked against canonical L1 state. Enabling pipelining would make parent checkpoint state speculative and can produce expected `parent-not-on-l1`, `parent-hash-mismatch`, or `Rollup contract check failed` paths rather than the test's intended reorg behavior.
- Reorg interactions: tests use `reorgTo`, `reorg`, and `reorgWithReplacement`, including replay of raw txs and blob sidecars. The blob replay test correctly sends blobs to the blob client after raw L1 inclusion.
- Fail-event filtering: this test does not use `watchSequencerEvents`, so it does not need pipelining-specific fail-event filtering. That is consistent with pipelining staying disabled.
- Determinism concerns to validate by test run:
  - Waits that target exact checkpoint numbers may race with a freshly mined checkpoint after sync.
  - The "second proof lands" test waits for `CheckpointNumber(1)` after creating a new prover, which may be too loose if the initial proven checkpoint is already 1 or higher.
  - New node sync has a 10s timeout, which may be tight on slower local runs.

## Commands

- `git diff -- end-to-end/src/e2e_epochs/epochs_l1_reorgs.parallel.test.ts`
- `git status --short -- end-to-end/src/e2e_epochs/epochs_l1_reorgs.parallel.test.ts end-to-end/src/e2e_epochs/epochs_l1_reorgs.pipeline-review.md`
- `sed -n '1,260p' end-to-end/src/e2e_epochs/epochs_l1_reorgs.parallel.test.ts`
- `sed -n '261,620p' end-to-end/src/e2e_epochs/epochs_l1_reorgs.parallel.test.ts`
- `sed -n '1,260p' end-to-end/src/e2e_epochs/epochs_test.ts`
- `sed -n '261,620p' end-to-end/src/e2e_epochs/epochs_test.ts`
- `rg -n "pipel|pipeline|publisher|canProposeAt|proposal|l1PublishingTime|enforceTimeTable|fail-event|failed|parent-not-on-l1|parent-hash-mismatch" end-to-end/src/yarn-project end-to-end/src e2e end-to-end/src/e2e_epochs` failed because two searched paths did not exist.
- `git diff origin/master...HEAD -- end-to-end/src/e2e_epochs/epochs_l1_reorgs.parallel.test.ts`
- `git log --oneline --decorate --max-count=8 -- end-to-end/src/e2e_epochs/epochs_l1_reorgs.parallel.test.ts`
- `git status --short`

## Test run

- Required Anvil port: `18546`.
- Subagents: no subagent/task tool is available in this session; test execution and log inspection are being done directly.
- Completed command:
  - `ANVIL_PORT=18546 LOG_LEVEL=verbose NODE_NO_WARNINGS=1 yarn --cwd end-to-end test:e2e e2e_epochs/epochs_l1_reorgs.parallel.test.ts --runInBand --detectOpenHandles`
- Result: PASS, 1 suite passed, 7 tests passed, runtime 1081.382s.
- Open-handle detector reported two `CustomGC` handles from native modules (`snappy` and `@crate-crypto/node-eth-kzg`). These were reported after Jest marked the suite passed and are not specific to this test's assertions.

## Log observations

- Reorged proof-removal scenario produced transient `BlockNotFoundError` logs while the L1 reorg temporarily removed the referenced L1 block. Sync recovered after replacement blocks landed and the scenario passed.
- Several teardown paths logged `SequencerInterruptedError` or pending L1 transaction timeout/interruption while services were stopping. These happened after the relevant assertions and did not fail the suite.
- Message reorg scenarios intentionally triggered rolling-hash mismatch warnings before rolling the message syncpoint back to the most recent common L1-to-L2 message. The retry then retrieved the expected replacement messages and the assertions passed.

## Changes made

- Created this review notes file.
- Appended completed test result and log review observations.

## Final status

- Review complete. No test-file changes were needed.
