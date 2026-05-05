# epochs_mbps_redistribution pipeline review

## Initial diff summary

- Workspace: `/mnt/user-data/santiago/code/aztec/yarn-project`
- Target test: `end-to-end/src/e2e_epochs/epochs_mbps_redistribution.test.ts`
- Notes file: `end-to-end/src/e2e_epochs/epochs_mbps_redistribution.pipeline-review.md`
- Anvil port: `18548`
- Uncommitted target diff command first tried: `git diff -- end-to-end/src/e2e_epochs/epochs_mbps_redistribution.test.ts`
- Result: no uncommitted diff in the target test.
- Parent correction: most relevant changes are committed on this branch.
- Branch review diff command: `git diff origin/master...HEAD -- end-to-end/src/e2e_epochs/epochs_mbps_redistribution.test.ts`
- Result: file is new relative to `origin/master...HEAD`; current branch content includes two proposer-pipelining MBPS redistribution tests.
- Recent target-file commit: `230a573d4d test(pipelining): enable pipelining in epochs_mbps_redistribution (A-920)`
- Unrelated workspace changes observed and not touched:
  - `end-to-end/src/e2e_epochs/epochs_first_slot.test.ts`
  - `../llvm.sh.1`
  - `../llvm.sh.2`
  - `../llvm.sh.3`
  - `.claude/scheduled_tasks.lock`

## Review concerns

- Timing uses `ethereumSlotDuration: 4`, `aztecSlotDuration: 36`, `blockDurationMs: 8000`, `l1PublishingTime: 2`, and `attestationPropagationTime: 0.5`.
- The test comments assume three blocks per checkpoint and build start one L1 slot before the target L2 slot.
- Existing sibling pipelining tests widened timing for similar `canProposeAt` / L1 confirmation races, so this tighter 36s/4s timing needs a local run.
- The first test depends on transaction send timing to isolate early txs from late txs; this may be nondeterministic if a late tx reaches the mempool before the current block builder finishes collecting txs.
- The second test identifies checkpoint proposer via `EpochCache` and asserts production fair-share caps for normal proposers. This looks directionally correct, but the hard-coded `MAX_BLOCKS_PER_CHECKPOINT = 3` must match the timetable produced by the configured slot timings.
- No fail-event watcher is currently installed in this test, unlike nearby pipelining tests that filter known `proposer-rollup-check-failed` / `Rollup contract check failed` noise and assert no significant events.

## Commands

- `git status --short`
- `git diff -- end-to-end/src/e2e_epochs/epochs_mbps_redistribution.test.ts`
- `sed -n '1,260p' end-to-end/src/e2e_epochs/epochs_mbps_redistribution.test.ts`
- `sed -n '261,620p' end-to-end/src/e2e_epochs/epochs_mbps_redistribution.test.ts`
- `rg -n "canProposeAt|proposal|fail|failEvent|Failed|FailedEvent|perBlockAllocationMultiplier|maxTxsPerCheckpoint|enableProposerPipelining" end-to-end/src/e2e_epochs end-to-end/src -g '*.ts'`
- `git diff origin/master...HEAD -- end-to-end/src/e2e_epochs/epochs_mbps_redistribution.test.ts`
- `git log --oneline --decorate -5 -- end-to-end/src/e2e_epochs/epochs_mbps_redistribution.test.ts`

## Subagents

- No subagent tool is available in this session. Test execution and log inspection are being done directly.

## Changes made

- Created this notes file.

## Test runs

- `ANVIL_PORT=18548 LOG_LEVEL=verbose NODE_NO_WARNINGS=1 yarn --cwd end-to-end test:e2e e2e_epochs/epochs_mbps_redistribution.test.ts --runInBand --detectOpenHandles`
  - Result: PASS.
  - Test Suites: 1 passed, 1 total.
  - Tests: 2 passed, 2 total.
  - Time: 229.047 s.
  - No code fix was required.

## Important log excerpts / symptoms

- First test produced the intended checkpoint shape:
  - Built block 1 at checkpoint 1 with 1 tx.
  - Built block 2 at checkpoint 1 with 1 tx.
  - Built block 3 at checkpoint 1 with 4 txs.
  - Late tx block numbers were `3, 3, 3, 3`.
- Second test observed high and normal proposer paths:
  - High-multiplier proposer `0x90f79bf6eb2c4f870365e785982e1f101e93b906` built checkpoint 1 with a multi-tx block.
  - Normal-multiplier proposer `0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc` built checkpoint 2 with two blocks and validators accepted the checkpoint.
- Expected pipelining noise appeared while waiting for prior checkpoint L1 confirmation:
  - `Failed canProposeAtTime check with InvalidArchive`
  - `Cannot propose checkpoint 2 at slot 14 due to failed rollup contract check`
- Teardown produced `SequencerInterruptedError` / `Native instance is closed` logs while services were stopping after assertions had already passed.
- Jest reported two open handles under `--detectOpenHandles`, both native `CustomGC` handles (`snappy` and `@crate-crypto/node-eth-kzg`), but exited with code 0.

## Final status

- Review complete for the target file. Targeted e2e run is green. No changes were made to the test file.

## Opus Review

**Verdict: APPROVE WITH NITS**

### On the actual diff
The task description mentions a swap from "strict `each block <= 1 tx`" to a "production cap formula" assertion. That swap is NOT in the branch diff against `origin/merge-train/spartan` — `git diff` shows only two lines added: `enableProposerPipelining: true` and `inboxLag: 2`. The cap-formula assertion logic (and the `blockTxCounts[0] > 1` HIGH-multiplier check) already existed on the base. The other agent did not call out this discrepancy with the task framing, but its narrower scope (just enabling pipelining) is the right read of the actual change.

### On the other agent's analysis
Correct on the substance and the test-run outcome. Concerns flagged (timing tightness, mempool nondeterminism in test 1, lack of fail-event watcher) are valid. Two gaps:
- Does not verify the cap math against `checkpoint_builder.ts:218-227`. I confirmed: `cappedMaxTransactions` is first bounded by `remainingTxs` at line 216 (`Math.min(opts.maxTransactions ?? Infinity, remainingTxs)`), then further reduced by `Math.ceil((remainingTxs / remainingBlocks) * multiplier)` at 226. So the `Math.min(., remainingTxs)` clamp the agent omits in its cap-loop comment is actually applied upstream — the production code is safe and the test comment ("capped by remaining = 2") matches.
- Does not validate that `MAX_BLOCKS_PER_CHECKPOINT` is genuinely 3 at runtime under the configured timings. The setup comment derives 35s of useful slot from a 36s `aztecSlotDuration`, which yields exactly 3 sub-slots. The green test run is consistent with this, but it is timing-sensitive.

### Discrimination of HIGH (10) vs NORMAL (1.2)
For the first block of an empty checkpoint with `maxTxsPerCheckpoint=2`, `remainingBlocks=3`:
- NORMAL: `min(2, ceil(2/3 * 1.2)) = min(2, 1) = 1`
- HIGH:   `min(2, ceil(2/3 * 10))  = min(2, 7) = 2`

So `blockTxCounts[0] > 1` is uniquely satisfiable by HIGH proposers — assertion is meaningful. Good.

### Nits
- Test 2 has no fail-event watcher. Sibling pipelining tests (e.g. `epochs_first_slot`) install one. Worth adding for symmetry.
- Test 2 only asserts a HIGH-proposer multi-tx first block; it never positively asserts that a NORMAL proposer's checkpoint was attested-and-finalized (the original "no fair-share re-execution" claim). Today this is implicit (the chain advances to the next HIGH checkpoint). A stronger assertion would explicitly verify a NORMAL-proposer checkpoint was finalized.

### Suggested doc patch

```diff
--- a/yarn-project/end-to-end/src/e2e_epochs/epochs_mbps_redistribution.pipeline-review.md
+++ b/yarn-project/end-to-end/src/e2e_epochs/epochs_mbps_redistribution.pipeline-review.md
@@ -28,6 +28,9 @@
 - The second test identifies checkpoint proposer via `EpochCache` and asserts production fair-share caps for normal proposers. This looks directionally correct, but the hard-coded `MAX_BLOCKS_PER_CHECKPOINT = 3` must match the timetable produced by the configured slot timings.
 - No fail-event watcher is currently installed in this test, unlike nearby pipelining tests that filter known `proposer-rollup-check-failed` / `Rollup contract check failed` noise and assert no significant events.
+- Verified against `validator-client/src/checkpoint_builder.ts:216-226`: `cappedMaxTransactions` is clamped to `remainingTxs` before the proposer-mode multiplier is applied, so HIGH (10) caps to `min(2, 7) = 2` and NORMAL (1.2) caps to `min(2, 1) = 1`. The `blockTxCounts[0] > 1` assertion uniquely discriminates HIGH from NORMAL.
+- Test 2 never positively asserts that a NORMAL-proposer checkpoint was attested and finalized; that part of the docstring's claim is only implicit in chain progression.
```

