# epochs_proof_fails.parallel.test.ts pipeline review

## Initial diff summary

- `git status --short` showed unrelated local changes only: `end-to-end/src/e2e_epochs/epochs_first_slot.test.ts` modified and several untracked files outside this task.
- `git diff -- end-to-end/src/e2e_epochs/epochs_proof_fails.parallel.test.ts` and `git diff --cached -- ...` were empty at review start.
- Per parent correction, the relevant branch diff is committed: `git diff origin/master...HEAD -- end-to-end/src/e2e_epochs/epochs_proof_fails.parallel.test.ts`.
- That branch diff adds `end-to-end/src/e2e_epochs/epochs_proof_fails.parallel.test.ts` as a new 173-line file.
- The new target file contains a setup comment explaining that proposer pipelining is intentionally not enabled because held parent L1 txs cause pipelined child work to be discarded as `parent-not-on-l1`.

## Review concerns checked

- L1/L2 timing: setup uses `ethereumSlotDuration: 8`, default Aztec slot duration is `2 * ethereumSlotDuration = 16`, and `aztecEpochDuration: 8`, so epoch 2 begins at L2 slot 16.
- Epoch math: `getEpochAtSlot(slot, constants)` is integer division by epoch duration; checkpoint 1 is explicitly asserted to be epoch 0 before proof-delay assumptions are used.
- Proof failure assumption: first test delays the prover tx until epoch 2 start, then delays the next sequencer tx to one L1 block after epoch 2 start, expecting the stale proof tx to revert before the rollback-triggering proposal lands.
- Checkpoint timing: first test waits for checkpoint 1, then waits for `checkpointNumberAtEndOfEpoch0 + epochDuration` to ensure epoch 1 checkpoints are published before delaying the sequencer.
- Pipelining/canProposeAt state: no explicit pipelining flag is enabled. The local comments match neighboring tests that document why parent-on-L1 gating makes these L1 tx hold/reorg tests incompatible with pipelining.
- Fail-event filtering: this test does not filter sequencer/prover events; it validates L1 receipts from the delayers' last sent tx hashes. Residual determinism depends on those delayers only recording relevant proposer/prover txs in order.
- Determinism risk noted before running: `pauseNextTxUntilTimestamp` plus `.at(-1)` assumes no later unrelated tx is sent through the same delayer before assertions.

## Commands

- Read-only inspection initially failed in the sandbox with `bwrap: loopback: Failed RTM_NEWADDR: Operation not permitted`; repeated read-only commands with approval.
- Branch diff command:
  `git diff origin/master...HEAD -- end-to-end/src/e2e_epochs/epochs_proof_fails.parallel.test.ts`
- Planned test command:
  `ANVIL_PORT=18550 LOG_LEVEL=verbose NODE_NO_WARNINGS=1 yarn --cwd end-to-end test:e2e e2e_epochs/epochs_proof_fails.parallel.test.ts --runInBand --detectOpenHandles`

## Anvil port

- `18550`

## Changes made

- No test code changes were needed. The committed test logic passed as-is after review against
  `origin/master...HEAD`.
- Added this review notes file and kept it updated with diff basis, command, runtime symptoms, and final result.

## Test results and symptoms

- Command run from repo root:
  `ANVIL_PORT=18550 LOG_LEVEL=verbose NODE_NO_WARNINGS=1 yarn --cwd end-to-end test:e2e e2e_epochs/epochs_proof_fails.parallel.test.ts --runInBand --detectOpenHandles`
- Result: PASS, 1 suite / 2 tests passed.
  - `does not allow submitting proof after epoch end` passed in 254757 ms.
  - `aborts proving if end of next epoch is reached` passed in 248723 ms.
  - Total Jest time: 512.522 s.
- Runtime pipelining observation: setup/proposal logs showed `enableProposerPipelining:false` / `pipeliningEnabled:false`, matching the test comment that this proof-deadline-miss scenario is intentionally not run with proposer pipelining enabled.
- Important first-test symptoms:
  - First checkpoint mined in epoch 0 before creating the prover node.
  - Prover tx was delayed until epoch 2 start.
  - Reorg/prune occurred after the missed proof deadline, with log symptom:
    `Removed 14 checkpoints after checkpoint 0 due to predicted reorg at L1 block 36. Updated latest checkpoint is 0.`
  - Delayed prover proof tx reverted, then delayed sequencer proposal tx succeeded and republished checkpoint 1 at slot 16 / epoch 2.
- Important second-test symptoms:
  - The mocked `finalizeEpoch` slept 144 seconds (`L2_SLOT_DURATION_IN_S * (epochDuration + 1)`).
  - Reorg/prune occurred after epoch 1 checkpoints, with log symptom:
    `Removed 15 checkpoints after checkpoint 0 due to predicted reorg at L1 block 36. Updated latest checkpoint is 0.`
  - The prover finalized too late and the job failed before submission with:
    `Cannot submit epoch proof for 1-7 as proposed checkpoint is 1`
  - The test assertion confirmed no new prover tx was sent after the recorded prover tx count.
- Jest reported two known-style open handles under `--detectOpenHandles` (`CustomGC` from `snappy` and `@crate-crypto/node-eth-kzg`), but the suite exited with code 0.

## Final status

- Green on Anvil port 18550.
- Residual risks: the first test still relies on the delayers' last sent tx hashes being the relevant proof/proposal txs, and the second test is intentionally timing-sensitive due to the mocked long `finalizeEpoch` sleep. The passing verbose run matched the intended proof-deadline and rollback behavior.

## Opus Review

**Verdict: APPROVE WITH NITS**

The other agent's analysis is largely sound — it correctly verifies the test mechanics, the timing math, and confirms that `enableProposerPipelining:false` is the runtime state. The actual review work (running the test, observing the rollback log lines, confirming the prover tx revert) is solid.

The diff itself is doc-only and the technical claims are correct:

- `CheckpointProposalJob.waitForValidParentCheckpointOnL1` exists at `yarn-project/sequencer-client/src/sequencer/checkpoint_proposal_job.ts:399` and is gated on `isPipelining` at line 244 — confirming pipelining-only behavior.
- The `parent-not-on-l1` discard reason is emitted at line 433 of the same file via `emitPipelinedCheckpointDiscarded`.
- The test really does use `cancelTxOnTimeout: false` and `maxSpeedUpAttempts: 0` for both setup and the explicitly-created prover node.
- The causal chain ("hold parent forever -> child discarded as `parent-not-on-l1` -> rollback-triggering tx never sent") is accurate for the first `it` block.

**However, the prior review's finding stands and was not addressed by either the diff or the agent's review:**

`PIPELINING.md` does not exist anywhere in the repo (`find` returns nothing). The "§7.3 / Pattern C" reference is dangling. The same dangling reference appears in `epochs_l1_reorgs.parallel.test.ts:72` (§7.5) and `epochs_missed_l1_slot.test.ts:36` (§7.4), and was already removed from the `epochs_first_slot.test.ts` sibling in commit `09279f8325`. This file should follow suit.

The "fundamentally incompatible" framing is defensible: the gate is unconditional when `isPipelining` is true, and there is no per-slot bypass — so within the current code, holding the parent tx forever genuinely will suppress the child propose tx. "Fundamentally" is slightly strong (a future bypass flag would change this), but it is accurate for the codebase as it stands today.

The other agent's analysis omitted this dangling-reference issue entirely, which is the one substantive nit on this otherwise-fine doc change.

**Suggested fix:**

```diff
     // `parent-not-on-l1`, which suppresses the very rollback-triggering tx the first `it` block
-    // asserts on. There is no per-slot pipelining bypass, so enabling pipelining is fundamentally
-    // incompatible with this test's design — see PIPELINING.md §7.3 / Pattern C.
+    // asserts on. There is no per-slot pipelining bypass, so enabling pipelining is fundamentally
+    // incompatible with this test's design.
```

(matching the resolution applied in commit `09279f8325` for the `epochs_first_slot.test.ts` sibling).
