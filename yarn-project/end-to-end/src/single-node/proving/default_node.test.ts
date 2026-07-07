import type { Logger } from '@aztec/aztec.js/log';
import type { AztecNode } from '@aztec/aztec.js/node';
import { RollupContract } from '@aztec/ethereum/contracts';
import { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';

import type { EndToEndContext } from '../../fixtures/utils.js';
import { SingleNodeTestContext, WORLD_STATE_CHECKPOINT_HISTORY, jest, setupWithProver } from './setup.js';

// Basic proving/node coverage that rides the context-default setup (fake prover node, single node,
// prod-seq, interval mining, ethSlot=8s/12s CI, aztecSlot=16s/24s, epoch=6, proofSubmissionEpochs=1).
// The former empty_blocks / world_state_pruning / node_block_api files each stood up their own such
// node for one or two assertions; they share one here. `world_state_pruning` runs first (it needs the
// default minTxsPerBlock:0 so empty checkpoints keep landing as it warps through epochs), then
// `empty_blocks` (which raises minTxsPerBlock to freeze its proof target), then the setup-agnostic
// `node_block_api` genesis-block query.
describe('single-node/proving/default_node', () => {
  let context: EndToEndContext;
  let rollup: RollupContract;
  let logger: Logger;

  let test: SingleNodeTestContext;

  beforeAll(async () => {
    test = await setupWithProver({});
    ({ context, rollup, logger } = test);
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await test.teardown();
  });

  // Verifies that multiple consecutive epochs are proven successfully and that world-state checkpoints
  // are pruned after finalization. TARGET_PROVEN_EPOCHS env var controls iteration count. Assumes one
  // block per checkpoint.
  describe('world_state_pruning', () => {
    // Loops through targetProvenEpochs epochs: waits for each epoch to end, asserts it is proven,
    // then verifies the epoch-end block is accessible as a historic block and that earlier blocks
    // beyond the checkpoint history window have been purged from world state.
    it('successfully proves multiple epochs', async () => {
      const targetProvenEpochs = process.env.TARGET_PROVEN_EPOCHS ? parseInt(process.env.TARGET_PROVEN_EPOCHS) : 3;
      let epochNumber = 0;
      logger.info(`Testing for ${targetProvenEpochs} epochs to be proven`);

      while (epochNumber < targetProvenEpochs) {
        logger.info(`Waiting for the end of epoch ${epochNumber}`);
        await test.warpToEpochStart(epochNumber + 1);
        const epochEndCheckpointNumber = (await test.monitor.run()).checkpointNumber;
        logger.info(`Epoch ${epochNumber} ended with pending checkpoint number ${epochEndCheckpointNumber}`);

        await test.waitUntilProvenCheckpointNumber(epochEndCheckpointNumber, 240);
        expect(await rollup.getProvenCheckpointNumber()).toBeGreaterThanOrEqual(epochEndCheckpointNumber);
        logger.info(`Reached proven checkpoint number ${epochEndCheckpointNumber}, epoch ${epochNumber} is now proven`);
        epochNumber++;

        // Verify the state syncs. Assumes one block per checkpoint.
        const epochEndBlockNumber = BlockNumber.fromCheckpointNumber(epochEndCheckpointNumber);
        await test.waitForNodeToSync(epochEndBlockNumber, 'proven');
        await test.verifyHistoricBlock(epochEndBlockNumber, true);

        // Check that finalized blocks are purged from world state.
        // Anvil is started with --slots-in-an-epoch 1, so 'finalized' = latest - 2. By the time
        // we reach this point the proof has been on L1 for many blocks, so the finalized L1 block
        // is past the proof submission block, making finalized checkpoint == proven checkpoint.
        // This test is setup as 1 block per checkpoint.
        const provenBlockNumber = epochEndBlockNumber;
        const finalizedBlockNumber = provenBlockNumber;
        const expectedOldestHistoricBlock = Math.max(finalizedBlockNumber - WORLD_STATE_CHECKPOINT_HISTORY + 1, 1);
        const expectedBlockRemoved = expectedOldestHistoricBlock - 1;
        await test.waitForNodeToSync(BlockNumber(expectedOldestHistoricBlock), 'historic');
        await test.verifyHistoricBlock(BlockNumber(expectedOldestHistoricBlock), true);
        if (expectedBlockRemoved > 0) {
          await test.verifyHistoricBlock(BlockNumber(expectedBlockRemoved), false);
        }
      }
      logger.info('Test Succeeded');
    });
  });

  // Starts a prover node (fake proofs) on the default setup and verifies the prover submits a proof for
  // a real non-genesis checkpoint with no txs. Runs after world_state_pruning on the shared chain, which
  // has already proven several empty checkpoints, so this reconfirms the property on the advanced chain.
  describe('empty_blocks', () => {
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

  // Exercises the node block-data query API against block 0 (the genesis block). Genesis block retrieval
  // is independent of setup timing/prover, so it rides the shared default node.
  describe('node_block_api', () => {
    // Fetches block 0 by number and by hash; asserts the returned blocks match and contain no txEffects.
    it('returns initial block data', async () => {
      const aztecNode: AztecNode = context.aztecNode;
      const initialHeader = (await aztecNode.getBlockData(BlockNumber.ZERO))?.header;
      expect(initialHeader).toBeDefined();
      const initialHeaderHash = await initialHeader!.hash();
      const initialBlockByHash = await aztecNode.getBlock(initialHeaderHash, { includeTransactions: true });
      expect(initialBlockByHash).toBeDefined();
      expect(initialBlockByHash!.hash.equals(initialHeaderHash)).toBe(true);
      expect(initialBlockByHash!.body.txEffects.length).toBe(0);
      const initialBlockByNumber = await aztecNode.getBlock(BlockNumber.ZERO, { includeTransactions: true });
      expect(initialBlockByNumber).toBeDefined();
      expect(initialBlockByNumber!.hash.equals(initialHeaderHash)).toBe(true);
      expect(initialBlockByNumber!.body.txEffects.length).toBe(0);
    });
  });
});
