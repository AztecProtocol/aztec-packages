import { BatchedBlob, Blob, FinalBlobAccumulator } from '@aztec/blob-lib';
import { AZTEC_MAX_EPOCH_DURATION } from '@aztec/constants';
import { asyncMap } from '@aztec/foundation/async-map';
import { padArrayEnd } from '@aztec/foundation/collection';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { Gas, GasFees } from '@aztec/stdlib/gas';
import { FeeRecipient } from '@aztec/stdlib/rollup';
import type { GlobalVariables } from '@aztec/stdlib/tx';

import { TestContext } from '../mocks/test_context.js';
import { buildFinalBlobChallenges } from './block-building-helpers.js';

const logger = createLogger('prover-client:test:orchestrator-single-blocks');

describe('prover/orchestrator/rollup-structure', () => {
  let context: TestContext;

  const mockCoinbase = (checkpointIndex: number) => {
    return EthAddress.fromNumber(checkpointIndex + 9876);
  };

  const mockCheckpointGasFees = (checkpointIndex: number) => {
    return new GasFees(checkpointIndex + 2, checkpointIndex + 3);
  };

  const mockTxGasUsed = (txIndex: number, blockNumber: number) => {
    return Gas.from({
      daGas: (txIndex + 1) * (blockNumber + 2),
      l2Gas: (txIndex + 3) * blockNumber,
    });
  };

  const makeGlobalVariablesOpts = (_: number, checkpointIndex: number) => {
    return { gasFees: mockCheckpointGasFees(checkpointIndex), coinbase: mockCoinbase(checkpointIndex) };
  };

  const makeProcessedTxOpts = (blockGlobalVariables: GlobalVariables, txIndex: number) => ({
    gasUsed: mockTxGasUsed(txIndex, blockGlobalVariables.blockNumber),
  });

  beforeEach(async () => {
    context = await TestContext.new(logger);
  });

  afterEach(async () => {
    await context.cleanup();
  });

  describe('rollups the txs/blocks/checkpoints correctly to produce the expected public inputs', () => {
    it('wonky checkpoint tree', async () => {
      const numTxsPerBlockInCheckpoints = [
        [2, 5, 1], // Checkpoint 0 has 3 blocks, with 2, 5 and 1 txs respectively.
        [3], // Checkpoint 1 has 1 block with 3 txs.
        [1, 3, 2, 4], // Checkpoint 2 has 4 blocks, with 1, 3, 2 and 4 txs respectively.
      ];
      const numBlocksInCheckpoints = numTxsPerBlockInCheckpoints.map(c => c.length);
      const numCheckpoints = numTxsPerBlockInCheckpoints.length;
      const numL1ToL2Messages = 2;

      let firstBlockNumber = 1;
      const expectedFees: FeeRecipient[] = [];
      const checkpoints = await asyncMap(numBlocksInCheckpoints, async (numBlocks, checkpointIndex) => {
        const numTxsPerBlock = numTxsPerBlockInCheckpoints[checkpointIndex];
        const checkpoint = await context.makePendingBlocksInCheckpoint(numBlocks, {
          checkpointIndex,
          numTxsPerBlock,
          firstBlockNumber,
          numL1ToL2Messages,
          makeGlobalVariablesOpts,
          makeProcessedTxOpts,
        });

        // Accumulate the fees for the checkpoint, to be compared with the values from the root rollup's public inputs.
        const totalFee = checkpoint.blocks
          .map(b => b.txs)
          .flat()
          .reduce((acc, tx) => acc.add(tx.avmProvingRequest!.inputs.publicInputs.transactionFee), Fr.ZERO);
        expect(totalFee).not.toEqual(Fr.ZERO);
        expectedFees.push(new FeeRecipient(mockCoinbase(checkpointIndex), totalFee));

        firstBlockNumber += numBlocks;

        return checkpoint;
      });

      const finalBlobChallenges = await buildFinalBlobChallenges(checkpoints.map(c => c.blobFields));
      context.orchestrator.startNewEpoch(1 /* epochNumber */, numCheckpoints, finalBlobChallenges);

      for (let checkpointIndex = 0; checkpointIndex < checkpoints.length; checkpointIndex++) {
        const { blocks, blobFields, l1ToL2Messages } = checkpoints[checkpointIndex];
        const numBlocks = blocks.length;
        const firstBlockNumberInCheckpoint = blocks[0].header.globalVariables.blockNumber;
        const headerOfLastBlockInPreviousCheckpoint = context.getPreviousBlockHeader(firstBlockNumberInCheckpoint);

        await context.orchestrator.startNewCheckpoint(
          checkpointIndex,
          context.getCheckpointConstants(checkpointIndex),
          l1ToL2Messages,
          numBlocks,
          blobFields.length,
          headerOfLastBlockInPreviousCheckpoint,
        );

        for (const block of blocks) {
          const { blockNumber, timestamp } = block.header.globalVariables;
          await context.orchestrator.startNewBlock(blockNumber, timestamp, block.txs.length);
          await context.orchestrator.addTxs(block.txs);
          await context.orchestrator.setBlockCompleted(blockNumber);
        }
      }

      const result = await context.orchestrator.finalizeEpoch();
      expect(result.publicInputs.fees).toEqual(
        padArrayEnd(expectedFees, FeeRecipient.empty(), AZTEC_MAX_EPOCH_DURATION),
      );

      const blobs = await Promise.all(checkpoints.map(c => Blob.getBlobsPerBlock(c.blobFields)));
      const batchedBlob = await BatchedBlob.batch(blobs.flat());
      const expectedFinalBlobAccumulator = FinalBlobAccumulator.fromBatchedBlob(batchedBlob);
      expect(result.publicInputs.blobPublicInputs).toEqual(expectedFinalBlobAccumulator);
    });
  });
});
