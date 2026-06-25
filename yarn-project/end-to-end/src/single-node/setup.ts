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
