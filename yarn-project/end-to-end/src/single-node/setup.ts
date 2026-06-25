import { SingleNodeTestContext, type SingleNodeTestOpts } from './single_node_test_context.js';

/**
 * The single-node setup surface, organized over the prover axis (none / fake / real). Each factory is a
 * thin wrapper over {@link SingleNodeTestContext.setup} that fixes the prover mode and the defaults that go
 * with it; tests pick the factory matching their topology and vary it through `opts`.
 */

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
 * Dropping the prover requires raising `aztecProofSubmissionEpochs` to a high value (`1024`, the
 * "effectively never reorg" preset): with the context's default window of `1` and no prover producing
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
    aztecProofSubmissionEpochs: 1024,
    aztecEpochDuration: 32,
    ...opts,
    pxeOpts: { syncChainTip: 'proposed', ...opts.pxeOpts },
  });
}

/**
 * Single sequencer plus a **real** Barretenberg prover node (`realProofs: true`, `startProverNode: true`),
 * used by the `prover/` suite. Carries the fake-prover defaults otherwise (`aztecProofSubmissionEpochs: 1`,
 * `syncChainTip: 'checkpointed'`) but generates real proofs instead of fake ones. Overridable via `opts`.
 */
export function setupWithRealProver(opts: SingleNodeTestOpts = {}): Promise<SingleNodeTestContext> {
  return SingleNodeTestContext.setup({
    realProofs: true,
    startProverNode: true,
    ...opts,
  });
}
