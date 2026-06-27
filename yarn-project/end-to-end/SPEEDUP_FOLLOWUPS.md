# e2e speed-up — follow-up opportunities (NOT done on `spl/e2e-speed-up-1`)

The `spl/e2e-speed-up-1` branch sped up the ~20% slowest e2e test files by editing **only the test
files**. The opportunities below were surfaced while doing that work but were left out because they
touch **shared test fixtures** or **production code** (and concurrent agents couldn't safely edit
shared files). They are grouped by risk/scope so a follow-up PR can pick them up.

Recurring theme: a handful of shared wait-helpers do pure wall-clock waiting. Several test files now
carry a near-identical local `warpToEpochStart` / `warpToProofSubmissionEpoch` / `warpNearSubmissionWindowEnd`
copy. Folding the warp into the shared helper removes the duplication **and** speeds up every other
caller for free — these are the highest-leverage items.

## A. Shared test-fixture changes (low risk, high value — recommended first)

1. **Warp inside `SingleNodeTestContext.waitUntilEpochStarts(epoch)`** (`single-node/single_node_test_context.ts`)
   — make the slow wall-clock variant warp the L1 clock to ~2 slots before the boundary
   (`resetBlockInterval:true`), exactly as `waitUntilNextEpochStarts` already does. Lets the proving/MBPS
   tests that now carry a local `warpToEpochStart` (optimistic, proof_fails, world_state_pruning,
   cross_chain_public_message) drop their copies. Benefits every "wait for epoch to end" caller.

2. **Warp inside multi-node `waitForProvenCheckpoint`** (`multi-node/block-production/setup.ts`) — it
   already stops the sequencers; warp the L1 clock to one block before `checkpointEpoch +
   proofSubmissionEpochs`'s start before the proven wait. proposed_chain, deploy_and_call_ordering, and
   blob_promotion now hand-roll an identical `warpToProofSubmissionEpoch`; this removes all three.

3. **Warp inside `waitUntilLastSlotOfProofSubmissionWindow`** (`single-node/l1-reorgs/setup.ts`) — warp
   the L1 clock to ~2 slots before its target (headroom-guarded). blocks.parallel and
   prune_when_cannot_build now copy a local `warpNearSubmissionWindowEnd`; this removes both.

4. **`ChainMonitor.waitUntilL2Slot(slot, { warpLeadSlots })`** (`ethereum/src/test/chain_monitor.ts`) —
   add an optional warp-to-`slot - warpLeadSlots` so multi-node tests skip dead slots without hand-rolling.

5. **inactivity slot duration** (`multi-node/slashing/inactivity_setup.ts:17`) — change
   `ETHEREUM_SLOT_DURATION = process.env.CI ? 8 : 4` → `4` (AZTEC_SLOT_DURATION derives ×2). Halves the
   body of BOTH `inactivity_slash` (~206s) and `inactivity_slash_with_consecutive_epochs` (both BAILED
   here because the only lever is in this shared file). Safe: `aztecProofSubmissionEpochs:1024` disables
   proving deadlines, assertions are slot-count/sentinel-only. Verify the consecutive-epochs sibling
   still slashes only the permanently-offline validator.

6. **No-token cross-chain setup variant** (`CrossChainMessagingTest.applyBaseSetup` /
   `CrossChainTestHarness.new`) — these deploy a full L1 token + portal + L2 token + bridge (~57s) that
   arbitrary-L1↔L2-message tests (l1_to_l2, l2_to_l1) never use; they only need `ethAccount` + inbox/
   rollup addresses. A no-token variant cuts ~57s off every job in those files.

7. **Lower `PIPELINING_SETUP_OPTS` slot duration** (`fixtures/fixtures.ts:44`, `aztecSlotDuration:12,
   blockDurationMs:3000`) → `8 / 1500` (still 2 blocks/slot). Speeds the whole block-building/sequencer/
   sync family at once. Caveat: below S≈2.5+2D the rollup throws "Invalid timing configuration"; audit
   every `setConfig` "reset to default" when changing the base (block_building hit this).

## B. Production-code changes

8. **`Sequencer.start()` is not idempotent** (`sequencer-client/src/sequencer/sequencer.ts:277`) — a
   second `start()` silently replaces a live `runningPromise`, leaking the previous poll loop. Forced a
   `stop()` between merged scenarios in invalidate_block.parallel. Make it idempotent.

9. **`PublisherManager.FUNDING_CHECK_INTERVAL_MS`** is a hardcoded 120s private const with no config
   override. Plumbing a `publisherFundingCheckIntervalMs` through `PublisherManagerConfig` would let
   tests set a short interval instead of reaching into the private `fundingPromise` (publisher_funding_multi).

10. **Bot tests need an instant-automine setup variant** (bot BAILED — no test-only lever). `bot.test.ts`
    (~638s) runs on real interval mining with zero warpable idle time. A bot-test setup on instant
    automine + explicit block advancement is the only material lever. Also `bot/src/factory.ts setup()`
    always deploys+mints a token even in bridge-only modes (~24-47s of avoidable work). Note:
    `followChain: CHECKPOINTED` is a deliberate anti-flake choice (`local-network.ts:46`) — don't flip
    balance-asserting bots to PROPOSED.

## C. Test-file sweeps in the same vein (no shared/prod change needed)

11. **automine for the other fee tests** — account_init swapped `PIPELINING_SETUP_OPTS` →
    `AUTOMINE_E2E_OPTS` for a large win. `sponsored_payments`, `public_payments`, `gas_estimation`,
    `fee_juice_payments` likely qualify if a per-file audit confirms no prover-fee/coinbase/proven-chain
    assertions (`private_payments` & `failures` do NOT — they call getProverFee/getBlockRewards/
    catchUpProvenChain). Each is its own CI job, so the speedup compounds.

12. **Reduce checkpoint/reorg-depth counts** where a regression only needs a shallower reorg
    (sync_after_reorg 5→3 checkpoints ≈ -48s) — needs a maintainer to confirm the original bug still
    reproduces.

13. **`MultiNodeTestContext.findSlotsWithProposers`** already exists (multi_node_test_context.ts:352,
    with a `// REFACTOR:` TODO at :568); invalidate_block.parallel still hand-rolls the EpochNotStable
    slot search. Migrating reduces flake surface (no time impact).

## D. Optimizations reverted/weakened to get CI green

These were undone or weakened on `spl/e2e-speed-up-1` because they failed CI and the proper fix lives
in shared/prod code (out of scope for this test-only branch). A follow-up PR should revisit each.

14. **`proposed_chain.parallel`, `deploy_and_call_ordering`, `cross_chain_messages.parallel` (L2→L1 it),
    `blob_promotion`** — the local `warpToProofSubmissionEpoch` / `warpPastEpochTailAndWaitForProven`
    warp was **reverted** in all four (blob_promotion keeps only its safe `PIPELINE_TX_COUNT` 34→24
    trim). Symptom: `block-build-failed: "Sequencer was interrupted"` recorded into `failEvents`, then
    `waitForProvenCheckpoint → assertNoFailuresFromSequencers(failEvents)` rejected it. Root cause: the
    helper stops the sequencers to warp safely, but `waitForProvenCheckpoint` runs
    `assertNoFailuresFromSequencers` **before** it stops them, so the warp's own interrupt event is seen
    as a failure. Proper fix: item A.2 — fold the warp into the shared `waitForProvenCheckpoint`
    (`multi-node/block-production/setup.ts`) so the assert runs against the pre-stop event set, or have
    the assert ignore `SequencerInterruptedError` block-build failures.

15. **`invalidate_block.parallel`** — **fully reverted** (both the eth=8/aztec=36/block=6000 →
    eth=4/aztec=24/block=4000 timing cut and the merge of three single-attack invalidation `it`s into one
    sequential loop). Symptom: `TimeoutError: Waiting for CheckpointInvalidated event` on the 2nd/3rd
    merged scenario, with `SequencerInterruptedError` from the inter-scenario `stop()`. Root cause: the
    merged loop re-runs `runInvalidationTest` against a chain left mid-flight by the previous scenario,
    and `Sequencer.start()` is not idempotent (item B.8), so the next scenario's runner leaks the prior
    poll loop and never observes its invalidation. Proper fix: item B.8 (idempotent `start()`), after
    which the merge + timing cut can be re-applied.

16. **`gov_proposal.parallel`** (both its) — **fully reverted** to baseline (eth=8/aztec=16 +
    `TestContract.deploy`), dropping both the slot cut and the `registerTestContract` swap. Two failure
    modes were hit in succession: first `Invalid timing configuration: derived 0 blocks per checkpoint for
    slot duration 8s` (the eth=4/aztec=8 attempt), then — after raising to eth=4/aztec=12 to clear the
    timing guard — `Block hash … not found when querying world state … possibly a reorg has occurred`,
    preceded by `Submitting fallback requests despite sync failure` and `SequencerInterruptedError`. Root
    cause of the reorg: this is real production-sequencer block-building, and dropping to eth=4 (the only
    way to reach a sub-16s L2 slot, since eth=8 forces aztec ∈ {16,24,…}) flips the node onto the
    fast-profile budgets, which destabilizes its sync under the `advanceToEpoch(4)` warps. Not safely
    tunable from the test file. Proper fix: needs a shared-fixture/prod change to keep the node sync stable
    on the fast profile (or a fast-profile-safe `advanceToEpoch`); revisit alongside item A.* when the
    shared block-production setup is touched.

17. **`add_rollup`** — the `aztecSlotDuration: 8` override of `GOVERNANCE_TIMING` (12s) was **removed**
    (kept the retryUntil quorum-poll refactor). Same `Invalid timing configuration` root cause as item 16;
    `GOVERNANCE_TIMING`'s 12s is the floor with the default 3s block duration. Same proper fix (cut
    `blockDurationMs` if 8s is wanted).

18. **`long_proving_time`** — slot cut **weakened** from `aztecSlotDurationInL1Slots: 2` (eth=4 → L2=8s,
    ~3× speedup) to `3` (L2=12s, ~2× speedup). Same `Invalid timing configuration` root cause as item 16;
    8s derives 0 blocks per checkpoint. proverTestDelayMs is slot-derived so the delay-to-slot ratio
    (and the "lags by ~3 epochs" assertion) stays intact at 12s. Same proper fix to reach 8s (cut
    `blockDurationMs`).

19. **`proof_fails.parallel` ("does not allow submitting proof after epoch end" it)** — the first
    `warpToEpochStart(1, 2)` (warp over the epoch-0 advance) was **reverted** to a real-time
    `waitUntilEpochStarts(1)`; the epoch-1→2 warp is kept. Symptom: `expect(checkpointBeforeRollback)
    .toBeGreaterThan(1)` got 1. Root cause: warping to ~2 slots before the epoch-1 boundary skips the
    epoch-0 slots the sequencer needs to build a 2nd checkpoint, leaving only checkpoint 1. Proper fix:
    item A.1 — a shared `waitUntilEpochStarts` warp that lands far enough before the boundary to leave
    the in-epoch checkpoint builds intact (or capture the checkpoint count differently).

Also **tuned, not reverted** (kept the optimization, adjusted the warp lead): `proof_boundary.parallel`
(all 3 its) — the shared `waitPastBoundary` warp target was moved from the slot N-1 build window to the
start of slot N-3, giving the real-time tail room for the natural proof to land before slot N-1, for the
sequencer to propose the parent (`hadProposedParent`), and for the boundary build/publish/prune. This is
the prompt's "increase the warp lead" tune and stays within the test file.
