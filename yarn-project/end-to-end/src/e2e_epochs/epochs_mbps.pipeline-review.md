# epochs_mbps.parallel.test.ts Pipeline Review Notes

## Initial Snapshot

- Date: 2026-05-05 UTC.
- Workspace: `/mnt/user-data/santiago/code/aztec/yarn-project`.
- Target test: `end-to-end/src/e2e_epochs/epochs_mbps.parallel.test.ts`.
- Notes file: `end-to-end/src/e2e_epochs/epochs_mbps.pipeline-review.md`.
- Allowed edits: target test and this notes file only.
- `git status --short` showed unrelated changes:
  - `M end-to-end/src/e2e_epochs/epochs_first_slot.test.ts`
  - `?? ../llvm.sh.1`
  - `?? ../llvm.sh.2`
  - `?? ../llvm.sh.3`
  - `?? .claude/scheduled_tasks.lock`
- `git diff -- end-to-end/src/e2e_epochs/epochs_mbps.parallel.test.ts` showed no current diff for the target test.
- Sandbox note: initial read-only commands failed with `bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted`; subsequent read-only commands were run escalated.
- Parent correction: the relevant review baseline is committed branch diff, not local uncommitted diff.
- `git diff origin/master...HEAD -- end-to-end/src/e2e_epochs/epochs_mbps.parallel.test.ts` shows the target test is a new 592-line file on this branch relative to `origin/master`.

## Initial Commands

- `git status --short`
- `git diff -- end-to-end/src/e2e_epochs/epochs_mbps.parallel.test.ts`
- `git diff origin/master...HEAD -- end-to-end/src/e2e_epochs/epochs_mbps.parallel.test.ts`
- `sed -n '1,260p' end-to-end/src/e2e_epochs/epochs_mbps.parallel.test.ts`
- `sed -n '261,620p' end-to-end/src/e2e_epochs/epochs_mbps.parallel.test.ts`
- `rg -n "pipeline|pipelining|canProposeAt|fail|missed|proven|checkpoint" end-to-end/src/e2e_epochs -g '*.ts'`
- `ls end-to-end/src/e2e_epochs`
- `sed -n '1,340p' end-to-end/src/e2e_epochs/epochs_mbps.pipeline.parallel.test.ts`
- `sed -n '480,560p' end-to-end/src/e2e_epochs/epochs_test.ts`
- `rg -n "watchSequencerEvents|significantFailEvents|proposer-rollup-check-failed|failEvents" end-to-end/src/e2e_epochs -g '*.ts'`

## Review Concerns To Check

- L1/L2 slot timing and boundary math under proposer pipelining.
- Epoch/slot offset assumptions for pipelined proposal build slot versus submission/header slot.
- Missed/proven block assumptions and whether waits target checkpointed/proposed state deterministically.
- Checkpoint publish timing with parent checkpoint L1 confirmation and `canProposeAt` rollup checks.
- Whether expected proposer/proposal state assumptions are too strict for pipelined tests.
- Fail-event filtering: benign `proposer-rollup-check-failed` / `Rollup contract check failed` can occur while state catches up, but other failures should stay visible.
- Determinism of tx timing around slot boundaries and checkpoint block-count assertions.

## Branch Diff Summary

- `epochs_mbps.parallel.test.ts` is introduced by the branch.
- The test enables proposer pipelining for all MBPS scenarios, with `ethereumSlotDuration: 12`, `aztecSlotDuration: 72`, `blockDurationMs: 5500`, `aztecEpochDuration: 4`, `aztecTargetCommitteeSize: 3`, `inboxLag: 2`, `perBlockAllocationMultiplier: 8`, `enforceTimeTable: true`, and `skipInitialSequencer: true`.
- It starts four validator nodes manually, redirects the wallet to the first validator node, and uses that node's archiver for checkpoint assertions.
- It covers checkpointed anchors, proposed anchors, L2-to-L1 messages, L1-to-L2 messages, non-validator re-execution/sync, and deploy-then-call ordering within a checkpoint.
- The helper `assertMultipleBlocksPerSlot` waits for a checkpoint with at least the target block count, then verifies block index, checkpoint number, and contiguous block numbering.
- The deploy/call test computes a target timestamp one L1 slot before the next L2 slot using `getSlotAtTimestamp`/`getTimestampForSlot`, then sends the deploy and call with a short propagation delay.

## Anvil Port

- Required Anvil port: `18547`.

## Test Run 1

- Command:
  - `ANVIL_PORT=18547 LOG_LEVEL=verbose NODE_NO_WARNINGS=1 yarn --cwd end-to-end test:e2e e2e_epochs/epochs_mbps.parallel.test.ts --runInBand --detectOpenHandles`
- Status: interrupted after reproducing the stale descendant-proposal problem.
- Subagent note: no separate subagent tool is available in this session, so the test and log inspection are being handled directly.
- Early setup excerpts:
  - `Deploying L1 contracts with config: {"ethereumSlotDuration":12,"aztecSlotDuration":72,"aztecEpochDuration":4,...,"enableProposerPipelining":true,...,"blockDurationMs":5500,...}`
  - `Sequencer timetable initialized with 11 blocks per slot (enforced) {"ethereumSlotDuration":12,"aztecSlotDuration":72,...,"pipelining":true,...,"blockDuration":5.5,"maxNumberOfBlocks":11}`
- Important symptom observed while first case was running:
  - `Failed canProposeAtTime check with InvalidArchive`
  - `Cannot propose checkpoint 2 at slot 13 due to failed rollup contract check {"slot":13,"targetSlot":14,...,"isPendingChainValid":{"valid":true}}`
- The initial `InvalidArchive` sequence cleared after checkpoint 1 landed on L1:
  - `Published checkpoint 1 at slot 13 to rollup contract {"txCount":6,"blockCount":3,"slotNumber":13,"checkpointNumber":1,...}`
  - `Preparing checkpoint proposal 2 for target slot 14 during wall-clock slot 13`
  - `Starting checkpoint proposal {"buildSlot":13,"submissionSlot":14,"pipelining":true,...}`
- Later in the suite, while waiting for proof after the tested checkpoint had already landed, sequencers kept building descendant checkpoints. This produced real stale descendant symptoms:
  - `CheckpointNumberNotSequentialError: Cannot insert new checkpoint 3 given previous confirmed checkpoint number is 1`
  - `ProposedCheckpointNotSequentialError: Proposed checkpoint 3 is not sequential: expected 2 (confirmed + 1)`
  - `Timeout collecting attestations for slot 14: 1/3`
  - `Pruning blocks after block 2 due to slot 14 not being checkpointed`
- Interpretation: continuing sequencer production while the test waits for proof lets unrelated pipelined descendants race ahead of L1 confirmation. The MBPS assertions already have their target checkpoint, so the narrow deterministic fix is to stop validator sequencers before waiting for proof.

## Changes Made

- Added `TrackedSequencerEvent` import and installed `test.watchSequencerEvents` after validator nodes are created.
- Updated `waitForProvenCheckpoint` to stop all validator sequencers before waiting for the target checkpoint to be proven.
- Added significant fail-event filtering after proof:
  - Allows benign `proposer-rollup-check-failed` events whose reason is `Rollup contract check failed`.
  - Fails the test on other sequencer fail events.

## Test Run 2

- Command:
  - `ANVIL_PORT=18547 LOG_LEVEL=verbose NODE_NO_WARNINGS=1 yarn --cwd end-to-end test:e2e e2e_epochs/epochs_mbps.parallel.test.ts --runInBand --detectOpenHandles`
- Status: running after the fix.
- Early setup confirms the same required timing and Anvil port:
  - `l1RpcUrls:["http://127.0.0.1:18547"]`
  - `ethereumSlotDuration":12`
  - `aztecSlotDuration":72`
  - `blockDurationMs":5500`
