import { SingleNodeTestContext, type SingleNodeTestOpts } from './single_node_test_context.js';

/**
 * The single-node setup surface, organized over the prover axis (none / fake / real). Each factory is a
 * thin wrapper over {@link SingleNodeTestContext.setup} that fixes the prover mode and the defaults that go
 * with it; tests pick the factory matching their topology and vary it through `opts`.
 */

/**
 * Proof-submission window (in epochs) so large the chain never prunes/reorgs in the test's lifetime.
 * Tests that must keep unproven blocks alive for their whole run (no prover, or a hand-driven settler)
 * set `aztecProofSubmissionEpochs` to this rather than picking an arbitrary large number.
 */
export const NO_REORG_SUBMISSION_EPOCHS = 1024;

/**
 * The "12s floor" slot cadence: a 4s L1 slot with 3 L1 slots per L2 slot, i.e. a 12s L2 slot. Shared by
 * the proving / partial-proof suites whose bodies wait in real wall-clock for the sequencer to build
 * empty checkpoints (one per L2 slot) and so cannot warp the clock forward. 12s is the shortest L2 slot
 * that still fits one block per checkpoint under the default 3s block-duration timing model (which needs
 * S >= ~8.5s); an 8s slot derives 0 blocks per checkpoint and trips the timing-config guard. Running at
 * this floor keeps those real-time waits as short as possible.
 */
export const PROVING_SLOT_TIMING = {
  ethereumSlotDuration: 4,
  aztecSlotDurationInL1Slots: 3,
} as const;

/**
 * Single sequencer plus the context's fake in-process prover node (`realProofs: false`,
 * `aztecProofSubmissionEpochs: 1`, `syncChainTip: 'checkpointed'`). This is exactly today's
 * {@link SingleNodeTestContext.setup} default, used by the proving/partial-proofs/reorg/recovery suites.
 */
export function setupWithProver(opts: SingleNodeTestOpts = {}): Promise<SingleNodeTestContext> {
  return SingleNodeTestContext.setup(opts);
}

/**
 * Single production sequencer with **no prover node**, used by the block-building/sequencer/sync suites.
 *
 * Dropping the prover requires raising `aztecProofSubmissionEpochs` to a high value
 * ({@link NO_REORG_SUBMISSION_EPOCHS}): with the context's default window of `1` and no prover producing
 * proofs, unproven blocks get pruned out from under the test after an epoch — so the high window keeps the
 * blocks alive. Also defaults the PXE to `syncChainTip: 'proposed'` (rather than the context's
 * `'checkpointed'`) since these tests assert on freshly proposed, not-yet-checkpointed blocks.
 *
 * Defaults `aztecEpochDuration` to `32` (the production default). These tests were written against the raw
 * `setup()` helper, which deployed with the 32-slot production epoch; the context's own default of `6`
 * lands an epoch boundary mid-test, where proposer selection changes and the propose for the boundary slot
 * silently reverts (no checkpoint lands, the chain stops advancing). The 32-slot epoch keeps the boundary
 * out past the short runs these tests need. All three (`startProverNode`, the proof window, the epoch) and
 * `pxeOpts` can be overridden via `opts` — tests that need a shorter epoch (e.g. governance signalling) set
 * their own.
 */
export function setupBlockProducer(opts: SingleNodeTestOpts = {}): Promise<SingleNodeTestContext> {
  return SingleNodeTestContext.setup({
    startProverNode: false,
    aztecProofSubmissionEpochs: NO_REORG_SUBMISSION_EPOCHS,
    aztecEpochDuration: 32,
    ...opts,
    pxeOpts: { syncChainTip: 'proposed', ...opts.pxeOpts },
  });
}
