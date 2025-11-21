import { BatchedBlob } from '@aztec/blob-lib';
import { AZTEC_MAX_EPOCH_DURATION } from '@aztec/constants';
import { asyncMap } from '@aztec/foundation/async-map';
import { padArrayEnd } from '@aztec/foundation/collection';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { Gas, GasFees } from '@aztec/stdlib/gas';
import { FeeRecipient } from '@aztec/stdlib/rollup';
import type { ServerCircuitName } from '@aztec/stdlib/stats';
import { MerkleTreeId } from '@aztec/stdlib/trees';
import type { GlobalVariables } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';

import { TestContext } from '../mocks/test_context.js';
import { getTreeSnapshot } from './block-building-helpers.js';

const logger = createLogger('prover-client:test:orchestrator-single-blocks');

describe('prover/orchestrator/rollup-structure', () => {
  let context: TestContext;
  let proverSpy: Record<ServerCircuitName, jest.SpiedFunction<(...args: any[]) => any>>;

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

  beforeEach(async () => {
    context = await TestContext.new(logger);

    proverSpy = {
      'parity-base': jest.spyOn(context.prover, 'getBaseParityProof'),
      'parity-root': jest.spyOn(context.prover, 'getRootParityProof'),
      'chonk-verifier-public': jest.spyOn(context.prover, 'getPublicChonkVerifierProof'),
      'avm-circuit': jest.spyOn(context.prover, 'getAvmProof'),
      'rollup-tx-base-public': jest.spyOn(context.prover, 'getPublicTxBaseRollupProof'),
      'rollup-tx-base-private': jest.spyOn(context.prover, 'getPrivateTxBaseRollupProof'),
      'rollup-tx-merge': jest.spyOn(context.prover, 'getTxMergeRollupProof'),
      'rollup-block-root-first': jest.spyOn(context.prover, 'getBlockRootFirstRollupProof'),
      'rollup-block-root-first-single-tx': jest.spyOn(context.prover, 'getBlockRootSingleTxFirstRollupProof'),
      'rollup-block-root-first-empty-tx': jest.spyOn(context.prover, 'getBlockRootEmptyTxFirstRollupProof'),
      'rollup-block-root': jest.spyOn(context.prover, 'getBlockRootRollupProof'),
      'rollup-block-root-single-tx': jest.spyOn(context.prover, 'getBlockRootSingleTxRollupProof'),
      'rollup-block-merge': jest.spyOn(context.prover, 'getBlockMergeRollupProof'),
      'rollup-checkpoint-root': jest.spyOn(context.prover, 'getCheckpointRootRollupProof'),
      'rollup-checkpoint-root-single-block': jest.spyOn(context.prover, 'getCheckpointRootSingleBlockRollupProof'),
      'rollup-checkpoint-padding': jest.spyOn(context.prover, 'getCheckpointPaddingRollupProof'),
      'rollup-checkpoint-merge': jest.spyOn(context.prover, 'getCheckpointMergeRollupProof'),
      'rollup-root': jest.spyOn(context.prover, 'getRootRollupProof'),
    };
  });

  afterEach(async () => {
    await context.cleanup();
  });

  describe('rollups the txs/blocks/checkpoints correctly to produce the expected public inputs', () => {
    it('wonky checkpoint tree', async () => {
      const numTxsPerBlockInCheckpoints = [
        [1, 5, 2], // Checkpoint 0 has 3 blocks, with 1, 5 and 2 txs respectively.
        [3], // Checkpoint 1 has 1 block with 3 txs.
        [0, 4, 6, 1], // Checkpoint 2 has 4 blocks, with 0, 4, 6, and 1 txs respectively.
      ];
      const numBlocksInCheckpoints = numTxsPerBlockInCheckpoints.map(c => c.length);
      const numCheckpoints = numTxsPerBlockInCheckpoints.length;
      const numL1ToL2Messages = 2;

      const epochStartArchive = await getTreeSnapshot(MerkleTreeId.ARCHIVE, await context.worldState.fork());

      const expectedFees: FeeRecipient[] = [];
      const checkpoints = await asyncMap(numBlocksInCheckpoints, async (numBlocks, checkpointIndex) => {
        const numTxsPerBlock = numTxsPerBlockInCheckpoints[checkpointIndex];
        const coinbase = mockCoinbase(checkpointIndex);
        const checkpoint = await context.makeCheckpoint(numBlocks, {
          numTxsPerBlock,
          numL1ToL2Messages,
          gasFees: mockCheckpointGasFees(checkpointIndex),
          coinbase,
          makeProcessedTxOpts: (blockGlobalVariables: GlobalVariables, txIndex: number) => ({
            gasUsed: mockTxGasUsed(txIndex, blockGlobalVariables.blockNumber),
            privateOnly: txIndex % 2 === 0,
          }),
        });

        // Accumulate the fees for the checkpoint, to be compared with the values from the root rollup's public inputs.
        const totalFee = checkpoint.blocks
          .map(b => b.txs)
          .flat()
          .reduce((acc, tx) => acc.add(tx.txEffect.transactionFee), Fr.ZERO);
        expect(totalFee).not.toEqual(Fr.ZERO);
        expectedFees.push(new FeeRecipient(coinbase, totalFee));

        return checkpoint;
      });

      const finalBlobChallenges = await context.getFinalBlobChallenges();
      context.orchestrator.startNewEpoch(1 /* epochNumber */, numCheckpoints, finalBlobChallenges);

      for (let checkpointIndex = 0; checkpointIndex < checkpoints.length; checkpointIndex++) {
        const { constants, blocks, l1ToL2Messages, previousBlockHeader } = checkpoints[checkpointIndex];

        await context.orchestrator.startNewCheckpoint(
          checkpointIndex,
          constants,
          l1ToL2Messages,
          blocks.length,
          previousBlockHeader,
        );

        for (const block of blocks) {
          const { blockNumber, timestamp } = block.header.globalVariables;
          await context.orchestrator.startNewBlock(blockNumber, timestamp, block.txs.length);
          await context.orchestrator.addTxs(block.txs);
          await context.orchestrator.setBlockCompleted(blockNumber, block.header);
        }
      }

      const result = await context.orchestrator.finalizeEpoch();

      expect(result.publicInputs.previousArchiveRoot).toEqual(epochStartArchive.root);

      const epochEndArchive = await getTreeSnapshot(MerkleTreeId.ARCHIVE, await context.worldState.fork());
      expect(result.publicInputs.endArchiveRoot).toEqual(epochEndArchive.root);

      const expectedCheckpointHeaderHashes = checkpoints.map(c => c.header.hash());
      expect(result.publicInputs.checkpointHeaderHashes).toEqual(
        padArrayEnd(expectedCheckpointHeaderHashes, Fr.ZERO, AZTEC_MAX_EPOCH_DURATION),
      );

      expect(result.publicInputs.fees).toEqual(
        padArrayEnd(expectedFees, FeeRecipient.empty(), AZTEC_MAX_EPOCH_DURATION),
      );

      const batchedBlob = await BatchedBlob.batch(context.getBlobFields());
      const expectedFinalBlobAccumulator = batchedBlob.toFinalBlobAccumulator();
      expect(result.publicInputs.blobPublicInputs).toEqual(expectedFinalBlobAccumulator);

      // Make sure all the circuits are called except for the checkpoint padding.
      for (const circuitName of Object.keys(proverSpy) as ServerCircuitName[]) {
        if (circuitName === 'rollup-checkpoint-padding') {
          expect(proverSpy[circuitName]).not.toHaveBeenCalled();
        } else {
          expect(proverSpy[circuitName]).toHaveBeenCalled();
        }
      }
    });

    it('builds a checkpoint with l1 to l2 messages but no txs', async () => {
      const numBlocks = 1;
      const numL1ToL2Messages = 5;

      const epochStartArchive = await getTreeSnapshot(MerkleTreeId.ARCHIVE, await context.worldState.fork());

      const {
        constants,
        header,
        blocks: [block],
        l1ToL2Messages,
        previousBlockHeader,
      } = await context.makeCheckpoint(numBlocks, {
        numTxsPerBlock: 0,
        numL1ToL2Messages,
      });

      const finalBlobChallenges = await context.getFinalBlobChallenges();
      context.orchestrator.startNewEpoch(1, 1, finalBlobChallenges);

      await context.orchestrator.startNewCheckpoint(
        0, // checkpointIndex
        constants,
        l1ToL2Messages,
        numBlocks,
        previousBlockHeader,
      );

      const { blockNumber, timestamp } = block.header.globalVariables;
      await context.orchestrator.startNewBlock(blockNumber, timestamp, block.txs.length);
      await context.orchestrator.setBlockCompleted(blockNumber, block.header);

      const result = await context.orchestrator.finalizeEpoch();

      expect(result.publicInputs.previousArchiveRoot).toEqual(epochStartArchive.root);

      const epochEndArchive = await getTreeSnapshot(MerkleTreeId.ARCHIVE, await context.worldState.fork());
      expect(result.publicInputs.endArchiveRoot).toEqual(epochEndArchive.root);

      expect(result.publicInputs.checkpointHeaderHashes).toEqual(
        padArrayEnd([header.hash()], Fr.ZERO, AZTEC_MAX_EPOCH_DURATION),
      );

      expect(result.publicInputs.fees).toEqual(Array.from({ length: AZTEC_MAX_EPOCH_DURATION }, FeeRecipient.empty));

      const batchedBlob = await BatchedBlob.batch(context.getBlobFields());
      const expectedFinalBlobAccumulator = batchedBlob.toFinalBlobAccumulator();
      expect(result.publicInputs.blobPublicInputs).toEqual(expectedFinalBlobAccumulator);

      const expectedProvenCircuits = [
        'parity-base',
        'parity-root',
        'rollup-block-root-first-empty-tx',
        'rollup-checkpoint-root-single-block',
        'rollup-checkpoint-padding',
        'rollup-root',
      ];
      for (const circuitName of Object.keys(proverSpy) as ServerCircuitName[]) {
        if (!expectedProvenCircuits.includes(circuitName)) {
          expect(proverSpy[circuitName]).not.toHaveBeenCalled();
        } else if (circuitName === 'parity-base') {
          // 1 proof with messages, 1 proof with empty messages.
          expect(proverSpy[circuitName]).toHaveBeenCalledTimes(2);
        } else {
          expect(proverSpy[circuitName]).toHaveBeenCalledTimes(1);
        }
      }
    });
  });
});
