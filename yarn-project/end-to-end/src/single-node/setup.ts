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
 * `'checkpointed'`) since these tests assert on freshly proposed, not-yet-checkpointed blocks. Both can be
 * overridden via `opts` / `opts.pxeOpts`.
 */
export function setupBlockProducer(opts: SingleNodeTestOpts = {}): Promise<SingleNodeTestContext> {
  return SingleNodeTestContext.setup({
    startProverNode: false,
    aztecProofSubmissionEpochs: 1024,
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
