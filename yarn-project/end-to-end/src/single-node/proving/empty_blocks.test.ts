import type { Logger } from '@aztec/aztec.js/log';
import { RollupContract } from '@aztec/ethereum/contracts';
import { CheckpointNumber } from '@aztec/foundation/branded-types';

import type { EndToEndContext } from '../../fixtures/utils.js';
import { SingleNodeTestContext, jest, setupWithProver } from './setup.js';

// Starts a prover node (fake proofs) on the default setup and verifies the prover submits a proof for
// a real non-genesis checkpoint with no txs.
describe('single-node/proving/empty_blocks', () => {
  let context: EndToEndContext;
  let rollup: RollupContract;
  let logger: Logger;

  let test: SingleNodeTestContext;

  beforeEach(async () => {
    test = await setupWithProver({});
    ({ context, rollup, logger } = test);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await test.teardown();
  });

  // Waits for a real empty checkpoint, raises minTxsPerBlock to 1 to stop more empty checkpoints
  // from being built, then waits for the prover to submit a proof covering that target.
  it('submits proof even if there are no txs to build a block', async () => {
    // Let the sequencer build its first empty checkpoint (at the setup default minTxsPerBlock:0)
    // before raising the floor. Raising minTxsPerBlock first races the sequencer's first proposal
    // loop: if the config lands before block 1 is built, the sequencer waits forever for a tx that
    // never arrives, no non-genesis checkpoint is built, and there is nothing to prove.
    const proofTargetCheckpoint = CheckpointNumber(1);
    await test.waitUntilCheckpointNumber(proofTargetCheckpoint);
    context.sequencer?.updateConfig({ minTxsPerBlock: 1 });

    await test.waitUntilProvenCheckpointNumber(proofTargetCheckpoint, 240);
    expect(await rollup.getProvenCheckpointNumber()).toBeGreaterThanOrEqual(proofTargetCheckpoint);
    logger.info(`Test succeeded`);
  });
});
