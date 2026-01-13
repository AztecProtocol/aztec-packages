import {
  INITIAL_CHECKPOINT_NUMBER,
  INITIAL_L2_BLOCK_NUM,
  MAX_NOTE_HASHES_PER_TX,
  NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
  PRIVATE_LOG_SIZE_IN_FIELDS,
} from '@aztec/constants';
import { makeTuple } from '@aztec/foundation/array';
import { BlockNumber, CheckpointNumber, EpochNumber } from '@aztec/foundation/branded-types';
import { Buffer16, Buffer32 } from '@aztec/foundation/buffer';
import { times, timesParallel } from '@aztec/foundation/collection';
import { randomInt } from '@aztec/foundation/crypto/random';
import { Fr } from '@aztec/foundation/curves/bn254';
import { toArray } from '@aztec/foundation/iterable';
import { sleep } from '@aztec/foundation/sleep';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  CheckpointedL2Block,
  CommitteeAttestation,
  EthAddress,
  L2BlockHash,
  L2BlockNew,
  type ValidateCheckpointResult,
} from '@aztec/stdlib/block';
import { Checkpoint, L1PublishedData, PublishedCheckpoint, randomCheckpointInfo } from '@aztec/stdlib/checkpoint';
import {
  type ContractClassPublic,
  type ContractInstanceWithAddress,
  SerializableContractInstance,
  computePublicBytecodeCommitment,
} from '@aztec/stdlib/contract';
import { ContractClassLog, LogId, PrivateLog, PublicLog, SiloedTag, Tag } from '@aztec/stdlib/logs';
import { InboxLeaf } from '@aztec/stdlib/messaging';
import { CheckpointHeader } from '@aztec/stdlib/rollup';
import {
  makeContractClassPublic,
  makeExecutablePrivateFunctionWithMembershipProof,
  makeUtilityFunctionWithMembershipProof,
} from '@aztec/stdlib/testing';
import '@aztec/stdlib/testing/jest';
import { AppendOnlyTreeSnapshot } from '@aztec/stdlib/trees';
import { type IndexedTxEffect, PartialStateReference, StateReference, TxEffect, TxHash } from '@aztec/stdlib/tx';

import { makeInboxMessage, makeInboxMessages } from '../test/mock_structs.js';
import type { ArchiverDataStore, ArchiverL1SynchPoint } from './archiver_store.js';
import {
  BlockArchiveNotConsistentError,
  BlockIndexNotSequentialError,
  BlockNumberNotSequentialError,
  CheckpointNumberNotConsistentError,
  CheckpointNumberNotSequentialError,
  InitialBlockNumberNotSequentialError,
  InitialCheckpointNumberNotSequentialError,
} from './errors.js';
import { MessageStoreError } from './kv_archiver_store/message_store.js';
import type { InboxMessage } from './structs/inbox_message.js';

/**
 * @param testName - The name of the test suite.
 * @param getStore - Returns an instance of a store that's already been initialized.
 */
export function describeArchiverDataStore(
  testName: string,
  getStore: () => ArchiverDataStore | Promise<ArchiverDataStore>,
) {
  describe(testName, () => {
    let store: ArchiverDataStore;
    let publishedCheckpoints: PublishedCheckpoint[];

    const blockNumberTests: [number, () => L2BlockNew][] = [
      [1, () => publishedCheckpoints[0].checkpoint.blocks[0]],
      [10, () => publishedCheckpoints[9].checkpoint.blocks[0]],
      [5, () => publishedCheckpoints[4].checkpoint.blocks[0]],
    ];

    const makeBlockHash = (blockNumber: number) => `0x${blockNumber.toString(16).padStart(64, '0')}`;

    // Create a state reference with properly calculated noteHashTree.nextAvailableLeafIndex
    // This is needed because the log store calculates dataStartIndexForBlock as:
    //   noteHashTree.nextAvailableLeafIndex - txEffects.length * MAX_NOTE_HASHES_PER_TX
    // If nextAvailableLeafIndex is too small (random values 0-1000), this becomes negative
    const makeStateForBlock = (blockNumber: number, txsPerBlock: number): StateReference => {
      // Ensure nextAvailableLeafIndex is large enough for all blocks up to this point
      const noteHashIndex = blockNumber * txsPerBlock * MAX_NOTE_HASHES_PER_TX;
      return new StateReference(
        AppendOnlyTreeSnapshot.random(),
        new PartialStateReference(
          new AppendOnlyTreeSnapshot(Fr.random(), noteHashIndex),
          AppendOnlyTreeSnapshot.random(),
          AppendOnlyTreeSnapshot.random(),
        ),
      );
    };

    const makePublishedCheckpoint = (checkpoint: Checkpoint, l1BlockNumber: number): PublishedCheckpoint => {
      return new PublishedCheckpoint(
        checkpoint,
        new L1PublishedData(BigInt(l1BlockNumber), BigInt(l1BlockNumber * 1000), makeBlockHash(l1BlockNumber)),
        times(3, CommitteeAttestation.random),
      );
    };

    const expectCheckpointedBlockEquals = (
      actual: CheckpointedL2Block,
      expectedBlock: L2BlockNew,
      expectedCheckpoint: PublishedCheckpoint,
    ) => {
      expect(actual.l1).toEqual(expectedCheckpoint.l1);
      expect(actual.block.header.equals(expectedBlock.header)).toBe(true);
      expect(actual.checkpointNumber).toEqual(expectedCheckpoint.checkpoint.number);
      expect(actual.attestations.every((a, i) => a.equals(expectedCheckpoint.attestations[i]))).toBe(true);
    };

    beforeEach(async () => {
      store = await getStore();
      // Create checkpoints sequentially to ensure archive roots are chained properly.
      // Each block's header.lastArchive must equal the previous block's archive.
      publishedCheckpoints = [];
      const txsPerBlock = 4;
      for (let i = 0; i < 10; i++) {
        const blockNumber = i + 1;
        const previousArchive = i > 0 ? publishedCheckpoints[i - 1].checkpoint.blocks[0].archive : undefined;
        const checkpoint = await Checkpoint.random(CheckpointNumber(i + 1), {
          numBlocks: 1,
          startBlockNumber: blockNumber,
          previousArchive,
          txsPerBlock,
          state: makeStateForBlock(blockNumber, txsPerBlock),
          // Ensure each tx has public logs for getPublicLogs tests
          txOptions: { numPublicCallsPerTx: 2, numPublicLogsPerCall: 2 },
        });
        publishedCheckpoints.push(makePublishedCheckpoint(checkpoint, i + 10));
      }
    });

    describe('addCheckpoints', () => {
      it('returns success when adding checkpoints', async () => {
        await expect(store.addCheckpoints(publishedCheckpoints)).resolves.toBe(true);
      });

      it('throws on duplicate checkpoints', async () => {
        await store.addCheckpoints(publishedCheckpoints);
        await expect(store.addCheckpoints(publishedCheckpoints)).rejects.toThrow(
          InitialCheckpointNumberNotSequentialError,
        );
      });

      it('throws an error if the previous block does not exist in the store', async () => {
        const checkpoint = await Checkpoint.random(CheckpointNumber(2), { numBlocks: 1, startBlockNumber: 2 });
        const block = makePublishedCheckpoint(checkpoint, 2);
        await expect(store.addCheckpoints([block])).rejects.toThrow(InitialCheckpointNumberNotSequentialError);
        await expect(store.getCheckpointedBlock(1)).resolves.toBeUndefined();
      });

      it('throws an error if there is a gap in the blocks being added', async () => {
        const checkpoint1 = await Checkpoint.random(CheckpointNumber(1), { numBlocks: 1, startBlockNumber: 1 });
        const checkpoint3 = await Checkpoint.random(CheckpointNumber(3), { numBlocks: 1, startBlockNumber: 3 });
        const checkpoints = [makePublishedCheckpoint(checkpoint1, 1), makePublishedCheckpoint(checkpoint3, 3)];
        await expect(store.addCheckpoints(checkpoints)).rejects.toThrow(CheckpointNumberNotSequentialError);
        await expect(store.getCheckpointedBlock(1)).resolves.toBeUndefined();
      });

      it('throws an error if blocks within a checkpoint are not sequential', async () => {
        // Create a checkpoint with non-sequential block numbers (block 1 and block 3, skipping block 2)
        const block1 = await L2BlockNew.random(BlockNumber(1), { checkpointNumber: CheckpointNumber(1) });
        const block3 = await L2BlockNew.random(BlockNumber(3), { checkpointNumber: CheckpointNumber(1) });

        const checkpoint = new Checkpoint(
          AppendOnlyTreeSnapshot.random(),
          CheckpointHeader.random(),
          [block1, block3],
          CheckpointNumber(1),
        );
        const publishedCheckpoint = makePublishedCheckpoint(checkpoint, 10);

        await expect(store.addCheckpoints([publishedCheckpoint])).rejects.toThrow(BlockNumberNotSequentialError);
        await expect(store.getCheckpointedBlock(1)).resolves.toBeUndefined();
      });

      it('throws an error if blocks within a checkpoint do not have sequential indexes', async () => {
        // Create a checkpoint with non-sequential indexes
        const block1 = await L2BlockNew.random(BlockNumber(1), {
          checkpointNumber: CheckpointNumber(1),
          indexWithinCheckpoint: 0,
        });
        const block3 = await L2BlockNew.random(BlockNumber(2), {
          checkpointNumber: CheckpointNumber(1),
          indexWithinCheckpoint: 2,
        });

        const checkpoint = new Checkpoint(
          AppendOnlyTreeSnapshot.random(),
          CheckpointHeader.random(),
          [block1, block3],
          CheckpointNumber(1),
        );
        const publishedCheckpoint = makePublishedCheckpoint(checkpoint, 10);

        await expect(store.addCheckpoints([publishedCheckpoint])).rejects.toThrow(BlockIndexNotSequentialError);
        await expect(store.getCheckpointedBlock(1)).resolves.toBeUndefined();
      });

      it('throws an error if blocks within a checkpoint do not start from index 0', async () => {
        // Create a checkpoint with non-sequential indexes
        const block1 = await L2BlockNew.random(BlockNumber(1), {
          checkpointNumber: CheckpointNumber(1),
          indexWithinCheckpoint: 1,
        });
        const block3 = await L2BlockNew.random(BlockNumber(2), {
          checkpointNumber: CheckpointNumber(1),
          indexWithinCheckpoint: 2,
        });

        const checkpoint = new Checkpoint(
          AppendOnlyTreeSnapshot.random(),
          CheckpointHeader.random(),
          [block1, block3],
          CheckpointNumber(1),
        );
        const publishedCheckpoint = makePublishedCheckpoint(checkpoint, 10);

        await expect(store.addCheckpoints([publishedCheckpoint])).rejects.toThrow(BlockIndexNotSequentialError);
        await expect(store.getCheckpointedBlock(1)).resolves.toBeUndefined();
      });

      it('throws an error if block has invalid checkpoint index', async () => {
        // Create a block wit an invalid checkpoint index
        const block1 = await L2BlockNew.random(BlockNumber(1), {
          checkpointNumber: CheckpointNumber(1),
          indexWithinCheckpoint: -1,
        });

        const checkpoint = new Checkpoint(
          AppendOnlyTreeSnapshot.random(),
          CheckpointHeader.random(),
          [block1],
          CheckpointNumber(1),
        );
        const publishedCheckpoint = makePublishedCheckpoint(checkpoint, 10);

        await expect(store.addCheckpoints([publishedCheckpoint])).rejects.toThrow(BlockIndexNotSequentialError);
        await expect(store.getCheckpointedBlock(1)).resolves.toBeUndefined();
      });

      it('throws an error if checkpoint has invalid initial number', async () => {
        const block1 = await L2BlockNew.random(BlockNumber(1), {
          checkpointNumber: CheckpointNumber(2),
          indexWithinCheckpoint: 0,
        });

        const checkpoint = new Checkpoint(
          AppendOnlyTreeSnapshot.random(),
          CheckpointHeader.random(),
          [block1],
          CheckpointNumber(2),
        );
        const publishedCheckpoint = makePublishedCheckpoint(checkpoint, 10);

        await expect(store.addCheckpoints([publishedCheckpoint])).rejects.toThrow(
          InitialCheckpointNumberNotSequentialError,
        );
      });

      it('allows the correct initial checkpoint', async () => {
        const block1 = await L2BlockNew.random(BlockNumber(1), {
          checkpointNumber: CheckpointNumber(1),
          indexWithinCheckpoint: 0,
        });

        const checkpoint = new Checkpoint(
          AppendOnlyTreeSnapshot.random(),
          CheckpointHeader.random(),
          [block1],
          CheckpointNumber(1),
        );
        const publishedCheckpoint = makePublishedCheckpoint(checkpoint, 10);

        await expect(store.addCheckpoints([publishedCheckpoint])).resolves.toBe(true);
      });

      it('throws on duplicate initial checkpoint', async () => {
        const block1 = await L2BlockNew.random(BlockNumber(1), {
          checkpointNumber: CheckpointNumber(1),
          indexWithinCheckpoint: 0,
        });

        const block2 = await L2BlockNew.random(BlockNumber(1), {
          checkpointNumber: CheckpointNumber(1),
          indexWithinCheckpoint: 0,
        });

        const checkpoint = new Checkpoint(
          AppendOnlyTreeSnapshot.random(),
          CheckpointHeader.random(),
          [block1],
          CheckpointNumber(1),
        );
        const publishedCheckpoint = makePublishedCheckpoint(checkpoint, 10);

        const checkpoint2 = new Checkpoint(
          AppendOnlyTreeSnapshot.random(),
          CheckpointHeader.random(),
          [block2],
          CheckpointNumber(1),
        );
        const publishedCheckpoint2 = makePublishedCheckpoint(checkpoint2, 10);

        await expect(store.addCheckpoints([publishedCheckpoint])).resolves.toBe(true);
        await expect(store.addCheckpoints([publishedCheckpoint2])).rejects.toThrow(
          InitialCheckpointNumberNotSequentialError,
        );
      });
    });

    describe('unwindcheckpoints', () => {
      it('unwinding checkpoints will remove checkpoints from the chain', async () => {
        await store.addCheckpoints(publishedCheckpoints);
        const checkpointNumber = await store.getSynchedCheckpointNumber();
        const lastCheckpoint = publishedCheckpoints.at(-1)!;
        const lastBlockNumber = lastCheckpoint.checkpoint.blocks[0].number;

        // Verify block exists before unwinding
        const retrievedBlock = await store.getCheckpointedBlock(lastBlockNumber);
        expect(retrievedBlock).toBeDefined();
        expect(retrievedBlock!.block.header.equals(lastCheckpoint.checkpoint.blocks[0].header)).toBe(true);
        expect(retrievedBlock!.checkpointNumber).toEqual(checkpointNumber);

        await store.unwindCheckpoints(checkpointNumber, 1);

        expect(await store.getSynchedCheckpointNumber()).toBe(checkpointNumber - 1);
        await expect(store.getCheckpointedBlock(lastBlockNumber)).resolves.toBeUndefined();
      });

      it('can unwind multiple empty blocks', async () => {
        // Create checkpoints sequentially to chain archive roots
        const emptyCheckpoints: PublishedCheckpoint[] = [];
        for (let i = 0; i < 10; i++) {
          const previousArchive = i > 0 ? emptyCheckpoints[i - 1].checkpoint.blocks[0].archive : undefined;
          const checkpoint = await Checkpoint.random(CheckpointNumber(i + 1), {
            numBlocks: 1,
            startBlockNumber: i + 1,
            txsPerBlock: 0,
            previousArchive,
          });
          emptyCheckpoints.push(makePublishedCheckpoint(checkpoint, i + 10));
        }
        await store.addCheckpoints(emptyCheckpoints);
        expect(await store.getSynchedCheckpointNumber()).toBe(10);

        await store.unwindCheckpoints(CheckpointNumber(10), 3);
        expect(await store.getSynchedCheckpointNumber()).toBe(7);
        expect((await store.getRangeOfCheckpoints(CheckpointNumber(1), 10)).map(b => b.checkpointNumber)).toEqual([
          1, 2, 3, 4, 5, 6, 7,
        ]);
      });

      it('refuses to unwind checkpoints if the tip is not the last checkpoint', async () => {
        await store.addCheckpoints(publishedCheckpoints);
        await expect(store.unwindCheckpoints(CheckpointNumber(5), 1)).rejects.toThrow(
          /can only unwind checkpoints from the tip/i,
        );
      });

      it('unwound blocks and headers cannot be retrieved by hash or archive', async () => {
        await store.addCheckpoints(publishedCheckpoints);
        const lastCheckpoint = publishedCheckpoints[publishedCheckpoints.length - 1];
        const lastBlock = lastCheckpoint.checkpoint.blocks[0];
        const blockHash = await lastBlock.header.hash();
        const archive = lastBlock.archive.root;

        // Verify block and header exist before unwinding
        const retrievedByHash = await store.getCheckpointedBlockByHash(blockHash);
        expect(retrievedByHash).toBeDefined();
        expect(retrievedByHash!.block.header.equals(lastBlock.header)).toBe(true);

        const retrievedByArchive = await store.getCheckpointedBlockByArchive(archive);
        expect(retrievedByArchive).toBeDefined();
        expect(retrievedByArchive!.block.header.equals(lastBlock.header)).toBe(true);

        const headerByHash = await store.getBlockHeaderByHash(blockHash);
        expect(headerByHash).toBeDefined();
        expect(headerByHash!.equals(lastBlock.header)).toBe(true);

        const headerByArchive = await store.getBlockHeaderByArchive(archive);
        expect(headerByArchive).toBeDefined();
        expect(headerByArchive!.equals(lastBlock.header)).toBe(true);

        // Unwind the checkpoint
        await store.unwindCheckpoints(lastCheckpoint.checkpoint.number, 1);

        // Verify neither block nor header can be retrieved after unwinding
        expect(await store.getCheckpointedBlockByHash(blockHash)).toBeUndefined();
        expect(await store.getCheckpointedBlockByArchive(archive)).toBeUndefined();
        expect(await store.getBlockHeaderByHash(blockHash)).toBeUndefined();
        expect(await store.getBlockHeaderByArchive(archive)).toBeUndefined();
      });
    });

    describe('multi-block checkpoints', () => {
      it('block number increases correctly when adding checkpoints with multiple blocks', async () => {
        // Create 3 checkpoints: first with 2 blocks, second with 3 blocks, third with 1 block
        // Total blocks: 6, spanning block numbers 1-6
        // Chain archive roots across checkpoints
        const checkpoint1Cp = await Checkpoint.random(CheckpointNumber(1), { numBlocks: 2, startBlockNumber: 1 });
        const checkpoint1 = makePublishedCheckpoint(checkpoint1Cp, 10);

        const previousArchive1 = checkpoint1Cp.blocks.at(-1)!.archive;
        const checkpoint2Cp = await Checkpoint.random(CheckpointNumber(2), {
          numBlocks: 3,
          startBlockNumber: 3,
          previousArchive: previousArchive1,
        });
        const checkpoint2 = makePublishedCheckpoint(checkpoint2Cp, 11);

        const previousArchive2 = checkpoint2Cp.blocks.at(-1)!.archive;
        const checkpoint3Cp = await Checkpoint.random(CheckpointNumber(3), {
          numBlocks: 1,
          startBlockNumber: 6,
          previousArchive: previousArchive2,
        });
        const checkpoint3 = makePublishedCheckpoint(checkpoint3Cp, 12);

        await store.addCheckpoints([checkpoint1, checkpoint2, checkpoint3]);

        // Checkpoint number should be 3 (the last checkpoint number)
        expect(await store.getSynchedCheckpointNumber()).toBe(3);
        // Block number should be 6 (the last block number across all checkpoints)
        expect(await store.getLatestBlockNumber()).toBe(6);
      });

      it('block number decreases correctly when unwinding checkpoints with multiple blocks', async () => {
        // Create 3 checkpoints with varying block counts, chaining archive roots
        const checkpoint1Cp = await Checkpoint.random(CheckpointNumber(1), { numBlocks: 2, startBlockNumber: 1 });
        const checkpoint1 = makePublishedCheckpoint(checkpoint1Cp, 10);

        const previousArchive1 = checkpoint1Cp.blocks.at(-1)!.archive;
        const checkpoint2Cp = await Checkpoint.random(CheckpointNumber(2), {
          numBlocks: 3,
          startBlockNumber: 3,
          previousArchive: previousArchive1,
        });
        const checkpoint2 = makePublishedCheckpoint(checkpoint2Cp, 11);

        const previousArchive2 = checkpoint2Cp.blocks.at(-1)!.archive;
        const checkpoint3Cp = await Checkpoint.random(CheckpointNumber(3), {
          numBlocks: 2,
          startBlockNumber: 6,
          previousArchive: previousArchive2,
        });
        const checkpoint3 = makePublishedCheckpoint(checkpoint3Cp, 12);

        await store.addCheckpoints([checkpoint1, checkpoint2, checkpoint3]);

        expect(await store.getSynchedCheckpointNumber()).toBe(3);
        expect(await store.getLatestBlockNumber()).toBe(7);

        // Unwind the last checkpoint (which has 2 blocks)
        await store.unwindCheckpoints(CheckpointNumber(3), 1);

        expect(await store.getSynchedCheckpointNumber()).toBe(2);
        expect(await store.getLatestBlockNumber()).toBe(5);

        // Unwind another checkpoint (which has 3 blocks)
        await store.unwindCheckpoints(CheckpointNumber(2), 1);

        expect(await store.getSynchedCheckpointNumber()).toBe(1);
        expect(await store.getLatestBlockNumber()).toBe(2);
      });

      it('unwinding multiple checkpoints with multiple blocks in one go', async () => {
        // Create 4 checkpoints with varying block counts, chaining archive roots
        // Checkpoint 1: blocks 1-2 (2 blocks)
        // Checkpoint 2: blocks 3-5 (3 blocks)
        // Checkpoint 3: blocks 6-7 (2 blocks)
        // Checkpoint 4: blocks 8-10 (3 blocks)
        // Total: 10 blocks across 4 checkpoints
        const checkpoint1Cp = await Checkpoint.random(CheckpointNumber(1), { numBlocks: 2, startBlockNumber: 1 });
        const checkpoint1 = makePublishedCheckpoint(checkpoint1Cp, 10);

        const previousArchive1 = checkpoint1Cp.blocks.at(-1)!.archive;
        const checkpoint2Cp = await Checkpoint.random(CheckpointNumber(2), {
          numBlocks: 3,
          startBlockNumber: 3,
          previousArchive: previousArchive1,
        });
        const checkpoint2 = makePublishedCheckpoint(checkpoint2Cp, 11);

        const previousArchive2 = checkpoint2Cp.blocks.at(-1)!.archive;
        const checkpoint3Cp = await Checkpoint.random(CheckpointNumber(3), {
          numBlocks: 2,
          startBlockNumber: 6,
          previousArchive: previousArchive2,
        });
        const checkpoint3 = makePublishedCheckpoint(checkpoint3Cp, 12);

        const previousArchive3 = checkpoint3Cp.blocks.at(-1)!.archive;
        const checkpoint4Cp = await Checkpoint.random(CheckpointNumber(4), {
          numBlocks: 3,
          startBlockNumber: 8,
          previousArchive: previousArchive3,
        });
        const checkpoint4 = makePublishedCheckpoint(checkpoint4Cp, 13);

        await store.addCheckpoints([checkpoint1, checkpoint2, checkpoint3, checkpoint4]);

        expect(await store.getSynchedCheckpointNumber()).toBe(4);
        expect(await store.getLatestBlockNumber()).toBe(10);

        // Unwind 2 checkpoints at once (checkpoints 3 and 4, which together have 5 blocks)
        await store.unwindCheckpoints(CheckpointNumber(4), 2);

        expect(await store.getSynchedCheckpointNumber()).toBe(2);
        expect(await store.getLatestBlockNumber()).toBe(5);

        // Verify blocks 1-5 still exist (from checkpoints 1 and 2)
        for (let blockNumber = 1; blockNumber <= 5; blockNumber++) {
          expect(await store.getCheckpointedBlock(blockNumber)).toBeDefined();
        }

        // Verify blocks 6-10 are gone (from checkpoints 3 and 4)
        for (let blockNumber = 6; blockNumber <= 10; blockNumber++) {
          expect(await store.getCheckpointedBlock(blockNumber)).toBeUndefined();
        }

        // Unwind remaining 2 checkpoints at once (checkpoints 1 and 2, which together have 5 blocks)
        await store.unwindCheckpoints(CheckpointNumber(2), 2);

        expect(await store.getSynchedCheckpointNumber()).toBe(0);
        expect(await store.getLatestBlockNumber()).toBe(0);

        // Verify all blocks are gone
        for (let blockNumber = 1; blockNumber <= 10; blockNumber++) {
          expect(await store.getCheckpointedBlock(blockNumber)).toBeUndefined();
        }
      });

      it('getCheckpointedBlock returns correct checkpoint info for blocks within multi-block checkpoints', async () => {
        // Create checkpoints with chained archive roots
        // Create a checkpoint with 3 blocks
        const checkpoint1Cp = await Checkpoint.random(CheckpointNumber(1), { numBlocks: 3, startBlockNumber: 1 });
        const checkpoint1 = makePublishedCheckpoint(checkpoint1Cp, 10);

        // Create another checkpoint with 2 blocks
        const previousArchive1 = checkpoint1Cp.blocks.at(-1)!.archive;
        const checkpoint2Cp = await Checkpoint.random(CheckpointNumber(2), {
          numBlocks: 2,
          startBlockNumber: 4,
          previousArchive: previousArchive1,
        });
        const checkpoint2 = makePublishedCheckpoint(checkpoint2Cp, 11);

        await store.addCheckpoints([checkpoint1, checkpoint2]);

        // Check blocks from the first checkpoint (blocks 1, 2, 3)
        for (let i = 0; i < 3; i++) {
          const blockNumber = i + 1;
          const retrievedBlock = await store.getCheckpointedBlock(blockNumber);

          expect(retrievedBlock).toBeDefined();
          expect(retrievedBlock!.checkpointNumber).toBe(1);
          expect(retrievedBlock!.block.number).toBe(blockNumber);
          expect(retrievedBlock!.l1).toEqual(checkpoint1.l1);
          expect(retrievedBlock!.attestations.every((a, j) => a.equals(checkpoint1.attestations[j]))).toBe(true);
        }

        // Check blocks from the second checkpoint (blocks 4, 5)
        for (let i = 0; i < 2; i++) {
          const blockNumber = i + 4;
          const retrievedBlock = await store.getCheckpointedBlock(blockNumber);

          expect(retrievedBlock).toBeDefined();
          expect(retrievedBlock!.checkpointNumber).toBe(2);
          expect(retrievedBlock!.block.number).toBe(blockNumber);
          expect(retrievedBlock!.l1).toEqual(checkpoint2.l1);
          expect(retrievedBlock!.attestations.every((a, j) => a.equals(checkpoint2.attestations[j]))).toBe(true);
        }
      });

      it('getCheckpointedBlockByHash returns correct checkpoint info for blocks within multi-block checkpoints', async () => {
        const checkpoint = makePublishedCheckpoint(
          await Checkpoint.random(CheckpointNumber(1), { numBlocks: 3, startBlockNumber: 1 }),
          10,
        );

        await store.addCheckpoints([checkpoint]);

        // Check each block by its hash
        for (let i = 0; i < checkpoint.checkpoint.blocks.length; i++) {
          const block = checkpoint.checkpoint.blocks[i];
          const blockHash = await block.header.hash();
          const retrievedBlock = await store.getCheckpointedBlockByHash(blockHash);

          expect(retrievedBlock).toBeDefined();
          expect(retrievedBlock!.checkpointNumber).toBe(1);
          expect(retrievedBlock!.block.number).toBe(i + 1);
          expect(retrievedBlock!.l1).toEqual(checkpoint.l1);
        }
      });

      it('getCheckpointedBlockByArchive returns correct checkpoint info for blocks within multi-block checkpoints', async () => {
        const checkpoint = makePublishedCheckpoint(
          await Checkpoint.random(CheckpointNumber(1), { numBlocks: 3, startBlockNumber: 1 }),
          10,
        );

        await store.addCheckpoints([checkpoint]);

        // Check each block by its archive root
        for (let i = 0; i < checkpoint.checkpoint.blocks.length; i++) {
          const block = checkpoint.checkpoint.blocks[i];
          const archive = block.archive.root;
          const retrievedBlock = await store.getCheckpointedBlockByArchive(archive);

          expect(retrievedBlock).toBeDefined();
          expect(retrievedBlock!.checkpointNumber).toBe(1);
          expect(retrievedBlock!.block.number).toBe(i + 1);
          expect(retrievedBlock!.l1).toEqual(checkpoint.l1);
        }
      });

      it('unwinding a multi-block checkpoint removes all its blocks', async () => {
        const checkpoint = makePublishedCheckpoint(
          await Checkpoint.random(CheckpointNumber(1), { numBlocks: 3, startBlockNumber: 1 }),
          10,
        );

        await store.addCheckpoints([checkpoint]);

        // Verify all 3 blocks exist
        for (let blockNumber = 1; blockNumber <= 3; blockNumber++) {
          expect(await store.getCheckpointedBlock(blockNumber)).toBeDefined();
        }

        // Unwind the checkpoint
        await store.unwindCheckpoints(CheckpointNumber(1), 1);

        // Verify all 3 blocks are removed
        for (let blockNumber = 1; blockNumber <= 3; blockNumber++) {
          expect(await store.getCheckpointedBlock(blockNumber)).toBeUndefined();
        }

        expect(await store.getSynchedCheckpointNumber()).toBe(0);
        expect(await store.getLatestBlockNumber()).toBe(0);
      });
    });

    describe('uncheckpointed blocks', () => {
      it('can add blocks independently before a checkpoint arrives', async () => {
        // First, establish some checkpointed blocks (checkpoint 1 with blocks 1-3)
        const checkpoint1 = makePublishedCheckpoint(
          await Checkpoint.random(CheckpointNumber(1), { numBlocks: 3, startBlockNumber: 1 }),
          10,
        );
        await store.addCheckpoints([checkpoint1]);

        expect(await store.getSynchedCheckpointNumber()).toBe(1);
        expect(await store.getLatestBlockNumber()).toBe(3);

        // Now add blocks 4, 5, 6 independently (without a checkpoint) for upcoming checkpoint 2
        // Chain archive roots from the last block of checkpoint 1
        const lastBlockArchive = checkpoint1.checkpoint.blocks.at(-1)!.archive;
        const block4 = await L2BlockNew.random(BlockNumber(4), {
          checkpointNumber: CheckpointNumber(2),
          indexWithinCheckpoint: 0,
          lastArchive: lastBlockArchive,
        });
        const block5 = await L2BlockNew.random(BlockNumber(5), {
          checkpointNumber: CheckpointNumber(2),
          indexWithinCheckpoint: 1,
          lastArchive: block4.archive,
        });
        const block6 = await L2BlockNew.random(BlockNumber(6), {
          checkpointNumber: CheckpointNumber(2),
          indexWithinCheckpoint: 2,
          lastArchive: block5.archive,
        });

        await store.addBlocks([block4, block5, block6]);

        // Checkpoint number should still be 1 (no new checkpoint added)
        expect(await store.getSynchedCheckpointNumber()).toBe(1);
        // But latest block number should be 6
        expect(await store.getLatestBlockNumber()).toBe(6);
      });

      it('getBlock retrieves uncheckpointed blocks', async () => {
        // First, establish some checkpointed blocks
        const checkpoint1 = makePublishedCheckpoint(
          await Checkpoint.random(CheckpointNumber(1), { numBlocks: 2, startBlockNumber: 1 }),
          10,
        );
        await store.addCheckpoints([checkpoint1]);

        // Add uncheckpointed blocks for upcoming checkpoint 2, chaining archive roots
        const lastBlockArchive = checkpoint1.checkpoint.blocks.at(-1)!.archive;
        const block3 = await L2BlockNew.random(BlockNumber(3), {
          checkpointNumber: CheckpointNumber(2),
          indexWithinCheckpoint: 0,
          lastArchive: lastBlockArchive,
        });
        const block4 = await L2BlockNew.random(BlockNumber(4), {
          checkpointNumber: CheckpointNumber(2),
          indexWithinCheckpoint: 1,
          lastArchive: block3.archive,
        });
        await store.addBlocks([block3, block4]);

        // getBlock should work for both checkpointed and uncheckpointed blocks
        expect((await store.getBlock(1))?.number).toBe(1);
        expect((await store.getBlock(2))?.number).toBe(2);
        expect((await store.getBlock(3))?.equals(block3)).toBe(true);
        expect((await store.getBlock(4))?.equals(block4)).toBe(true);
        expect(await store.getBlock(5)).toBeUndefined();

        const block5 = await L2BlockNew.random(BlockNumber(5), {
          checkpointNumber: CheckpointNumber(2),
          indexWithinCheckpoint: 2,
          lastArchive: block4.archive,
        });
        await store.addBlocks([block5]);

        // Verify the uncheckpointed blocks have correct data
        const retrieved3 = await store.getBlock(3);
        expect(retrieved3!.number).toBe(3);
        expect(retrieved3!.equals(block3)).toBe(true);
        const retrieved4 = await store.getBlock(4);
        expect(retrieved4!.number).toBe(4);
        expect(retrieved4!.equals(block4)).toBe(true);
        const retrieved5 = await store.getBlock(5);
        expect(retrieved5!.number).toBe(5);
        expect(retrieved5!.equals(block5)).toBe(true);
      });

      it('getBlockByHash retrieves uncheckpointed blocks', async () => {
        // Add uncheckpointed blocks (no checkpoints at all) for initial checkpoint 1, chaining archive roots
        const block1 = await L2BlockNew.random(BlockNumber(1), {
          checkpointNumber: CheckpointNumber(1),
          indexWithinCheckpoint: 0,
        });
        const block2 = await L2BlockNew.random(BlockNumber(2), {
          checkpointNumber: CheckpointNumber(1),
          indexWithinCheckpoint: 1,
          lastArchive: block1.archive,
        });
        await store.addBlocks([block1, block2]);

        // getBlockByHash should work for uncheckpointed blocks
        const hash1 = await block1.header.hash();
        const hash2 = await block2.header.hash();

        const retrieved1 = await store.getBlockByHash(hash1);
        expect(retrieved1!.equals(block1)).toBe(true);

        const retrieved2 = await store.getBlockByHash(hash2);
        expect(retrieved2!.equals(block2)).toBe(true);
      });

      it('getBlockByArchive retrieves uncheckpointed blocks', async () => {
        // Add uncheckpointed blocks for initial checkpoint 1, chaining archive roots
        const block1 = await L2BlockNew.random(BlockNumber(1), {
          checkpointNumber: CheckpointNumber(1),
          indexWithinCheckpoint: 0,
        });
        const block2 = await L2BlockNew.random(BlockNumber(2), {
          checkpointNumber: CheckpointNumber(1),
          indexWithinCheckpoint: 1,
          lastArchive: block1.archive,
        });
        await store.addBlocks([block1, block2]);

        // getBlockByArchive should work for uncheckpointed blocks
        const archive1 = block1.archive.root;
        const archive2 = block2.archive.root;

        const retrieved1 = await store.getBlockByArchive(archive1);
        expect(retrieved1!.equals(block1)).toBe(true);

        const retrieved2 = await store.getBlockByArchive(archive2);
        expect(retrieved2!.equals(block2)).toBe(true);
      });

      it('getCheckpointedBlock returns undefined for uncheckpointed blocks', async () => {
        // Add a checkpoint with blocks 1-2
        const checkpoint1 = makePublishedCheckpoint(
          await Checkpoint.random(CheckpointNumber(1), { numBlocks: 2, startBlockNumber: 1 }),
          10,
        );
        await store.addCheckpoints([checkpoint1]);

        // Add uncheckpointed blocks 3-4 for upcoming checkpoint 2, chaining archive roots
        const lastBlockArchive = checkpoint1.checkpoint.blocks.at(-1)!.archive;
        const block3 = await L2BlockNew.random(BlockNumber(3), {
          checkpointNumber: CheckpointNumber(2),
          indexWithinCheckpoint: 0,
          lastArchive: lastBlockArchive,
        });
        const block4 = await L2BlockNew.random(BlockNumber(4), {
          checkpointNumber: CheckpointNumber(2),
          indexWithinCheckpoint: 1,
          lastArchive: block3.archive,
        });
        await store.addBlocks([block3, block4]);

        // getCheckpointedBlock should work for checkpointed blocks
        expect((await store.getCheckpointedBlock(1))?.block.number).toBe(1);
        expect((await store.getCheckpointedBlock(2))?.block.number).toBe(2);

        // getCheckpointedBlock should return undefined for uncheckpointed blocks
        expect(await store.getCheckpointedBlock(3)).toBeUndefined();
        expect(await store.getCheckpointedBlock(4)).toBeUndefined();

        // But getBlock should work for all blocks
        expect((await store.getBlock(3))?.equals(block3)).toBe(true);
        expect((await store.getBlock(4))?.equals(block4)).toBe(true);
      });

      it('getCheckpointedBlockByHash returns undefined for uncheckpointed blocks', async () => {
        // Add uncheckpointed blocks for initial checkpoint 1
        const block1 = await L2BlockNew.random(BlockNumber(1), {
          checkpointNumber: CheckpointNumber(1),
          indexWithinCheckpoint: 0,
        });
        await store.addBlocks([block1]);

        const hash = await block1.header.hash();

        // getCheckpointedBlockByHash should return undefined
        expect(await store.getCheckpointedBlockByHash(hash)).toBeUndefined();

        // But getBlockByHash should work
        expect((await store.getBlockByHash(hash))?.equals(block1)).toBe(true);
      });

      it('getCheckpointedBlockByArchive returns undefined for uncheckpointed blocks', async () => {
        // Add uncheckpointed blocks for initial checkpoint 1
        const block1 = await L2BlockNew.random(BlockNumber(1), {
          checkpointNumber: CheckpointNumber(1),
          indexWithinCheckpoint: 0,
        });
        await store.addBlocks([block1]);

        const archive = block1.archive.root;

        // getCheckpointedBlockByArchive should return undefined
        expect(await store.getCheckpointedBlockByArchive(archive)).toBeUndefined();

        // But getBlockByArchive should work
        expect((await store.getBlockByArchive(archive))?.equals(block1)).toBe(true);
      });

      it('checkpoint adopts previously added uncheckpointed blocks', async () => {
        // Add blocks 1-3 without a checkpoint (for initial checkpoint 1), chaining archive roots
        const block1 = await L2BlockNew.random(BlockNumber(1), {
          checkpointNumber: CheckpointNumber(1),
          indexWithinCheckpoint: 0,
        });
        const block2 = await L2BlockNew.random(BlockNumber(2), {
          checkpointNumber: CheckpointNumber(1),
          indexWithinCheckpoint: 1,
          lastArchive: block1.archive,
        });
        const block3 = await L2BlockNew.random(BlockNumber(3), {
          checkpointNumber: CheckpointNumber(1),
          indexWithinCheckpoint: 2,
          lastArchive: block2.archive,
        });
        await store.addBlocks([block1, block2, block3]);

        expect(await store.getSynchedCheckpointNumber()).toBe(0);
        expect(await store.getLatestBlockNumber()).toBe(3);

        // getCheckpointedBlock should return undefined for all
        expect(await store.getCheckpointedBlock(1)).toBeUndefined();
        expect(await store.getCheckpointedBlock(2)).toBeUndefined();
        expect(await store.getCheckpointedBlock(3)).toBeUndefined();

        // Now add a checkpoint that covers blocks 1-3
        const checkpoint1 = makePublishedCheckpoint(
          await Checkpoint.random(CheckpointNumber(1), { numBlocks: 3, startBlockNumber: 1 }),
          10,
        );
        await store.addCheckpoints([checkpoint1]);

        expect(await store.getSynchedCheckpointNumber()).toBe(1);
        expect(await store.getLatestBlockNumber()).toBe(3);

        // Now getCheckpointedBlock should work for all blocks
        const checkpointed1 = await store.getCheckpointedBlock(1);
        expect(checkpointed1).toBeDefined();
        expect(checkpointed1!.checkpointNumber).toBe(1);
        expect(checkpointed1!.l1).toEqual(checkpoint1.l1);

        const checkpointed2 = await store.getCheckpointedBlock(2);
        expect(checkpointed2).toBeDefined();
        expect(checkpointed2!.checkpointNumber).toBe(1);

        const checkpointed3 = await store.getCheckpointedBlock(3);
        expect(checkpointed3).toBeDefined();
        expect(checkpointed3!.checkpointNumber).toBe(1);
      });

      it('can add more uncheckpointed blocks after a checkpoint and then checkpoint them', async () => {
        // Start with checkpoint 1 covering blocks 1-2
        const checkpoint1 = makePublishedCheckpoint(
          await Checkpoint.random(CheckpointNumber(1), { numBlocks: 2, startBlockNumber: 1 }),
          10,
        );
        await store.addCheckpoints([checkpoint1]);

        // Add uncheckpointed blocks 3-5 for the upcoming checkpoint 2, chaining archive roots
        const lastBlockArchive = checkpoint1.checkpoint.blocks.at(-1)!.archive;
        const block3 = await L2BlockNew.random(BlockNumber(3), {
          checkpointNumber: CheckpointNumber(2),
          indexWithinCheckpoint: 0,
          lastArchive: lastBlockArchive,
        });
        const block4 = await L2BlockNew.random(BlockNumber(4), {
          checkpointNumber: CheckpointNumber(2),
          indexWithinCheckpoint: 1,
          lastArchive: block3.archive,
        });
        const block5 = await L2BlockNew.random(BlockNumber(5), {
          checkpointNumber: CheckpointNumber(2),
          indexWithinCheckpoint: 2,
          lastArchive: block4.archive,
        });
        await store.addBlocks([block3, block4, block5]);

        expect(await store.getSynchedCheckpointNumber()).toBe(1);
        expect(await store.getLatestBlockNumber()).toBe(5);

        // Blocks 3-5 are not checkpointed yet
        expect(await store.getCheckpointedBlock(3)).toBeUndefined();
        expect(await store.getCheckpointedBlock(4)).toBeUndefined();
        expect(await store.getCheckpointedBlock(5)).toBeUndefined();

        // Add checkpoint 2 covering blocks 3-5, chaining from checkpoint1
        const checkpoint2 = makePublishedCheckpoint(
          await Checkpoint.random(CheckpointNumber(2), {
            numBlocks: 3,
            startBlockNumber: 3,
            previousArchive: lastBlockArchive,
          }),
          11,
        );
        await store.addCheckpoints([checkpoint2]);

        expect(await store.getSynchedCheckpointNumber()).toBe(2);
        expect(await store.getLatestBlockNumber()).toBe(5);

        // Now blocks 3-5 should be checkpointed with checkpoint 2's info
        const checkpointed3 = await store.getCheckpointedBlock(3);
        expect(checkpointed3).toBeDefined();
        expect(checkpointed3!.checkpointNumber).toBe(2);
        expect(checkpointed3!.l1).toEqual(checkpoint2.l1);

        const checkpointed4 = await store.getCheckpointedBlock(4);
        expect(checkpointed4).toBeDefined();
        expect(checkpointed4!.checkpointNumber).toBe(2);

        const checkpointed5 = await store.getCheckpointedBlock(5);
        expect(checkpointed5).toBeDefined();
        expect(checkpointed5!.checkpointNumber).toBe(2);
      });

      it('getBlocks retrieves both checkpointed and uncheckpointed blocks', async () => {
        // Add checkpoint with blocks 1-2
        const checkpoint1 = makePublishedCheckpoint(
          await Checkpoint.random(CheckpointNumber(1), { numBlocks: 2, startBlockNumber: 1 }),
          10,
        );
        await store.addCheckpoints([checkpoint1]);

        // Add uncheckpointed blocks 3-4 for the upcoming checkpoint 2, chaining archive roots
        const lastBlockArchive = checkpoint1.checkpoint.blocks.at(-1)!.archive;
        const block3 = await L2BlockNew.random(BlockNumber(3), {
          checkpointNumber: CheckpointNumber(2),
          indexWithinCheckpoint: 0,
          lastArchive: lastBlockArchive,
        });
        const block4 = await L2BlockNew.random(BlockNumber(4), {
          checkpointNumber: CheckpointNumber(2),
          indexWithinCheckpoint: 1,
          lastArchive: block3.archive,
        });
        await store.addBlocks([block3, block4]);

        // getBlocks should retrieve all blocks
        const allBlocks = await store.getBlocks(1, 10);
        expect(allBlocks.length).toBe(4);
        expect(allBlocks.map(b => b.number)).toEqual([1, 2, 3, 4]);
      });
    });

    describe('addBlocks validation', () => {
      it('throws if blocks have different checkpoint numbers', async () => {
        // First, establish checkpoint 1 with blocks 1-2
        const checkpoint1 = makePublishedCheckpoint(
          await Checkpoint.random(CheckpointNumber(1), { numBlocks: 2, startBlockNumber: 1 }),
          10,
        );
        await store.addCheckpoints([checkpoint1]);

        // Try to add blocks 3 and 4 with different checkpoint numbers
        // Chain archives correctly to test the checkpoint number validation
        const lastBlockArchive = checkpoint1.checkpoint.blocks.at(-1)!.archive;
        const block3 = await L2BlockNew.random(BlockNumber(3), {
          checkpointNumber: CheckpointNumber(2),
          indexWithinCheckpoint: 0,
          lastArchive: lastBlockArchive,
        });
        const block4 = await L2BlockNew.random(BlockNumber(4), {
          checkpointNumber: CheckpointNumber(3),
          indexWithinCheckpoint: 1,
          lastArchive: block3.archive,
        });

        await expect(store.addBlocks([block3, block4])).rejects.toThrow(CheckpointNumberNotConsistentError);
      });

      it('throws if checkpoint number is not the current checkpoint', async () => {
        // First, establish checkpoint 1 with blocks 1-2
        const checkpoint1 = makePublishedCheckpoint(
          await Checkpoint.random(CheckpointNumber(1), { numBlocks: 2, startBlockNumber: 1 }),
          10,
        );
        await store.addCheckpoints([checkpoint1]);

        // Try to add blocks for checkpoint 3 (skipping checkpoint 2)
        const block3 = await L2BlockNew.random(BlockNumber(3), {
          checkpointNumber: CheckpointNumber(3),
          indexWithinCheckpoint: 0,
        });
        const block4 = await L2BlockNew.random(BlockNumber(4), {
          checkpointNumber: CheckpointNumber(3),
          indexWithinCheckpoint: 1,
        });

        await expect(store.addBlocks([block3, block4])).rejects.toThrow(InitialCheckpointNumberNotSequentialError);
      });

      it('allows blocks with the same checkpoint number for the current checkpoint', async () => {
        // First, establish checkpoint 1 with blocks 1-2
        const checkpoint1 = makePublishedCheckpoint(
          await Checkpoint.random(CheckpointNumber(1), { numBlocks: 2, startBlockNumber: 1 }),
          10,
        );
        await store.addCheckpoints([checkpoint1]);

        // Add blocks 3 and 4 with consistent checkpoint number (2), chaining archive roots
        const lastBlockArchive = checkpoint1.checkpoint.blocks.at(-1)!.archive;
        const block3 = await L2BlockNew.random(BlockNumber(3), {
          checkpointNumber: CheckpointNumber(2),
          indexWithinCheckpoint: 0,
          lastArchive: lastBlockArchive,
        });
        const block4 = await L2BlockNew.random(BlockNumber(4), {
          checkpointNumber: CheckpointNumber(2),
          indexWithinCheckpoint: 1,
          lastArchive: block3.archive,
        });

        await expect(store.addBlocks([block3, block4])).resolves.toBe(true);

        // Verify blocks were added
        expect((await store.getBlock(3))?.equals(block3)).toBe(true);
        expect((await store.getBlock(4))?.equals(block4)).toBe(true);
      });

      it('allows blocks for the initial checkpoint when store is empty', async () => {
        // Add blocks for the initial checkpoint (1), chaining archive roots
        const block1 = await L2BlockNew.random(BlockNumber(1), {
          checkpointNumber: CheckpointNumber(1),
          indexWithinCheckpoint: 0,
        });
        const block2 = await L2BlockNew.random(BlockNumber(2), {
          checkpointNumber: CheckpointNumber(1),
          indexWithinCheckpoint: 1,
          lastArchive: block1.archive,
        });

        await expect(store.addBlocks([block1, block2])).resolves.toBe(true);

        // Verify blocks were added
        expect((await store.getBlock(1))?.equals(block1)).toBe(true);
        expect((await store.getBlock(2))?.equals(block2)).toBe(true);
        expect(await store.getLatestBlockNumber()).toBe(2);
      });

      it('throws if initial block is duplicated across calls', async () => {
        // Add blocks for the initial checkpoint (1)
        const block1 = await L2BlockNew.random(BlockNumber(1), {
          checkpointNumber: CheckpointNumber(1),
          indexWithinCheckpoint: 0,
        });
        const block2 = await L2BlockNew.random(BlockNumber(1), {
          checkpointNumber: CheckpointNumber(1),
          indexWithinCheckpoint: 0,
        });

        await expect(store.addBlocks([block1])).resolves.toBe(true);
        await expect(store.addBlocks([block2])).rejects.toThrow(InitialBlockNumberNotSequentialError);
      });

      it('throws if first block has wrong checkpoint number when store is empty', async () => {
        // Try to add blocks for checkpoint 2 when store is empty (should start at 1)
        const block1 = await L2BlockNew.random(BlockNumber(1), {
          checkpointNumber: CheckpointNumber(2),
          indexWithinCheckpoint: 0,
        });
        const block2 = await L2BlockNew.random(BlockNumber(2), {
          checkpointNumber: CheckpointNumber(2),
          indexWithinCheckpoint: 1,
        });

        await expect(store.addBlocks([block1, block2])).rejects.toThrow(InitialCheckpointNumberNotSequentialError);
      });

      it('allows adding more blocks to the same checkpoint in separate calls', async () => {
        // First, establish checkpoint 1 with blocks 1-2
        const checkpoint1 = makePublishedCheckpoint(
          await Checkpoint.random(CheckpointNumber(1), { numBlocks: 2, startBlockNumber: 1 }),
          10,
        );
        await store.addCheckpoints([checkpoint1]);

        // Add block 3 for checkpoint 2, chaining archive roots
        const lastBlockArchive = checkpoint1.checkpoint.blocks.at(-1)!.archive;
        const block3 = await L2BlockNew.random(BlockNumber(3), {
          checkpointNumber: CheckpointNumber(2),
          indexWithinCheckpoint: 0,
          lastArchive: lastBlockArchive,
        });
        await expect(store.addBlocks([block3])).resolves.toBe(true);

        // Add block 4 for the same checkpoint 2 in a separate call
        const block4 = await L2BlockNew.random(BlockNumber(4), {
          checkpointNumber: CheckpointNumber(2),
          indexWithinCheckpoint: 1,
          lastArchive: block3.archive,
        });
        await expect(store.addBlocks([block4])).resolves.toBe(true);

        expect(await store.getLatestBlockNumber()).toBe(4);
      });

      it('throws if adding blocks in separate calls with non-consecutive indexes', async () => {
        // First, establish checkpoint 1 with blocks 1-2
        const checkpoint1 = makePublishedCheckpoint(
          await Checkpoint.random(CheckpointNumber(1), { numBlocks: 2, startBlockNumber: 1 }),
          10,
        );
        await store.addCheckpoints([checkpoint1]);

        // Add block 3 for checkpoint 2, chaining archive roots
        const lastBlockArchive = checkpoint1.checkpoint.blocks.at(-1)!.archive;
        const block3 = await L2BlockNew.random(BlockNumber(3), {
          checkpointNumber: CheckpointNumber(2),
          indexWithinCheckpoint: 0,
          lastArchive: lastBlockArchive,
        });
        await expect(store.addBlocks([block3])).resolves.toBe(true);

        // Add block 4 for the same checkpoint 2 in a separate call but with a missing index
        const block4 = await L2BlockNew.random(BlockNumber(4), {
          checkpointNumber: CheckpointNumber(2),
          indexWithinCheckpoint: 2,
          lastArchive: block3.archive,
        });
        await expect(store.addBlocks([block4])).rejects.toThrow(BlockIndexNotSequentialError);

        expect(await store.getLatestBlockNumber()).toBe(3);
      });

      it('throws if second batch of blocks has different checkpoint number than first batch', async () => {
        // First, establish checkpoint 1 with blocks 1-2
        const checkpoint1 = makePublishedCheckpoint(
          await Checkpoint.random(CheckpointNumber(1), { numBlocks: 2, startBlockNumber: 1 }),
          10,
        );
        await store.addCheckpoints([checkpoint1]);

        // Add block 3 for checkpoint 2, chaining archive roots
        const lastBlockArchive = checkpoint1.checkpoint.blocks.at(-1)!.archive;
        const block3 = await L2BlockNew.random(BlockNumber(3), {
          checkpointNumber: CheckpointNumber(2),
          indexWithinCheckpoint: 0,
          lastArchive: lastBlockArchive,
        });
        await store.addBlocks([block3]);

        // Try to add block 4 for checkpoint 3 (should fail because current checkpoint is still 2)
        const block4 = await L2BlockNew.random(BlockNumber(4), {
          checkpointNumber: CheckpointNumber(3),
          indexWithinCheckpoint: 0,
          lastArchive: block3.archive,
        });
        await expect(store.addBlocks([block4])).rejects.toThrow(InitialCheckpointNumberNotSequentialError);
      });

      it('force option bypasses checkpoint number validation', async () => {
        // First, establish checkpoint 1 with blocks 1-2
        const checkpoint1 = makePublishedCheckpoint(
          await Checkpoint.random(CheckpointNumber(1), { numBlocks: 2, startBlockNumber: 1 }),
          10,
        );
        await store.addCheckpoints([checkpoint1]);

        // Add blocks with different checkpoint numbers using force option, chaining archive roots
        const lastBlockArchive = checkpoint1.checkpoint.blocks.at(-1)!.archive;
        const block3 = await L2BlockNew.random(BlockNumber(3), {
          checkpointNumber: CheckpointNumber(2),
          indexWithinCheckpoint: 0,
          lastArchive: lastBlockArchive,
        });
        const block4 = await L2BlockNew.random(BlockNumber(4), {
          checkpointNumber: CheckpointNumber(5),
          indexWithinCheckpoint: 0,
          lastArchive: block3.archive,
        });

        await expect(store.addBlocks([block3, block4], { force: true })).resolves.toBe(true);
      });

      it('force option bypasses blockindex number validation', async () => {
        // First, establish checkpoint 1 with blocks 1-2
        const checkpoint1 = makePublishedCheckpoint(
          await Checkpoint.random(CheckpointNumber(1), { numBlocks: 2, startBlockNumber: 1 }),
          10,
        );
        await store.addCheckpoints([checkpoint1]);

        // Add blocks with different checkpoint numbers using force option, chaining archive roots
        const lastBlockArchive = checkpoint1.checkpoint.blocks.at(-1)!.archive;
        const block3 = await L2BlockNew.random(BlockNumber(3), {
          checkpointNumber: CheckpointNumber(2),
          indexWithinCheckpoint: 0,
          lastArchive: lastBlockArchive,
        });
        const block4 = await L2BlockNew.random(BlockNumber(4), {
          checkpointNumber: CheckpointNumber(2),
          indexWithinCheckpoint: 2,
          lastArchive: block3.archive,
        });

        await expect(store.addBlocks([block3, block4], { force: true })).resolves.toBe(true);
      });

      it('throws if adding blocks with non-consecutive archives', async () => {
        // First, establish checkpoint 1 with blocks 1-2
        const checkpoint1 = makePublishedCheckpoint(
          await Checkpoint.random(CheckpointNumber(1), { numBlocks: 2, startBlockNumber: 1 }),
          10,
        );
        await store.addCheckpoints([checkpoint1]);

        // Add block 3 for checkpoint 2 with incorrect archive
        const block3 = await L2BlockNew.random(BlockNumber(3), {
          checkpointNumber: CheckpointNumber(2),
          indexWithinCheckpoint: 0,
        });
        await expect(store.addBlocks([block3])).rejects.toThrow(BlockArchiveNotConsistentError);

        expect(await store.getLatestBlockNumber()).toBe(2);
      });

      it('throws if adding blocks with non-consecutive archives across calls', async () => {
        // First, establish checkpoint 1 with blocks 1-2
        const checkpoint1 = makePublishedCheckpoint(
          await Checkpoint.random(CheckpointNumber(1), { numBlocks: 2, startBlockNumber: 1 }),
          10,
        );
        await store.addCheckpoints([checkpoint1]);

        // Add block 3 for checkpoint 2 with correct archive
        const lastBlockArchive = checkpoint1.checkpoint.blocks.at(-1)!.archive;
        const block3 = await L2BlockNew.random(BlockNumber(3), {
          checkpointNumber: CheckpointNumber(2),
          indexWithinCheckpoint: 0,
          lastArchive: lastBlockArchive,
        });
        await expect(store.addBlocks([block3])).resolves.toBe(true);

        // Add block 4 with incorrect archive (should fail)
        const block4 = await L2BlockNew.random(BlockNumber(4), {
          checkpointNumber: CheckpointNumber(2),
          indexWithinCheckpoint: 1,
          lastArchive: AppendOnlyTreeSnapshot.random(),
        });
        await expect(store.addBlocks([block4])).rejects.toThrow(BlockArchiveNotConsistentError);

        expect(await store.getLatestBlockNumber()).toBe(3);
      });
    });

    describe('getBlocksForCheckpoint', () => {
      it('returns blocks for a single-block checkpoint', async () => {
        const checkpoint = makePublishedCheckpoint(
          await Checkpoint.random(CheckpointNumber(1), { numBlocks: 1, startBlockNumber: 1 }),
          10,
        );
        await store.addCheckpoints([checkpoint]);

        const blocks = await store.getBlocksForCheckpoint(CheckpointNumber(1));
        expect(blocks).toBeDefined();
        expect(blocks!.length).toBe(1);
        expect(blocks![0].number).toBe(1);
      });

      it('returns all blocks for a multi-block checkpoint', async () => {
        const checkpoint = makePublishedCheckpoint(
          await Checkpoint.random(CheckpointNumber(1), { numBlocks: 4, startBlockNumber: 1 }),
          10,
        );
        await store.addCheckpoints([checkpoint]);

        const blocks = await store.getBlocksForCheckpoint(CheckpointNumber(1));
        expect(blocks).toBeDefined();
        expect(blocks!.length).toBe(4);
        expect(blocks!.map(b => b.number)).toEqual([1, 2, 3, 4]);
      });

      it('returns correct blocks for different checkpoints', async () => {
        // Create checkpoints with chained archive roots
        // Checkpoint 1: blocks 1-2
        const checkpoint1Cp = await Checkpoint.random(CheckpointNumber(1), { numBlocks: 2, startBlockNumber: 1 });
        const checkpoint1 = makePublishedCheckpoint(checkpoint1Cp, 10);

        // Checkpoint 2: blocks 3-5
        const previousArchive1 = checkpoint1Cp.blocks.at(-1)!.archive;
        const checkpoint2Cp = await Checkpoint.random(CheckpointNumber(2), {
          numBlocks: 3,
          startBlockNumber: 3,
          previousArchive: previousArchive1,
        });
        const checkpoint2 = makePublishedCheckpoint(checkpoint2Cp, 11);

        // Checkpoint 3: blocks 6-7
        const previousArchive2 = checkpoint2Cp.blocks.at(-1)!.archive;
        const checkpoint3Cp = await Checkpoint.random(CheckpointNumber(3), {
          numBlocks: 2,
          startBlockNumber: 6,
          previousArchive: previousArchive2,
        });
        const checkpoint3 = makePublishedCheckpoint(checkpoint3Cp, 12);

        await store.addCheckpoints([checkpoint1, checkpoint2, checkpoint3]);

        const blocks1 = await store.getBlocksForCheckpoint(CheckpointNumber(1));
        expect(blocks1).toBeDefined();
        expect(blocks1!.map(b => b.number)).toEqual([1, 2]);

        const blocks2 = await store.getBlocksForCheckpoint(CheckpointNumber(2));
        expect(blocks2).toBeDefined();
        expect(blocks2!.map(b => b.number)).toEqual([3, 4, 5]);

        const blocks3 = await store.getBlocksForCheckpoint(CheckpointNumber(3));
        expect(blocks3).toBeDefined();
        expect(blocks3!.map(b => b.number)).toEqual([6, 7]);
      });

      it('returns undefined for non-existent checkpoint', async () => {
        const checkpoint = makePublishedCheckpoint(
          await Checkpoint.random(CheckpointNumber(1), { numBlocks: 2, startBlockNumber: 1 }),
          10,
        );
        await store.addCheckpoints([checkpoint]);

        const blocks = await store.getBlocksForCheckpoint(CheckpointNumber(5));
        expect(blocks).toBeUndefined();
      });

      it('returns undefined when no checkpoints exist', async () => {
        const blocks = await store.getBlocksForCheckpoint(CheckpointNumber(1));
        expect(blocks).toBeUndefined();
      });
    });

    describe('getRangeOfCheckpoints', () => {
      it('returns empty array when no checkpoints exist', async () => {
        const checkpoints = await store.getRangeOfCheckpoints(CheckpointNumber(1), 10);
        expect(checkpoints).toEqual([]);
      });

      it('returns single checkpoint', async () => {
        const checkpoint = makePublishedCheckpoint(
          await Checkpoint.random(CheckpointNumber(1), { numBlocks: 2, startBlockNumber: 1 }),
          10,
        );
        await store.addCheckpoints([checkpoint]);

        const checkpoints = await store.getRangeOfCheckpoints(CheckpointNumber(1), 10);
        expect(checkpoints.length).toBe(1);
        expect(checkpoints[0].checkpointNumber).toBe(1);
        expect(checkpoints[0].startBlock).toBe(1);
        expect(checkpoints[0].numBlocks).toBe(2);
      });

      it('returns multiple checkpoints in order', async () => {
        // Create checkpoints with chained archive roots
        const checkpoint1Cp = await Checkpoint.random(CheckpointNumber(1), { numBlocks: 2, startBlockNumber: 1 });
        const checkpoint1 = makePublishedCheckpoint(checkpoint1Cp, 10);

        const previousArchive1 = checkpoint1Cp.blocks.at(-1)!.archive;
        const checkpoint2Cp = await Checkpoint.random(CheckpointNumber(2), {
          numBlocks: 3,
          startBlockNumber: 3,
          previousArchive: previousArchive1,
        });
        const checkpoint2 = makePublishedCheckpoint(checkpoint2Cp, 11);

        const previousArchive2 = checkpoint2Cp.blocks.at(-1)!.archive;
        const checkpoint3Cp = await Checkpoint.random(CheckpointNumber(3), {
          numBlocks: 1,
          startBlockNumber: 6,
          previousArchive: previousArchive2,
        });
        const checkpoint3 = makePublishedCheckpoint(checkpoint3Cp, 12);

        await store.addCheckpoints([checkpoint1, checkpoint2, checkpoint3]);

        const checkpoints = await store.getRangeOfCheckpoints(CheckpointNumber(1), 10);
        expect(checkpoints.length).toBe(3);
        expect(checkpoints.map(c => c.checkpointNumber)).toEqual([1, 2, 3]);
        expect(checkpoints.map(c => c.startBlock)).toEqual([1, 3, 6]);
        expect(checkpoints.map(c => c.numBlocks)).toEqual([2, 3, 1]);
      });

      it('respects the from parameter', async () => {
        // Create checkpoints with chained archive roots
        const checkpoint1Cp = await Checkpoint.random(CheckpointNumber(1), { numBlocks: 2, startBlockNumber: 1 });
        const checkpoint1 = makePublishedCheckpoint(checkpoint1Cp, 10);

        const previousArchive1 = checkpoint1Cp.blocks.at(-1)!.archive;
        const checkpoint2Cp = await Checkpoint.random(CheckpointNumber(2), {
          numBlocks: 2,
          startBlockNumber: 3,
          previousArchive: previousArchive1,
        });
        const checkpoint2 = makePublishedCheckpoint(checkpoint2Cp, 11);

        const previousArchive2 = checkpoint2Cp.blocks.at(-1)!.archive;
        const checkpoint3Cp = await Checkpoint.random(CheckpointNumber(3), {
          numBlocks: 2,
          startBlockNumber: 5,
          previousArchive: previousArchive2,
        });
        const checkpoint3 = makePublishedCheckpoint(checkpoint3Cp, 12);

        await store.addCheckpoints([checkpoint1, checkpoint2, checkpoint3]);

        // Start from checkpoint 2
        const checkpoints = await store.getRangeOfCheckpoints(CheckpointNumber(2), 10);
        expect(checkpoints.length).toBe(2);
        expect(checkpoints.map(c => c.checkpointNumber)).toEqual([2, 3]);
      });

      it('respects the limit parameter', async () => {
        // Create checkpoints with chained archive roots
        const checkpoint1Cp = await Checkpoint.random(CheckpointNumber(1), { numBlocks: 1, startBlockNumber: 1 });
        const checkpoint1 = makePublishedCheckpoint(checkpoint1Cp, 10);

        const previousArchive1 = checkpoint1Cp.blocks.at(-1)!.archive;
        const checkpoint2Cp = await Checkpoint.random(CheckpointNumber(2), {
          numBlocks: 1,
          startBlockNumber: 2,
          previousArchive: previousArchive1,
        });
        const checkpoint2 = makePublishedCheckpoint(checkpoint2Cp, 11);

        const previousArchive2 = checkpoint2Cp.blocks.at(-1)!.archive;
        const checkpoint3Cp = await Checkpoint.random(CheckpointNumber(3), {
          numBlocks: 1,
          startBlockNumber: 3,
          previousArchive: previousArchive2,
        });
        const checkpoint3 = makePublishedCheckpoint(checkpoint3Cp, 12);

        const previousArchive3 = checkpoint3Cp.blocks.at(-1)!.archive;
        const checkpoint4Cp = await Checkpoint.random(CheckpointNumber(4), {
          numBlocks: 1,
          startBlockNumber: 4,
          previousArchive: previousArchive3,
        });
        const checkpoint4 = makePublishedCheckpoint(checkpoint4Cp, 13);

        await store.addCheckpoints([checkpoint1, checkpoint2, checkpoint3, checkpoint4]);

        // Only get 2 checkpoints
        const checkpoints = await store.getRangeOfCheckpoints(CheckpointNumber(1), 2);
        expect(checkpoints.length).toBe(2);
        expect(checkpoints.map(c => c.checkpointNumber)).toEqual([1, 2]);
      });

      it('returns correct checkpoint data including L1 info', async () => {
        const checkpoint = makePublishedCheckpoint(
          await Checkpoint.random(CheckpointNumber(1), { numBlocks: 3, startBlockNumber: 1 }),
          42,
        );
        await store.addCheckpoints([checkpoint]);

        const checkpoints = await store.getRangeOfCheckpoints(CheckpointNumber(1), 1);
        expect(checkpoints.length).toBe(1);

        const data = checkpoints[0];
        expect(data.checkpointNumber).toBe(1);
        expect(data.startBlock).toBe(1);
        expect(data.numBlocks).toBe(3);
        expect(data.l1.blockNumber).toBe(42n);
        expect(data.header.equals(checkpoint.checkpoint.header)).toBe(true);
        expect(data.archive.equals(checkpoint.checkpoint.archive)).toBe(true);
      });

      it('returns empty array when from is beyond available checkpoints', async () => {
        const checkpoint = makePublishedCheckpoint(
          await Checkpoint.random(CheckpointNumber(1), { numBlocks: 2, startBlockNumber: 1 }),
          10,
        );
        await store.addCheckpoints([checkpoint]);

        const checkpoints = await store.getRangeOfCheckpoints(CheckpointNumber(5), 10);
        expect(checkpoints).toEqual([]);
      });

      it('works correctly after unwinding checkpoints', async () => {
        // Create checkpoints with chained archive roots
        const checkpoint1Cp = await Checkpoint.random(CheckpointNumber(1), { numBlocks: 2, startBlockNumber: 1 });
        const checkpoint1 = makePublishedCheckpoint(checkpoint1Cp, 10);

        const previousArchive1 = checkpoint1Cp.blocks.at(-1)!.archive;
        const checkpoint2Cp = await Checkpoint.random(CheckpointNumber(2), {
          numBlocks: 2,
          startBlockNumber: 3,
          previousArchive: previousArchive1,
        });
        const checkpoint2 = makePublishedCheckpoint(checkpoint2Cp, 11);

        const previousArchive2 = checkpoint2Cp.blocks.at(-1)!.archive;
        const checkpoint3Cp = await Checkpoint.random(CheckpointNumber(3), {
          numBlocks: 2,
          startBlockNumber: 5,
          previousArchive: previousArchive2,
        });
        const checkpoint3 = makePublishedCheckpoint(checkpoint3Cp, 12);

        await store.addCheckpoints([checkpoint1, checkpoint2, checkpoint3]);

        // Unwind checkpoint 3
        await store.unwindCheckpoints(CheckpointNumber(3), 1);

        const checkpoints = await store.getRangeOfCheckpoints(CheckpointNumber(1), 10);
        expect(checkpoints.length).toBe(2);
        expect(checkpoints.map(c => c.checkpointNumber)).toEqual([1, 2]);
      });
    });

    describe('getCheckpointedBlock', () => {
      beforeEach(async () => {
        await store.addCheckpoints(publishedCheckpoints);
      });

      it.each(blockNumberTests)('retrieves previously stored block %i', async (blockNumber, getExpectedBlock) => {
        const retrievedBlock = await store.getCheckpointedBlock(blockNumber);
        const expectedBlock = getExpectedBlock();
        const expectedCheckpoint = publishedCheckpoints[blockNumber - 1];

        expect(retrievedBlock).toBeDefined();
        expectCheckpointedBlockEquals(retrievedBlock!, expectedBlock, expectedCheckpoint);
      });

      it('returns undefined if block is not found', async () => {
        await expect(store.getCheckpointedBlock(12)).resolves.toBeUndefined();
      });

      it('returns undefined for block number 0', async () => {
        await expect(store.getCheckpointedBlock(0)).resolves.toBeUndefined();
      });
    });

    describe('getCheckpointedBlockByHash', () => {
      beforeEach(async () => {
        await store.addCheckpoints(publishedCheckpoints);
      });

      it('retrieves a block by its hash', async () => {
        const expectedCheckpoint = publishedCheckpoints[5];
        const expectedBlock = expectedCheckpoint.checkpoint.blocks[0];
        const blockHash = await expectedBlock.header.hash();
        const retrievedBlock = await store.getCheckpointedBlockByHash(blockHash);

        expect(retrievedBlock).toBeDefined();
        expectCheckpointedBlockEquals(retrievedBlock!, expectedBlock, expectedCheckpoint);
      });

      it('returns undefined for non-existent block hash', async () => {
        const nonExistentHash = Fr.random();
        await expect(store.getCheckpointedBlockByHash(nonExistentHash)).resolves.toBeUndefined();
      });
    });

    describe('getCheckpointedBlockByArchive', () => {
      beforeEach(async () => {
        await store.addCheckpoints(publishedCheckpoints);
      });

      it('retrieves a block by its archive root', async () => {
        const expectedCheckpoint = publishedCheckpoints[3];
        const expectedBlock = expectedCheckpoint.checkpoint.blocks[0];
        const archive = expectedBlock.archive.root;
        const retrievedBlock = await store.getCheckpointedBlockByArchive(archive);

        expect(retrievedBlock).toBeDefined();
        expectCheckpointedBlockEquals(retrievedBlock!, expectedBlock, expectedCheckpoint);
      });

      it('returns undefined for non-existent archive root', async () => {
        const nonExistentArchive = Fr.random();
        await expect(store.getCheckpointedBlockByArchive(nonExistentArchive)).resolves.toBeUndefined();
      });
    });

    describe('getBlockHeaderByHash', () => {
      beforeEach(async () => {
        await store.addCheckpoints(publishedCheckpoints);
      });

      it('retrieves a block header by its hash', async () => {
        const expectedBlock = publishedCheckpoints[7].checkpoint.blocks[0];
        const blockHash = await expectedBlock.header.hash();
        const retrievedHeader = await store.getBlockHeaderByHash(blockHash);

        expect(retrievedHeader).toBeDefined();
        expect(retrievedHeader!.equals(expectedBlock.header)).toBe(true);
      });

      it('returns undefined for non-existent block hash', async () => {
        const nonExistentHash = Fr.random();
        await expect(store.getBlockHeaderByHash(nonExistentHash)).resolves.toBeUndefined();
      });
    });

    describe('getBlockHeaderByArchive', () => {
      beforeEach(async () => {
        await store.addCheckpoints(publishedCheckpoints);
      });

      it('retrieves a block header by its archive root', async () => {
        const expectedBlock = publishedCheckpoints[2].checkpoint.blocks[0];
        const archive = expectedBlock.archive.root;
        const retrievedHeader = await store.getBlockHeaderByArchive(archive);

        expect(retrievedHeader).toBeDefined();
        expect(retrievedHeader!.equals(expectedBlock.header)).toBe(true);
      });

      it('returns undefined for non-existent archive root', async () => {
        const nonExistentArchive = Fr.random();
        await expect(store.getBlockHeaderByArchive(nonExistentArchive)).resolves.toBeUndefined();
      });
    });

    describe('getSynchedCheckpointNumber', () => {
      it('returns the checkpoint number before INITIAL_CHECKPOINT_NUMBER if no checkpoints have been added', async () => {
        await expect(store.getSynchedCheckpointNumber()).resolves.toEqual(INITIAL_CHECKPOINT_NUMBER - 1);
      });

      it('returns the most recently added checkpoint number', async () => {
        await store.addCheckpoints(publishedCheckpoints);
        await expect(store.getSynchedCheckpointNumber()).resolves.toEqual(
          publishedCheckpoints.at(-1)!.checkpoint.number,
        );
      });
    });

    describe('getSynchPoint', () => {
      it('returns undefined if no blocks have been added', async () => {
        await expect(store.getSynchPoint()).resolves.toEqual({
          blocksSynchedTo: undefined,
          messagesSynchedTo: undefined,
        } satisfies ArchiverL1SynchPoint);
      });

      it('returns the L1 block number in which the most recent L2 block was published', async () => {
        await store.addCheckpoints(publishedCheckpoints);
        await expect(store.getSynchPoint()).resolves.toEqual({
          blocksSynchedTo: 19n,
          messagesSynchedTo: undefined,
        } satisfies ArchiverL1SynchPoint);
      });

      it('returns the L1 block number that most recently added messages from inbox', async () => {
        const l1BlockHash = Buffer32.random();
        const l1BlockNumber = 10n;
        await store.setMessageSynchedL1Block({ l1BlockNumber: 5n, l1BlockHash: Buffer32.random() });
        await store.addL1ToL2Messages([makeInboxMessage(Buffer16.ZERO, { l1BlockNumber, l1BlockHash })]);
        await expect(store.getSynchPoint()).resolves.toEqual({
          blocksSynchedTo: undefined,
          messagesSynchedTo: { l1BlockHash, l1BlockNumber },
        } satisfies ArchiverL1SynchPoint);
      });

      it('returns the latest syncpoint if latest message is behind', async () => {
        const l1BlockHash = Buffer32.random();
        const l1BlockNumber = 10n;
        await store.setMessageSynchedL1Block({ l1BlockNumber, l1BlockHash });
        const msg = makeInboxMessage(Buffer16.ZERO, { l1BlockNumber: 5n, l1BlockHash: Buffer32.random() });
        await store.addL1ToL2Messages([msg]);
        await expect(store.getSynchPoint()).resolves.toEqual({
          blocksSynchedTo: undefined,
          messagesSynchedTo: { l1BlockHash, l1BlockNumber },
        } satisfies ArchiverL1SynchPoint);
      });
    });

    describe('addLogs', () => {
      it('adds private & public logs', async () => {
        const checkpoint = publishedCheckpoints[0];
        await store.addCheckpoints([checkpoint]);
        await expect(store.addLogs(checkpoint.checkpoint.blocks)).resolves.toEqual(true);
      });
    });

    it('deleteLogs', async () => {
      const block = publishedCheckpoints[0].checkpoint.blocks[0];
      await store.addBlocks([block]);
      await expect(store.addLogs([block])).resolves.toEqual(true);

      expect((await store.getPublicLogs({ fromBlock: BlockNumber(1) })).logs.length).toEqual(
        block.body.txEffects.map(txEffect => txEffect.publicLogs).flat().length,
      );

      // This one is a pain for memory as we would never want to just delete memory in the middle.
      await store.deleteLogs([block]);

      expect((await store.getPublicLogs({ fromBlock: BlockNumber(1) })).logs.length).toEqual(0);
    });

    describe('getTxEffect', () => {
      const getBlock = (i: number) => publishedCheckpoints[i].checkpoint.blocks[0];

      beforeEach(async () => {
        await store.addLogs(publishedCheckpoints.flatMap(x => x.checkpoint.blocks));
        await store.addCheckpoints(publishedCheckpoints);
      });

      it.each([
        () => ({ data: getBlock(0).body.txEffects[0], block: getBlock(0), txIndexInBlock: 0 }),
        () => ({ data: getBlock(9).body.txEffects[3], block: getBlock(9), txIndexInBlock: 3 }),
        () => ({ data: getBlock(3).body.txEffects[1], block: getBlock(3), txIndexInBlock: 1 }),
        () => ({ data: getBlock(5).body.txEffects[2], block: getBlock(5), txIndexInBlock: 2 }),
        () => ({ data: getBlock(1).body.txEffects[0], block: getBlock(1), txIndexInBlock: 0 }),
      ])('retrieves a previously stored transaction', async getExpectedTx => {
        const { data, block, txIndexInBlock } = getExpectedTx();
        const expectedTx: IndexedTxEffect = {
          data,
          l2BlockNumber: block.number,
          l2BlockHash: L2BlockHash.fromField(await block.header.hash()),
          txIndexInBlock,
        };
        const actualTx = await store.getTxEffect(data.txHash);
        expect(actualTx).toEqual(expectedTx);
      });

      it('returns undefined if tx is not found', async () => {
        await expect(store.getTxEffect(TxHash.random())).resolves.toBeUndefined();
      });

      it.each([
        () => getBlock(0).body.txEffects[0],
        () => getBlock(9).body.txEffects[3],
        () => getBlock(3).body.txEffects[1],
        () => getBlock(5).body.txEffects[2],
        () => getBlock(1).body.txEffects[0],
      ])('tries to retrieves a previously stored transaction after deleted', async getTxEffect => {
        await store.unwindCheckpoints(CheckpointNumber(publishedCheckpoints.length), publishedCheckpoints.length);

        const txEffect = getTxEffect();
        const actualTx = await store.getTxEffect(txEffect.txHash);
        expect(actualTx).toEqual(undefined);
      });

      it('returns undefined if tx is not found', async () => {
        await expect(store.getTxEffect(TxHash.random())).resolves.toBeUndefined();
      });

      it('does not fail if the block is unwound while requesting a tx', async () => {
        const txEffect = getBlock(1).body.txEffects[0];
        let done = false;
        void (async () => {
          while (!done) {
            void store.getTxEffect(txEffect.txHash);
            await sleep(1);
          }
        })();
        await store.unwindCheckpoints(CheckpointNumber(publishedCheckpoints.length), publishedCheckpoints.length);
        done = true;
        expect(await store.getTxEffect(txEffect.txHash)).toEqual(undefined);
      });
    });

    describe('L1 to L2 Messages', () => {
      const initialCheckpointNumber = CheckpointNumber(13);

      const checkMessages = async (msgs: InboxMessage[]) => {
        expect(await store.getLastL1ToL2Message()).toEqual(msgs.at(-1));
        expect(await toArray(store.iterateL1ToL2Messages())).toEqual(msgs);
        expect(await store.getTotalL1ToL2MessageCount()).toEqual(BigInt(msgs.length));
      };

      const makeInboxMessagesWithFullBlocks = (
        blockCount: number,
        opts: { initialCheckpointNumber?: CheckpointNumber } = {},
      ) =>
        makeInboxMessages(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP * blockCount, {
          overrideFn: (msg, i) => {
            const checkpointNumber = CheckpointNumber(
              (opts.initialCheckpointNumber ?? initialCheckpointNumber) +
                Math.floor(i / NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP),
            );
            const index =
              InboxLeaf.smallestIndexForCheckpoint(checkpointNumber) + BigInt(i % NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP);
            return { ...msg, checkpointNumber, index };
          },
        });

      it('stores first message ever', async () => {
        const msg = makeInboxMessage(Buffer16.ZERO, { index: 0n, checkpointNumber: CheckpointNumber(1) });
        await store.addL1ToL2Messages([msg]);

        await checkMessages([msg]);
        expect(await store.getL1ToL2Messages(CheckpointNumber(1))).toEqual([msg.leaf]);
      });

      it('stores single message', async () => {
        const msg = makeInboxMessage(Buffer16.ZERO, { checkpointNumber: CheckpointNumber(2) });
        await store.addL1ToL2Messages([msg]);

        await checkMessages([msg]);
        expect(await store.getL1ToL2Messages(CheckpointNumber(2))).toEqual([msg.leaf]);
      });

      it('stores and returns messages across different blocks', async () => {
        const msgs = makeInboxMessages(5, { initialCheckpointNumber });
        await store.addL1ToL2Messages(msgs);

        await checkMessages(msgs);
        expect(await store.getL1ToL2Messages(CheckpointNumber(initialCheckpointNumber + 2))).toEqual(
          [msgs[2]].map(m => m.leaf),
        );
      });

      it('stores the same messages again', async () => {
        const msgs = makeInboxMessages(5, { initialCheckpointNumber });
        await store.addL1ToL2Messages(msgs);
        await store.addL1ToL2Messages(msgs.slice(2));

        await checkMessages(msgs);
      });

      it('stores and returns messages across different blocks with gaps', async () => {
        const msgs1 = makeInboxMessages(3, { initialCheckpointNumber: CheckpointNumber(1) });
        const msgs2 = makeInboxMessages(3, {
          initialCheckpointNumber: CheckpointNumber(20),
          initialHash: msgs1.at(-1)!.rollingHash,
        });

        await store.addL1ToL2Messages(msgs1);
        await store.addL1ToL2Messages(msgs2);

        await checkMessages([...msgs1, ...msgs2]);

        expect(await store.getL1ToL2Messages(CheckpointNumber(1))).toEqual([msgs1[0].leaf]);
        expect(await store.getL1ToL2Messages(CheckpointNumber(4))).toEqual([]);
        expect(await store.getL1ToL2Messages(CheckpointNumber(20))).toEqual([msgs2[0].leaf]);
        expect(await store.getL1ToL2Messages(CheckpointNumber(24))).toEqual([]);
      });

      it('stores and returns messages with block numbers larger than a byte', async () => {
        const msgs = makeInboxMessages(5, { initialCheckpointNumber: CheckpointNumber(1000) });
        await store.addL1ToL2Messages(msgs);

        await checkMessages(msgs);
        expect(await store.getL1ToL2Messages(CheckpointNumber(1002))).toEqual([msgs[2]].map(m => m.leaf));
      });

      it('stores and returns multiple messages per block', async () => {
        const msgs = makeInboxMessagesWithFullBlocks(4);
        await store.addL1ToL2Messages(msgs);

        await checkMessages(msgs);
        const blockMessages = await store.getL1ToL2Messages(CheckpointNumber(initialCheckpointNumber + 1));
        expect(blockMessages).toHaveLength(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP);
        expect(blockMessages).toEqual(
          msgs.slice(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP * 2).map(m => m.leaf),
        );
      });

      it('stores messages in multiple operations', async () => {
        const msgs = makeInboxMessages(20, { initialCheckpointNumber });
        await store.addL1ToL2Messages(msgs.slice(0, 10));
        await store.addL1ToL2Messages(msgs.slice(10, 20));

        expect(await store.getL1ToL2Messages(CheckpointNumber(initialCheckpointNumber + 2))).toEqual(
          [msgs[2]].map(m => m.leaf),
        );
        expect(await store.getL1ToL2Messages(CheckpointNumber(initialCheckpointNumber + 12))).toEqual(
          [msgs[12]].map(m => m.leaf),
        );
        await checkMessages(msgs);
      });

      it('iterates over messages from start index', async () => {
        const msgs = makeInboxMessages(10, { initialCheckpointNumber });
        await store.addL1ToL2Messages(msgs);

        const iterated = await toArray(store.iterateL1ToL2Messages({ start: msgs[3].index }));
        expect(iterated).toEqual(msgs.slice(3));
      });

      it('iterates over messages in reverse', async () => {
        const msgs = makeInboxMessages(10, { initialCheckpointNumber });
        await store.addL1ToL2Messages(msgs);
        initialCheckpointNumber;

        const iterated = await toArray(store.iterateL1ToL2Messages({ reverse: true, end: msgs[3].index }));
        expect(iterated).toEqual(msgs.slice(0, 4).reverse());
      });

      it('throws if messages are added out of order', async () => {
        const msgs = makeInboxMessages(5, { overrideFn: (msg, i) => ({ ...msg, index: BigInt(10 - i) }) });
        await expect(store.addL1ToL2Messages(msgs)).rejects.toThrow(MessageStoreError);
      });

      it('throws if block number for the first message is out of order', async () => {
        const msgs = makeInboxMessages(4, { initialCheckpointNumber });
        msgs[2].checkpointNumber = CheckpointNumber(initialCheckpointNumber - 1);
        await store.addL1ToL2Messages(msgs.slice(0, 2));
        await expect(store.addL1ToL2Messages(msgs.slice(2, 4))).rejects.toThrow(MessageStoreError);
      });

      it('throws if rolling hash is not correct', async () => {
        const msgs = makeInboxMessages(5);
        msgs[1].rollingHash = Buffer16.random();
        await expect(store.addL1ToL2Messages(msgs)).rejects.toThrow(MessageStoreError);
      });

      it('throws if rolling hash for first message is not correct', async () => {
        const msgs = makeInboxMessages(4);
        msgs[2].rollingHash = Buffer16.random();
        await store.addL1ToL2Messages(msgs.slice(0, CheckpointNumber(2)));
        await expect(store.addL1ToL2Messages(msgs.slice(2, 4))).rejects.toThrow(MessageStoreError);
      });

      it('throws if index is not in the correct range', async () => {
        const msgs = makeInboxMessages(5, { initialCheckpointNumber });
        msgs.at(-1)!.index += 100n;
        await expect(store.addL1ToL2Messages(msgs)).rejects.toThrow(MessageStoreError);
      });

      it('throws if first index in block has gaps', async () => {
        const msgs = makeInboxMessages(4, { initialCheckpointNumber });
        msgs[2].index++;
        await expect(store.addL1ToL2Messages(msgs)).rejects.toThrow(MessageStoreError);
      });

      it('throws if index does not follow previous one', async () => {
        const msgs = makeInboxMessages(2, {
          initialCheckpointNumber,
          overrideFn: (msg, i) => ({
            ...msg,
            checkpointNumber: CheckpointNumber(2),
            index: BigInt(i + NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP * 2),
          }),
        });
        msgs[1].index++;
        await expect(store.addL1ToL2Messages(msgs)).rejects.toThrow(MessageStoreError);
      });

      it('removes messages up to the given block number', async () => {
        const msgs = makeInboxMessagesWithFullBlocks(4, { initialCheckpointNumber: CheckpointNumber(1) });

        await store.addL1ToL2Messages(msgs);
        await checkMessages(msgs);

        expect(await store.getL1ToL2Messages(CheckpointNumber(1))).toHaveLength(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP);
        expect(await store.getL1ToL2Messages(CheckpointNumber(2))).toHaveLength(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP);
        expect(await store.getL1ToL2Messages(CheckpointNumber(3))).toHaveLength(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP);
        expect(await store.getL1ToL2Messages(CheckpointNumber(4))).toHaveLength(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP);

        await store.rollbackL1ToL2MessagesToCheckpoint(CheckpointNumber(2));

        expect(await store.getL1ToL2Messages(CheckpointNumber(1))).toHaveLength(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP);
        expect(await store.getL1ToL2Messages(CheckpointNumber(2))).toHaveLength(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP);
        expect(await store.getL1ToL2Messages(CheckpointNumber(3))).toHaveLength(0);
        expect(await store.getL1ToL2Messages(CheckpointNumber(4))).toHaveLength(0);

        await checkMessages(msgs.slice(0, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP * 2));
      });

      it('removes messages starting with the given index', async () => {
        const msgs = makeInboxMessagesWithFullBlocks(4, { initialCheckpointNumber: CheckpointNumber(1) });
        await store.addL1ToL2Messages(msgs);

        await store.removeL1ToL2Messages(msgs[13].index);
        await checkMessages(msgs.slice(0, 13));
      });
    });

    describe('contractInstances', () => {
      let contractInstance: ContractInstanceWithAddress;
      const blockNum = 10;
      const timestamp = 3600n;

      beforeEach(async () => {
        const classId = Fr.random();
        const randomInstance = await SerializableContractInstance.random({
          currentContractClassId: classId,
          originalContractClassId: classId,
        });
        contractInstance = { ...randomInstance, address: await AztecAddress.random() };
        await store.addContractInstances([contractInstance], BlockNumber(blockNum));
      });

      it('returns previously stored contract instances', async () => {
        await expect(store.getContractInstance(contractInstance.address, timestamp)).resolves.toMatchObject(
          contractInstance,
        );
      });

      it('returns undefined if contract instance is not found', async () => {
        await expect(store.getContractInstance(await AztecAddress.random(), timestamp)).resolves.toBeUndefined();
      });

      it('returns undefined if previously stored contract instances was deleted', async () => {
        await store.deleteContractInstances([contractInstance], BlockNumber(blockNum));
        await expect(store.getContractInstance(contractInstance.address, timestamp)).resolves.toBeUndefined();
      });
    });

    describe('contractInstanceUpdates', () => {
      let contractInstance: ContractInstanceWithAddress;
      let classId: Fr;
      let nextClassId: Fr;
      const timestampOfChange = 3600n;

      beforeEach(async () => {
        classId = Fr.random();
        nextClassId = Fr.random();
        const randomInstance = await SerializableContractInstance.random({
          currentContractClassId: classId,
          originalContractClassId: classId,
        });
        contractInstance = { ...randomInstance, address: await AztecAddress.random() };
        await store.addContractInstances([contractInstance], BlockNumber(1));
        await store.addContractInstanceUpdates(
          [
            {
              prevContractClassId: classId,
              newContractClassId: nextClassId,
              timestampOfChange,
              address: contractInstance.address,
            },
          ],
          timestampOfChange - 1n,
        );
      });

      it('gets the correct current class id for a contract not updated yet', async () => {
        const fetchedInstance = await store.getContractInstance(contractInstance.address, timestampOfChange - 1n);
        expect(fetchedInstance?.originalContractClassId).toEqual(classId);
        expect(fetchedInstance?.currentContractClassId).toEqual(classId);
      });

      it('gets the correct current class id for a contract that has just been updated', async () => {
        const fetchedInstance = await store.getContractInstance(contractInstance.address, timestampOfChange);
        expect(fetchedInstance?.originalContractClassId).toEqual(classId);
        expect(fetchedInstance?.currentContractClassId).toEqual(nextClassId);
      });

      it('gets the correct current class id for a contract that was updated in the past', async () => {
        const fetchedInstance = await store.getContractInstance(contractInstance.address, timestampOfChange + 1n);
        expect(fetchedInstance?.originalContractClassId).toEqual(classId);
        expect(fetchedInstance?.currentContractClassId).toEqual(nextClassId);
      });

      it('ignores updates for the wrong contract', async () => {
        const otherClassId = Fr.random();
        const randomInstance = await SerializableContractInstance.random({
          currentContractClassId: otherClassId,
          originalContractClassId: otherClassId,
        });
        const otherContractInstance = {
          ...randomInstance,
          address: await AztecAddress.random(),
        };
        await store.addContractInstances([otherContractInstance], BlockNumber(1));

        const fetchedInstance = await store.getContractInstance(otherContractInstance.address, timestampOfChange + 1n);
        expect(fetchedInstance?.originalContractClassId).toEqual(otherClassId);
        expect(fetchedInstance?.currentContractClassId).toEqual(otherClassId);
      });

      it('bounds its search to the right contract if more than than one update exists', async () => {
        const otherClassId = Fr.random();
        const otherNextClassId = Fr.random();
        const randomInstance = await SerializableContractInstance.random({
          currentContractClassId: otherClassId,
          originalContractClassId: otherNextClassId,
        });
        const otherContractInstance = {
          ...randomInstance,
          address: await AztecAddress.random(),
        };
        await store.addContractInstances([otherContractInstance], BlockNumber(1));
        await store.addContractInstanceUpdates(
          [
            {
              prevContractClassId: otherClassId,
              newContractClassId: otherNextClassId,
              timestampOfChange,
              address: otherContractInstance.address,
            },
          ],
          timestampOfChange - 1n,
        );

        const fetchedInstance = await store.getContractInstance(contractInstance.address, timestampOfChange + 1n);
        expect(fetchedInstance?.originalContractClassId).toEqual(classId);
        expect(fetchedInstance?.currentContractClassId).toEqual(nextClassId);
      });
    });

    describe('contractClasses', () => {
      let contractClass: ContractClassPublic;
      const blockNum = 10;

      beforeEach(async () => {
        contractClass = await makeContractClassPublic();
        await store.addContractClasses(
          [contractClass],
          [await computePublicBytecodeCommitment(contractClass.packedBytecode)],
          BlockNumber(blockNum),
        );
      });

      it('returns previously stored contract class', async () => {
        await expect(store.getContractClass(contractClass.id)).resolves.toMatchObject(contractClass);
      });

      it('returns undefined if the initial deployed contract class was deleted', async () => {
        await store.deleteContractClasses([contractClass], BlockNumber(blockNum));
        await expect(store.getContractClass(contractClass.id)).resolves.toBeUndefined();
      });

      it('returns contract class if later "deployment" class was deleted', async () => {
        await store.addContractClasses(
          [contractClass],
          [await computePublicBytecodeCommitment(contractClass.packedBytecode)],
          BlockNumber(blockNum + 1),
        );
        await store.deleteContractClasses([contractClass], BlockNumber(blockNum + 1));
        await expect(store.getContractClass(contractClass.id)).resolves.toMatchObject(contractClass);
      });

      it('returns undefined if contract class is not found', async () => {
        await expect(store.getContractClass(Fr.random())).resolves.toBeUndefined();
      });

      it('adds new private functions', async () => {
        const fns = times(3, makeExecutablePrivateFunctionWithMembershipProof);
        await store.addFunctions(contractClass.id, fns, []);
        const stored = await store.getContractClass(contractClass.id);
        expect(stored?.privateFunctions).toEqual(fns);
      });

      it('does not duplicate private functions', async () => {
        const fns = times(3, makeExecutablePrivateFunctionWithMembershipProof);
        await store.addFunctions(contractClass.id, fns.slice(0, 1), []);
        await store.addFunctions(contractClass.id, fns, []);
        const stored = await store.getContractClass(contractClass.id);
        expect(stored?.privateFunctions).toEqual(fns);
      });

      it('adds new utility functions', async () => {
        const fns = times(3, makeUtilityFunctionWithMembershipProof);
        await store.addFunctions(contractClass.id, [], fns);
        const stored = await store.getContractClass(contractClass.id);
        expect(stored?.utilityFunctions).toEqual(fns);
      });

      it('does not duplicate utility functions', async () => {
        const fns = times(3, makeUtilityFunctionWithMembershipProof);
        await store.addFunctions(contractClass.id, [], fns.slice(0, 1));
        await store.addFunctions(contractClass.id, [], fns);
        const stored = await store.getContractClass(contractClass.id);
        expect(stored?.utilityFunctions).toEqual(fns);
      });
    });

    describe('getPrivateLogsByTags', () => {
      const numBlocksForLogs = 3;
      const numTxsPerBlock = 4;
      const numPrivateLogsPerTx = 3;

      let logsCheckpoints: PublishedCheckpoint[];

      const makePrivateLogTag = (blockNumber: number, txIndex: number, logIndex: number): SiloedTag =>
        new SiloedTag(
          blockNumber === 1 && txIndex === 0 && logIndex === 0
            ? Fr.ZERO // Shared tag
            : new Fr(blockNumber * 100 + txIndex * 10 + logIndex),
        );

      const makePrivateLog = (tag: SiloedTag) =>
        PrivateLog.from({
          fields: makeTuple(PRIVATE_LOG_SIZE_IN_FIELDS, i =>
            !i ? tag.value : new Fr(tag.value.toBigInt() + BigInt(i)),
          ),
          emittedLength: PRIVATE_LOG_SIZE_IN_FIELDS,
        });

      const mockPrivateLogs = (blockNumber: number, txIndex: number) => {
        return times(numPrivateLogsPerTx, (logIndex: number) => {
          const tag = makePrivateLogTag(blockNumber, txIndex, logIndex);
          return makePrivateLog(tag);
        });
      };

      const mockCheckpointWithLogs = async (
        blockNumber: number,
        previousArchive?: AppendOnlyTreeSnapshot,
      ): Promise<PublishedCheckpoint> => {
        const block = await L2BlockNew.random(BlockNumber(blockNumber), {
          checkpointNumber: CheckpointNumber(blockNumber),
          indexWithinCheckpoint: 0,
          state: makeStateForBlock(blockNumber, numTxsPerBlock),
          ...(previousArchive ? { lastArchive: previousArchive } : {}),
        });
        block.header.globalVariables.blockNumber = BlockNumber(blockNumber);

        block.body.txEffects = await timesParallel(numTxsPerBlock, async (txIndex: number) => {
          const txEffect = await TxEffect.random();
          txEffect.privateLogs = mockPrivateLogs(blockNumber, txIndex);
          txEffect.publicLogs = []; // No public logs needed for private log tests
          return txEffect;
        });

        const checkpoint = new Checkpoint(
          AppendOnlyTreeSnapshot.random(),
          CheckpointHeader.random(),
          [block],
          CheckpointNumber(blockNumber),
        );
        return makePublishedCheckpoint(checkpoint, blockNumber);
      };

      beforeEach(async () => {
        // Create checkpoints sequentially to chain archive roots
        logsCheckpoints = [];
        for (let i = 0; i < numBlocksForLogs; i++) {
          const previousArchive = i > 0 ? logsCheckpoints[i - 1].checkpoint.blocks[0].archive : undefined;
          logsCheckpoints.push(await mockCheckpointWithLogs(i + 1, previousArchive));
        }

        await store.addCheckpoints(logsCheckpoints);
        await store.addLogs(logsCheckpoints.flatMap(p => p.checkpoint.blocks));
      });

      it('is possible to batch request private logs via tags', async () => {
        const tags = [makePrivateLogTag(2, 1, 2), makePrivateLogTag(1, 2, 0)];

        const logsByTags = await store.getPrivateLogsByTags(tags);

        expect(logsByTags).toEqual([
          [
            expect.objectContaining({
              blockNumber: 2,
              logData: makePrivateLog(tags[0]).getEmittedFields(),
            }),
          ],
          [
            expect.objectContaining({
              blockNumber: 1,
              logData: makePrivateLog(tags[1]).getEmittedFields(),
            }),
          ],
        ]);
      });

      it('is possible to batch request logs that have the same tag but different content', async () => {
        const tags = [makePrivateLogTag(1, 2, 1)];

        // Create a checkpoint containing logs that have the same tag as the checkpoints before.
        // Chain from the last checkpoint's archive
        const newBlockNumber = numBlocksForLogs + 1;
        const previousArchive = logsCheckpoints[logsCheckpoints.length - 1].checkpoint.blocks[0].archive;
        const newCheckpoint = await mockCheckpointWithLogs(newBlockNumber, previousArchive);
        const newLog = newCheckpoint.checkpoint.blocks[0].body.txEffects[1].privateLogs[1];
        newLog.fields[0] = tags[0].value;
        newCheckpoint.checkpoint.blocks[0].body.txEffects[1].privateLogs[1] = newLog;
        await store.addCheckpoints([newCheckpoint]);
        await store.addLogs([newCheckpoint.checkpoint.blocks[0]]);

        const logsByTags = await store.getPrivateLogsByTags(tags);

        expect(logsByTags).toEqual([
          [
            expect.objectContaining({
              blockNumber: 1,
              logData: makePrivateLog(tags[0]).getEmittedFields(),
            }),
            expect.objectContaining({
              blockNumber: newBlockNumber,
              logData: newLog.getEmittedFields(),
            }),
          ],
        ]);
      });

      it('is possible to request logs for non-existing tags and determine their position', async () => {
        const tags = [makePrivateLogTag(99, 88, 77), makePrivateLogTag(1, 1, 1)];

        const logsByTags = await store.getPrivateLogsByTags(tags);

        expect(logsByTags).toEqual([
          [
            // No logs for the first tag.
          ],
          [
            expect.objectContaining({
              blockNumber: 1,
              logData: makePrivateLog(tags[1]).getEmittedFields(),
            }),
          ],
        ]);
      });
    });

    describe('getPublicLogsByTagsFromContract', () => {
      const numBlocksForLogs = 3;
      const numTxsPerBlock = 4;
      const numPublicLogsPerTx = 2;
      const contractAddress = AztecAddress.fromNumber(543254);

      let logsCheckpoints: PublishedCheckpoint[];

      const makePublicLogTag = (blockNumber: number, txIndex: number, logIndex: number): Tag =>
        new Tag(
          blockNumber === 1 && txIndex === 0 && logIndex === 0
            ? Fr.ZERO // Shared tag
            : new Fr((blockNumber * 100 + txIndex * 10 + logIndex) * 123),
        );

      const makePublicLog = (tag: Tag) =>
        PublicLog.from({
          contractAddress: contractAddress,
          // Arbitrary length
          fields: new Array(10).fill(null).map((_, i) => (!i ? tag.value : new Fr(tag.value.toBigInt() + BigInt(i)))),
        });

      const mockPublicLogs = (blockNumber: number, txIndex: number) => {
        return times(numPublicLogsPerTx, (logIndex: number) => {
          const tag = makePublicLogTag(blockNumber, txIndex, logIndex);
          return makePublicLog(tag);
        });
      };

      const mockCheckpointWithLogs = async (
        blockNumber: number,
        previousArchive?: AppendOnlyTreeSnapshot,
      ): Promise<PublishedCheckpoint> => {
        const block = await L2BlockNew.random(BlockNumber(blockNumber), {
          checkpointNumber: CheckpointNumber(blockNumber),
          indexWithinCheckpoint: 0,
          state: makeStateForBlock(blockNumber, numTxsPerBlock),
          ...(previousArchive ? { lastArchive: previousArchive } : {}),
        });
        block.header.globalVariables.blockNumber = BlockNumber(blockNumber);

        block.body.txEffects = await timesParallel(numTxsPerBlock, async (txIndex: number) => {
          const txEffect = await TxEffect.random();
          txEffect.privateLogs = []; // No private logs needed for public log tests
          txEffect.publicLogs = mockPublicLogs(blockNumber, txIndex);
          return txEffect;
        });

        const checkpoint = new Checkpoint(
          AppendOnlyTreeSnapshot.random(),
          CheckpointHeader.random(),
          [block],
          CheckpointNumber(blockNumber),
        );
        return makePublishedCheckpoint(checkpoint, blockNumber);
      };

      beforeEach(async () => {
        // Create checkpoints sequentially to chain archive roots
        logsCheckpoints = [];
        for (let i = 0; i < numBlocksForLogs; i++) {
          const previousArchive = i > 0 ? logsCheckpoints[i - 1].checkpoint.blocks[0].archive : undefined;
          logsCheckpoints.push(await mockCheckpointWithLogs(i + 1, previousArchive));
        }

        await store.addCheckpoints(logsCheckpoints);
        await store.addLogs(logsCheckpoints.flatMap(p => p.checkpoint.blocks));
      });

      it('is possible to batch request public logs via tags', async () => {
        const tags = [makePublicLogTag(2, 1, 1), makePublicLogTag(1, 2, 0)];

        const logsByTags = await store.getPublicLogsByTagsFromContract(contractAddress, tags);

        expect(logsByTags).toEqual([
          [
            expect.objectContaining({
              blockNumber: 2,
              logData: makePublicLog(tags[0]).getEmittedFields(),
            }),
          ],
          [
            expect.objectContaining({
              blockNumber: 1,
              logData: makePublicLog(tags[1]).getEmittedFields(),
            }),
          ],
        ]);
      });

      it('is possible to batch request logs that have the same tag but different content', async () => {
        const tags = [makePublicLogTag(1, 2, 1)];

        // Create a checkpoint containing logs that have the same tag as the checkpoints before.
        // Chain from the last checkpoint's archive
        const newBlockNumber = numBlocksForLogs + 1;
        const previousArchive = logsCheckpoints[logsCheckpoints.length - 1].checkpoint.blocks[0].archive;
        const newCheckpoint = await mockCheckpointWithLogs(newBlockNumber, previousArchive);
        const newLog = newCheckpoint.checkpoint.blocks[0].body.txEffects[1].publicLogs[1];
        newLog.fields[0] = tags[0].value;
        newCheckpoint.checkpoint.blocks[0].body.txEffects[1].publicLogs[1] = newLog;
        await store.addCheckpoints([newCheckpoint]);
        await store.addLogs([newCheckpoint.checkpoint.blocks[0]]);

        const logsByTags = await store.getPublicLogsByTagsFromContract(contractAddress, tags);

        expect(logsByTags).toEqual([
          [
            expect.objectContaining({
              blockNumber: 1,
              logData: makePublicLog(tags[0]).getEmittedFields(),
            }),
            expect.objectContaining({
              blockNumber: newBlockNumber,
              logData: newLog.getEmittedFields(),
            }),
          ],
        ]);
      });

      it('is possible to request logs for non-existing tags and determine their position', async () => {
        const tags = [makePublicLogTag(99, 88, 77), makePublicLogTag(1, 1, 0)];

        const logsByTags = await store.getPublicLogsByTagsFromContract(contractAddress, tags);

        expect(logsByTags).toEqual([
          [
            // No logs for the first tag.
          ],
          [
            expect.objectContaining({
              blockNumber: 1,
              logData: makePublicLog(tags[1]).getEmittedFields(),
            }),
          ],
        ]);
      });
    });

    describe('getPublicLogs', () => {
      const numBlocksForPublicLogs = 10;

      // Helper to get total public logs per tx from a block
      const getPublicLogsPerTx = (block: L2BlockNew, txIndex: number) =>
        block.body.txEffects[txIndex].publicLogs.length;

      // Helper to get number of txs in a block
      const getTxsPerBlock = (block: L2BlockNew) => block.body.txEffects.length;

      beforeEach(async () => {
        // Use the outer publishedCheckpoints for log tests
        for (let i = 0; i < numBlocksForPublicLogs; i++) {
          await store.addCheckpoints([publishedCheckpoints[i]]);
          await store.addLogs(publishedCheckpoints[i].checkpoint.blocks);
        }
      });

      it('no logs returned if deleted ("txHash" filter param is respected variant)', async () => {
        // get random tx
        const targetBlockIndex = randomInt(numBlocksForPublicLogs);
        const targetBlock = publishedCheckpoints[targetBlockIndex].checkpoint.blocks[0];
        const targetTxIndex = randomInt(getTxsPerBlock(targetBlock));
        const targetTxHash = targetBlock.body.txEffects[targetTxIndex].txHash;

        await Promise.all([
          store.unwindCheckpoints(CheckpointNumber(numBlocksForPublicLogs), numBlocksForPublicLogs),
          store.deleteLogs(publishedCheckpoints.slice(0, numBlocksForPublicLogs).flatMap(b => b.checkpoint.blocks)),
        ]);

        const response = await store.getPublicLogs({ txHash: targetTxHash });
        const logs = response.logs;

        expect(response.maxLogsHit).toBeFalsy();
        expect(logs.length).toEqual(0);
      });

      it('"txHash" filter param is respected', async () => {
        // get random tx
        const targetBlockIndex = randomInt(numBlocksForPublicLogs);
        const targetBlock = publishedCheckpoints[targetBlockIndex].checkpoint.blocks[0];
        const targetTxIndex = randomInt(getTxsPerBlock(targetBlock));
        const targetTxHash = targetBlock.body.txEffects[targetTxIndex].txHash;

        const response = await store.getPublicLogs({ txHash: targetTxHash });
        const logs = response.logs;

        expect(response.maxLogsHit).toBeFalsy();

        const expectedNumLogs = getPublicLogsPerTx(targetBlock, targetTxIndex);
        expect(logs.length).toEqual(expectedNumLogs);

        const targeBlockNumber = targetBlockIndex + INITIAL_L2_BLOCK_NUM;
        for (const log of logs) {
          expect(log.id.blockNumber).toEqual(targeBlockNumber);
          expect(log.id.txIndex).toEqual(targetTxIndex);
        }
      });

      it('returns block hash on public log ids', async () => {
        const targetBlock = publishedCheckpoints[0].checkpoint.blocks[0];
        const expectedBlockHash = L2BlockHash.fromField(await targetBlock.header.hash());

        const logs = (await store.getPublicLogs({ fromBlock: targetBlock.number, toBlock: targetBlock.number + 1 }))
          .logs;

        expect(logs.length).toBeGreaterThan(0);
        expect(logs.every(log => log.id.blockHash.equals(expectedBlockHash))).toBe(true);
      });

      it('"fromBlock" and "toBlock" filter params are respected', async () => {
        // Set "fromBlock" and "toBlock"
        const fromBlock = 3;
        const toBlock = 7;

        const response = await store.getPublicLogs({ fromBlock, toBlock });
        const logs = response.logs;

        expect(response.maxLogsHit).toBeFalsy();

        // Compute expected logs from the blocks in range
        let expectedNumLogs = 0;
        for (let i = fromBlock - 1; i < toBlock - 1; i++) {
          const block = publishedCheckpoints[i].checkpoint.blocks[0];
          expectedNumLogs += block.body.txEffects.reduce((sum, tx) => sum + tx.publicLogs.length, 0);
        }
        expect(logs.length).toEqual(expectedNumLogs);

        for (const log of logs) {
          const blockNumber = log.id.blockNumber;
          expect(blockNumber).toBeGreaterThanOrEqual(fromBlock);
          expect(blockNumber).toBeLessThan(toBlock);
        }
      });

      it('"contractAddress" filter param is respected', async () => {
        // Get a random contract address from the logs
        const targetBlockIndex = randomInt(numBlocksForPublicLogs);
        const targetBlock = publishedCheckpoints[targetBlockIndex].checkpoint.blocks[0];
        const targetTxIndex = randomInt(getTxsPerBlock(targetBlock));
        const targetLogIndex = randomInt(getPublicLogsPerTx(targetBlock, targetTxIndex));
        const targetContractAddress =
          targetBlock.body.txEffects[targetTxIndex].publicLogs[targetLogIndex].contractAddress;

        const response = await store.getPublicLogs({ contractAddress: targetContractAddress });

        expect(response.maxLogsHit).toBeFalsy();

        for (const extendedLog of response.logs) {
          expect(extendedLog.log.contractAddress.equals(targetContractAddress)).toBeTruthy();
        }
      });

      it('"afterLog" filter param is respected', async () => {
        // Get a random log as reference
        const targetBlockIndex = randomInt(numBlocksForPublicLogs);
        const targetBlock = publishedCheckpoints[targetBlockIndex].checkpoint.blocks[0];
        const targetTxIndex = randomInt(getTxsPerBlock(targetBlock));
        const numLogsInTx = targetBlock.body.txEffects[targetTxIndex].publicLogs.length;
        const targetLogIndex = numLogsInTx > 0 ? randomInt(numLogsInTx) : 0;
        const targetBlockHash = L2BlockHash.fromField(await targetBlock.header.hash());

        const afterLog = new LogId(
          BlockNumber(targetBlockIndex + INITIAL_L2_BLOCK_NUM),
          targetBlockHash,
          targetTxIndex,
          targetLogIndex,
        );

        const response = await store.getPublicLogs({ afterLog });
        const logs = response.logs;

        expect(response.maxLogsHit).toBeFalsy();

        for (const log of logs) {
          const logId = log.id;
          expect(logId.blockNumber).toBeGreaterThanOrEqual(afterLog.blockNumber);
          if (logId.blockNumber === afterLog.blockNumber) {
            expect(logId.txIndex).toBeGreaterThanOrEqual(afterLog.txIndex);
            if (logId.txIndex === afterLog.txIndex) {
              expect(logId.logIndex).toBeGreaterThan(afterLog.logIndex);
            }
          }
        }
      });

      it('"txHash" filter param is ignored when "afterLog" is set', async () => {
        // Get random txHash
        const txHash = TxHash.random();
        const afterLog = new LogId(BlockNumber(1), L2BlockHash.random(), 0, 0);

        const response = await store.getPublicLogs({ txHash, afterLog });
        expect(response.logs.length).toBeGreaterThan(1);
      });

      it('intersecting works', async () => {
        let logs = (await store.getPublicLogs({ fromBlock: -10 as BlockNumber, toBlock: -5 as BlockNumber })).logs;
        expect(logs.length).toBe(0);

        // "fromBlock" gets correctly trimmed to range and "toBlock" is exclusive
        logs = (await store.getPublicLogs({ fromBlock: -10 as BlockNumber, toBlock: BlockNumber(5) })).logs;
        let blockNumbers = new Set(logs.map(log => log.id.blockNumber));
        expect(blockNumbers).toEqual(new Set([1, 2, 3, 4]));

        // "toBlock" should be exclusive
        logs = (await store.getPublicLogs({ fromBlock: BlockNumber(1), toBlock: BlockNumber(1) })).logs;
        expect(logs.length).toBe(0);

        logs = (await store.getPublicLogs({ fromBlock: BlockNumber(10), toBlock: BlockNumber(5) })).logs;
        expect(logs.length).toBe(0);

        // both "fromBlock" and "toBlock" get correctly capped to range and logs from all blocks are returned
        logs = (await store.getPublicLogs({ fromBlock: -100 as BlockNumber, toBlock: +100 })).logs;
        blockNumbers = new Set(logs.map(log => log.id.blockNumber));
        expect(blockNumbers.size).toBe(numBlocksForPublicLogs);

        // intersecting with "afterLog" works
        logs = (
          await store.getPublicLogs({
            fromBlock: BlockNumber(2),
            toBlock: BlockNumber(5),
            afterLog: new LogId(BlockNumber(4), L2BlockHash.random(), 0, 0),
          })
        ).logs;
        blockNumbers = new Set(logs.map(log => log.id.blockNumber));
        expect(blockNumbers).toEqual(new Set([4]));

        logs = (
          await store.getPublicLogs({
            toBlock: BlockNumber(5),
            afterLog: new LogId(BlockNumber(5), L2BlockHash.random(), 1, 0),
          })
        ).logs;
        expect(logs.length).toBe(0);

        logs = (
          await store.getPublicLogs({
            fromBlock: BlockNumber(2),
            toBlock: BlockNumber(5),
            afterLog: new LogId(BlockNumber(100), L2BlockHash.random(), 0, 0),
          })
        ).logs;
        expect(logs.length).toBe(0);
      });

      it('"txIndex" and "logIndex" are respected when "afterLog.blockNumber" is equal to "fromBlock"', async () => {
        // Get a random log as reference
        const targetBlockIndex = randomInt(numBlocksForPublicLogs);
        const targetBlock = publishedCheckpoints[targetBlockIndex].checkpoint.blocks[0];
        const targetTxIndex = randomInt(getTxsPerBlock(targetBlock));
        const numLogsInTx = targetBlock.body.txEffects[targetTxIndex].publicLogs.length;
        const targetLogIndex = numLogsInTx > 0 ? randomInt(numLogsInTx) : 0;
        const targetBlockHash = L2BlockHash.fromField(await targetBlock.header.hash());

        const afterLog = new LogId(
          BlockNumber(targetBlockIndex + INITIAL_L2_BLOCK_NUM),
          targetBlockHash,
          targetTxIndex,
          targetLogIndex,
        );

        const response = await store.getPublicLogs({ afterLog, fromBlock: afterLog.blockNumber });
        const logs = response.logs;

        expect(response.maxLogsHit).toBeFalsy();

        for (const log of logs) {
          const logId = log.id;
          expect(logId.blockNumber).toBeGreaterThanOrEqual(afterLog.blockNumber);
          if (logId.blockNumber === afterLog.blockNumber) {
            expect(logId.txIndex).toBeGreaterThanOrEqual(afterLog.txIndex);
            if (logId.txIndex === afterLog.txIndex) {
              expect(logId.logIndex).toBeGreaterThan(afterLog.logIndex);
            }
          }
        }
      });
    });

    describe('getContractClassLogs', () => {
      let targetBlock: L2BlockNew;
      let expectedContractClassLog: ContractClassLog;

      beforeEach(async () => {
        await store.addCheckpoints(publishedCheckpoints);

        targetBlock = publishedCheckpoints[0].checkpoint.blocks[0];
        expectedContractClassLog = await ContractClassLog.random();
        targetBlock.body.txEffects.forEach((txEffect, index) => {
          txEffect.contractClassLogs = index === 0 ? [expectedContractClassLog] : [];
        });

        await store.addLogs([targetBlock]);
      });

      it('returns block hash on contract class log ids', async () => {
        const result = await store.getContractClassLogs({
          fromBlock: targetBlock.number,
          toBlock: targetBlock.number + 1,
        });

        expect(result.maxLogsHit).toBeFalsy();
        expect(result.logs).toHaveLength(1);

        const [{ id, log }] = result.logs;
        const expectedBlockHash = L2BlockHash.fromField(await targetBlock.header.hash());

        expect(id.blockHash.equals(expectedBlockHash)).toBe(true);
        expect(id.blockNumber).toEqual(targetBlock.number);
        expect(log).toEqual(expectedContractClassLog);
      });
    });

    describe('pendingChainValidationStatus', () => {
      it('should return undefined when no status is set', async () => {
        const status = await store.getPendingChainValidationStatus();
        expect(status).toBeUndefined();
      });

      it('should store and retrieve a valid validation status', async () => {
        const validStatus: ValidateCheckpointResult = { valid: true };

        await store.setPendingChainValidationStatus(validStatus);
        const retrievedStatus = await store.getPendingChainValidationStatus();

        expect(retrievedStatus).toEqual(validStatus);
      });

      it('should store and retrieve an invalid validation status with insufficient attestations', async () => {
        const invalidStatus: ValidateCheckpointResult = {
          valid: false,
          checkpoint: randomCheckpointInfo(1),
          committee: [EthAddress.random(), EthAddress.random()],
          epoch: EpochNumber(123),
          seed: 456n,
          attestors: [EthAddress.random()],
          attestations: [CommitteeAttestation.random()],
          reason: 'insufficient-attestations',
        };

        await store.setPendingChainValidationStatus(invalidStatus);
        const retrievedStatus = await store.getPendingChainValidationStatus();

        expect(retrievedStatus).toEqual(invalidStatus);
      });

      it('should store and retrieve an invalid validation status with invalid attestation', async () => {
        const invalidStatus: ValidateCheckpointResult = {
          valid: false,
          checkpoint: randomCheckpointInfo(2),
          committee: [EthAddress.random()],
          attestors: [EthAddress.random()],
          epoch: EpochNumber(789),
          seed: 101n,
          attestations: [CommitteeAttestation.random()],
          reason: 'invalid-attestation',
          invalidIndex: 5,
        };

        await store.setPendingChainValidationStatus(invalidStatus);
        const retrievedStatus = await store.getPendingChainValidationStatus();

        expect(retrievedStatus).toEqual(invalidStatus);
      });

      it('should overwrite existing status when setting a new one', async () => {
        const firstStatus: ValidateCheckpointResult = { valid: true };
        const secondStatus: ValidateCheckpointResult = {
          valid: false,
          checkpoint: randomCheckpointInfo(3),
          committee: [EthAddress.random()],
          epoch: EpochNumber(999),
          seed: 888n,
          attestors: [EthAddress.random()],
          attestations: [CommitteeAttestation.random()],
          reason: 'insufficient-attestations',
        };

        await store.setPendingChainValidationStatus(firstStatus);
        await store.setPendingChainValidationStatus(secondStatus);
        const retrievedStatus = await store.getPendingChainValidationStatus();

        expect(retrievedStatus).toEqual(secondStatus);
      });

      it('should handle empty committee and attestations arrays', async () => {
        const statusWithEmptyArrays: ValidateCheckpointResult = {
          valid: false,
          checkpoint: randomCheckpointInfo(4),
          committee: [],
          epoch: EpochNumber(0),
          seed: 0n,
          attestors: [],
          attestations: [],
          reason: 'insufficient-attestations',
        };

        await store.setPendingChainValidationStatus(statusWithEmptyArrays);
        const retrievedStatus = await store.getPendingChainValidationStatus();

        expect(retrievedStatus).toEqual(statusWithEmptyArrays);
      });
    });
  });
}
