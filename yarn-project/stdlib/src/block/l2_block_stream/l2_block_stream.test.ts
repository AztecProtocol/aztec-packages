import { GENESIS_BLOCK_HEADER_HASH } from '@aztec/constants';
import { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';
import { compactArray } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { createLogger } from '@aztec/foundation/log';

import { type MockProxy, mock } from 'jest-mock-extended';
import times from 'lodash.times';

import type { PublishedCheckpoint } from '../../checkpoint/published_checkpoint.js';
import type { BlockHeader } from '../../tx/block_header.js';
import type { CheckpointedL2Block } from '../checkpointed_l2_block.js';
import type { L2BlockNew } from '../l2_block_new.js';
import { GENESIS_CHECKPOINT_HEADER_HASH, type L2BlockId, type L2BlockSource, type L2Tips } from '../l2_block_source.js';
import type { L2BlockStreamEvent, L2BlockStreamEventHandler, L2BlockStreamLocalDataProvider } from './interfaces.js';
import { L2BlockStream } from './l2_block_stream.js';
import { L2TipsMemoryStore } from './l2_tips_memory_store.js';

describe('L2BlockStream', () => {
  let blockSource: MockProxy<L2BlockSource>;

  let latest: number = 0;
  let checkpointed: number = 0;

  const makeHash = (number: number) => new Fr(number).toString();

  const makeBlock = (number: number) =>
    ({
      number: BlockNumber(number),
      checkpointNumber: CheckpointNumber(number),
      indexWithinCheckpoint: 0,
    }) as L2BlockNew;

  /** Makes a block with hash method (for use in mocks that need hash) */
  const makeBlockWithHash = (number: number) =>
    ({
      number: BlockNumber(number),
      checkpointNumber: CheckpointNumber(number),
      indexWithinCheckpoint: 0,
      hash: () => Promise.resolve(new Fr(number)),
    }) as L2BlockNew;

  const makeCheckpointedBlock = (number: number, checkpointNum: number): CheckpointedL2Block =>
    ({
      block: makeBlock(number),
      checkpointNumber: checkpointNum,
    }) as CheckpointedL2Block;

  const makeHeader = (number: number) => ({ hash: () => Promise.resolve(new Fr(number)) }) as BlockHeader;

  const makeBlockId = (number: number): L2BlockId => ({ number: BlockNumber(number), hash: makeHash(number) });

  /** Helper to match a blocks-added event with blocks that may have extra properties like hash */
  const expectBlocksAdded = (blockNumbers: number[]) =>
    expect.objectContaining({
      type: 'blocks-added',
      blocks: blockNumbers.map(n =>
        expect.objectContaining({
          number: BlockNumber(n),
        }),
      ),
    });

  /** Helper to match a chain-checkpointed event */
  const expectCheckpointed = (checkpointNumber?: number) =>
    checkpointNumber !== undefined
      ? expect.objectContaining({
          type: 'chain-checkpointed',
          checkpoint: expect.objectContaining({
            checkpoint: expect.objectContaining({ number: checkpointNumber }),
          }),
          block: expect.objectContaining({ number: expect.any(Number) }),
        })
      : expect.objectContaining({ type: 'chain-checkpointed' });

  const makeCheckpointId = (number: number) => ({ number: CheckpointNumber(number), hash: makeHash(number) });

  const makeTipId = (number: number) => ({
    block: { number: BlockNumber(number), hash: makeHash(number) },
    checkpoint: { number: CheckpointNumber(number), hash: makeHash(number) },
  });

  /** Sets the remote tips. All tips default to 0 except latest. */
  const setRemoteTips = (latest_: number, checkpointed_?: number, proven?: number, finalized?: number) => {
    checkpointed_ = checkpointed_ ?? 0;
    proven = proven ?? 0;
    finalized = finalized ?? 0;
    latest = latest_;
    checkpointed = checkpointed_;

    blockSource.getL2Tips.mockResolvedValue({
      proposed: { number: BlockNumber(latest), hash: makeHash(latest) },
      checkpointed: makeTipId(checkpointed_),
      proven: makeTipId(proven),
      finalized: makeTipId(finalized),
    });
  };

  beforeEach(() => {
    blockSource = mock<L2BlockSource>();

    // Archiver returns headers with hashes equal to the block number for simplicity
    // Note that we only return block headers for blocks that have not been pruned
    blockSource.getBlockHeader.mockImplementation(number =>
      Promise.resolve(
        typeof number === 'number' && number > latest ? undefined : makeHeader(number === 'latest' ? 1 : number),
      ),
    );

    // Returns blocks up until what was reported as the latest block (for uncheckpointed blocks)
    blockSource.getL2BlocksNew.mockImplementation((from, limit) =>
      Promise.resolve(compactArray(times(limit, i => (from + i > latest ? undefined : makeBlock(from + i))))),
    );

    // Returns checkpointed blocks (for blocks up to checkpointed tip)
    blockSource.getCheckpointedBlocks.mockImplementation((from, limit) =>
      Promise.resolve(
        compactArray(
          times(limit, i => (from + i > checkpointed ? undefined : makeCheckpointedBlock(from + i, from + i))),
        ),
      ),
    );

    // Returns published checkpoints - each checkpoint contains just the one block for simplicity
    // Respects the limit parameter and returns up to `limit` checkpoints
    blockSource.getPublishedCheckpoints.mockImplementation((checkpointNumber: CheckpointNumber, limit: number) =>
      Promise.resolve(
        compactArray(
          times(limit, i => {
            const cpNum = checkpointNumber + i;
            return cpNum > checkpointed
              ? undefined
              : ({
                  checkpoint: {
                    number: cpNum,
                    hash: () => new Fr(cpNum),
                    blocks: [makeBlockWithHash(cpNum)],
                  },
                } as unknown as PublishedCheckpoint);
          }),
        ),
      ),
    );
  });

  describe('with mock local data provider', () => {
    let localData: TestL2BlockStreamLocalDataProvider;
    let handler: TestL2BlockStreamEventHandler;
    let blockStream: TestL2BlockStream;

    beforeEach(() => {
      localData = new TestL2BlockStreamLocalDataProvider();
      handler = new TestL2BlockStreamEventHandler();
      blockStream = new TestL2BlockStream(blockSource, localData, handler, createLogger('test:l2-block-stream'), {
        batchSize: 10,
        checkpointPrefetchLimit: 1,
      });
    });

    it('pulls new blocks from start', async () => {
      setRemoteTips(5);

      await blockStream.work();
      expect(handler.events).toEqual([
        { type: 'blocks-added', blocks: times(5, i => makeBlock(i + 1)) },
      ] satisfies L2BlockStreamEvent[]);
    });

    it('pulls new blocks from offset', async () => {
      setRemoteTips(15);
      localData.proposed.number = BlockNumber(10);

      await blockStream.work();
      expect(blockSource.getL2BlocksNew).toHaveBeenCalledWith(BlockNumber(11), 5, undefined);
      expect(handler.events).toEqual([
        { type: 'blocks-added', blocks: times(5, i => makeBlock(i + 11)) },
      ] satisfies L2BlockStreamEvent[]);
    });

    it('pulls new blocks in multiple batches', async () => {
      setRemoteTips(45);

      await blockStream.work();
      expect(blockSource.getL2BlocksNew).toHaveBeenCalledTimes(5);
      expect(handler.callCount).toEqual(5);
      expect(handler.events).toEqual([
        { type: 'blocks-added', blocks: times(10, i => makeBlock(i + 1)) },
        { type: 'blocks-added', blocks: times(10, i => makeBlock(i + 11)) },
        { type: 'blocks-added', blocks: times(10, i => makeBlock(i + 21)) },
        { type: 'blocks-added', blocks: times(10, i => makeBlock(i + 31)) },
        { type: 'blocks-added', blocks: times(5, i => makeBlock(i + 41)) },
      ] satisfies L2BlockStreamEvent[]);
    });

    it('halts pulling blocks if stopped', async () => {
      setRemoteTips(45);
      blockStream.running = false;

      await blockStream.work();
      expect(blockSource.getL2BlocksNew).toHaveBeenCalledTimes(1);
      expect(handler.events).toEqual([
        { type: 'blocks-added', blocks: times(10, i => makeBlock(i + 1)) },
      ] satisfies L2BlockStreamEvent[]);
    });

    it('halts on handler error and retries', async () => {
      setRemoteTips(45);

      handler.throwing = true;
      await blockStream.work();
      expect(handler.callCount).toEqual(1);

      handler.throwing = false;
      await blockStream.work();
      expect(handler.callCount).toEqual(6);
      expect(handler.events).toHaveLength(5);
    });

    it('handles a reorg and requests blocks from new tip', async () => {
      setRemoteTips(45);
      localData.proposed.number = BlockNumber(40);

      for (const i of [37, 38, 39, 40]) {
        // Mess up the block hashes for a bunch of blocks
        localData.blockHashes[i] = `0xaa${i.toString()}`;
      }

      await blockStream.work();
      expect(handler.events).toEqual([
        { type: 'chain-pruned', block: makeBlockId(36), checkpoint: makeCheckpointId(0) },
        { type: 'blocks-added', blocks: times(9, i => makeBlock(i + 37)) },
      ] satisfies L2BlockStreamEvent[]);
    });

    it('emits events for chain proven and finalized', async () => {
      setRemoteTips(45, 0, 40, 35);
      localData.proposed.number = BlockNumber(40);
      localData.proven.block.number = BlockNumber(10);
      localData.finalized.block.number = BlockNumber(10);

      await blockStream.work();
      expect(handler.events).toEqual([
        { type: 'blocks-added', blocks: times(5, i => makeBlock(i + 41)) },
        { type: 'chain-proven', block: makeBlockId(40) },
        { type: 'chain-finalized', block: makeBlockId(35) },
      ] satisfies L2BlockStreamEvent[]);
    });

    it('fetches checkpointed blocks and emits chain-checkpointed events', async () => {
      // All blocks are checkpointed (checkpointed=5, proposed=5)
      setRemoteTips(5, 5);

      await blockStream.work();

      // Each checkpointed block triggers a blocks-added and chain-checkpointed event
      // (since each checkpoint contains one block in our mock)
      expect(handler.events).toEqual([
        expectBlocksAdded([1]),
        expectCheckpointed(),
        expectBlocksAdded([2]),
        expectCheckpointed(),
        expectBlocksAdded([3]),
        expectCheckpointed(),
        expectBlocksAdded([4]),
        expectCheckpointed(),
        expectBlocksAdded([5]),
        expectCheckpointed(),
      ]);
      expect(blockSource.getCheckpointedBlocks).toHaveBeenCalledTimes(1);
      expect(blockSource.getL2BlocksNew).not.toHaveBeenCalled();
    });

    it('fetches checkpointed blocks first, then uncheckpointed blocks', async () => {
      // Blocks 1-3 are checkpointed, blocks 4-5 are uncheckpointed
      setRemoteTips(5, 3);

      await blockStream.work();

      // First 3 blocks come via checkpoints, last 2 via getL2BlocksNew
      expect(handler.events).toEqual([
        expectBlocksAdded([1]),
        expectCheckpointed(),
        expectBlocksAdded([2]),
        expectCheckpointed(),
        expectBlocksAdded([3]),
        expectCheckpointed(),
        expectBlocksAdded([4, 5]),
      ]);
      expect(blockSource.getCheckpointedBlocks).toHaveBeenCalledTimes(1);
      expect(blockSource.getL2BlocksNew).toHaveBeenCalledWith(BlockNumber(4), 2, undefined);
    });

    it('handles reorg with uncheckpointed reason when pruned to checkpointed tip', async () => {
      // Source: checkpointed=3, proposed=5
      setRemoteTips(5, 3);
      localData.proposed.number = BlockNumber(5);
      localData.checkpointed.block.number = BlockNumber(3);

      // Mess up hashes for blocks 4 and 5 (uncheckpointed blocks)
      localData.blockHashes[4] = `0xaa4`;
      localData.blockHashes[5] = `0xaa5`;

      await blockStream.work();

      // Prune to block 3 (checkpointed tip)
      expect(handler.events[0]).toEqual({
        type: 'chain-pruned',
        block: makeBlockId(3),
        checkpoint: makeCheckpointId(3),
      });
    });
  });

  describe('with memory tips store', () => {
    let localData: TestL2TipsMemoryStore;
    let handler: TestL2BlockStreamEventHandler;
    let blockStream: TestL2BlockStream;

    beforeEach(() => {
      localData = new TestL2TipsMemoryStore();
      handler = new TestL2BlockStreamEventHandler(localData);
      blockStream = new TestL2BlockStream(blockSource, localData, handler, createLogger('test:l2-block-stream'), {
        batchSize: 10,
      });
    });

    // Regression test for https://github.com/AztecProtocol/aztec-packages/issues/13471
    it('handles a prune to a block before start block', async () => {
      setRemoteTips(35, 30, 25, 10);
      blockStream = new TestL2BlockStream(blockSource, localData, handler, createLogger('test:l2-block-stream'), {
        batchSize: 10,
        startingBlock: 30,
      });

      // We first seed a few blocks into the blockstream
      // Block 30 comes via checkpoint, blocks 31-35 via uncheckpointed
      await blockStream.work();
      expect(handler.events).toEqual([
        expectBlocksAdded([30]),
        expectCheckpointed(30),
        { type: 'blocks-added', blocks: times(5, i => makeBlock(i + 31)) },
        { type: 'chain-proven', block: makeBlockId(25) },
        { type: 'chain-finalized', block: makeBlockId(10) },
      ]);
      handler.clearEvents();

      // And then we reorg
      setRemoteTips(25, 25, 25, 10);
      await blockStream.work();
      expect(handler.events).toEqual([
        { type: 'chain-pruned', block: makeBlockId(25), checkpoint: makeCheckpointId(25) },
      ]);
    });
  });

  describe('multiple blocks per checkpoint', () => {
    let localData: TestL2BlockStreamLocalDataProvider;
    let handler: TestL2BlockStreamEventHandler;
    let blockStream: TestL2BlockStream;

    // Configuration for checkpoint structure: each checkpoint contains 3 blocks
    const blocksPerCheckpoint = 3;

    /** Gets the checkpoint number for a given block number */
    const getCheckpointForBlock = (blockNum: number) => Math.ceil(blockNum / blocksPerCheckpoint);

    /** Gets the first block number in a checkpoint */
    const getFirstBlockInCheckpoint = (checkpointNum: number) => (checkpointNum - 1) * blocksPerCheckpoint + 1;

    /** Gets the last block number in a checkpoint */
    const getLastBlockInCheckpoint = (checkpointNum: number) => checkpointNum * blocksPerCheckpoint;

    /** Makes a block with correct checkpoint info */
    const makeBlockInCheckpoint = (blockNum: number) => {
      const checkpointNum = getCheckpointForBlock(blockNum);
      const firstBlockInCheckpoint = getFirstBlockInCheckpoint(checkpointNum);
      return {
        number: BlockNumber(blockNum),
        checkpointNumber: CheckpointNumber(checkpointNum),
        indexWithinCheckpoint: blockNum - firstBlockInCheckpoint,
      } as L2BlockNew;
    };

    /** Makes a block with hash method (for use in mocks that need hash) */
    const makeBlockInCheckpointWithHash = (blockNum: number) => {
      const checkpointNum = getCheckpointForBlock(blockNum);
      const firstBlockInCheckpoint = getFirstBlockInCheckpoint(checkpointNum);
      return {
        number: BlockNumber(blockNum),
        checkpointNumber: CheckpointNumber(checkpointNum),
        indexWithinCheckpoint: blockNum - firstBlockInCheckpoint,
        hash: () => Promise.resolve(new Fr(blockNum)),
      } as L2BlockNew;
    };

    /** Makes a checkpointed block */
    const makeCheckpointedBlockInCheckpoint = (blockNum: number): CheckpointedL2Block =>
      ({
        block: makeBlockInCheckpoint(blockNum),
        checkpointNumber: getCheckpointForBlock(blockNum),
      }) as CheckpointedL2Block;

    /** Sets the remote tips with correct checkpoint numbers for multi-block checkpoints. */
    const setRemoteTipsMultiBlock = (
      latest_: number,
      checkpointedBlock?: number,
      proven?: number,
      finalized?: number,
    ) => {
      checkpointedBlock = checkpointedBlock ?? 0;
      proven = proven ?? 0;
      finalized = finalized ?? 0;
      latest = latest_;
      checkpointed = checkpointedBlock;

      const checkpointedCheckpointNum = checkpointedBlock > 0 ? getCheckpointForBlock(checkpointedBlock) : 0;
      const provenCheckpointNum = proven > 0 ? getCheckpointForBlock(proven) : 0;
      const finalizedCheckpointNum = finalized > 0 ? getCheckpointForBlock(finalized) : 0;

      blockSource.getL2Tips.mockResolvedValue({
        proposed: { number: BlockNumber(latest), hash: makeHash(latest) },
        checkpointed: {
          block: { number: BlockNumber(checkpointedBlock), hash: makeHash(checkpointedBlock) },
          checkpoint: {
            number: CheckpointNumber(checkpointedCheckpointNum),
            hash: makeHash(checkpointedCheckpointNum),
          },
        },
        proven: {
          block: { number: BlockNumber(proven), hash: makeHash(proven) },
          checkpoint: { number: CheckpointNumber(provenCheckpointNum), hash: makeHash(provenCheckpointNum) },
        },
        finalized: {
          block: { number: BlockNumber(finalized), hash: makeHash(finalized) },
          checkpoint: { number: CheckpointNumber(finalizedCheckpointNum), hash: makeHash(finalizedCheckpointNum) },
        },
      });
    };

    beforeEach(() => {
      localData = new TestL2BlockStreamLocalDataProvider();
      handler = new TestL2BlockStreamEventHandler();
      blockStream = new TestL2BlockStream(blockSource, localData, handler, createLogger('test:l2-block-stream'), {
        batchSize: 10,
      });

      // Override the mocks to support multiple blocks per checkpoint
      blockSource.getCheckpointedBlocks.mockImplementation((from, limit) =>
        Promise.resolve(
          compactArray(
            times(limit, i => (from + i > checkpointed ? undefined : makeCheckpointedBlockInCheckpoint(from + i))),
          ),
        ),
      );

      // Returns published checkpoints with multiple blocks each, respecting the limit parameter
      blockSource.getPublishedCheckpoints.mockImplementation((checkpointNumber: CheckpointNumber, limit: number) => {
        const checkpoints: PublishedCheckpoint[] = [];
        for (let i = 0; i < limit; i++) {
          const cpNum = CheckpointNumber(checkpointNumber + i);
          const firstBlock = getFirstBlockInCheckpoint(cpNum);
          const lastBlock = getLastBlockInCheckpoint(cpNum);
          // Only include checkpoints that are within the checkpointed range
          if (lastBlock > checkpointed) {
            break;
          }
          checkpoints.push({
            checkpoint: {
              number: cpNum,
              hash: () => new Fr(cpNum),
              blocks: times(blocksPerCheckpoint, j => makeBlockInCheckpointWithHash(firstBlock + j)),
            },
          } as unknown as PublishedCheckpoint);
        }
        return Promise.resolve(checkpoints);
      });
    });

    it('emits all blocks in a checkpoint before chain-checkpointed event', async () => {
      // Set up: 6 blocks in 2 checkpoints (blocks 1-3 in checkpoint 1, blocks 4-6 in checkpoint 2)
      setRemoteTipsMultiBlock(6, 6);

      await blockStream.work();

      // Should emit blocks 1-3, then checkpoint 1, then blocks 4-6, then checkpoint 2
      expect(handler.events).toEqual([
        expectBlocksAdded([1, 2, 3]),
        expectCheckpointed(1),
        expectBlocksAdded([4, 5, 6]),
        expectCheckpointed(2),
      ]);
    });

    it('handles partial checkpoint at the end (uncheckpointed blocks)', async () => {
      // Set up: 5 blocks total, but only first 3 are checkpointed (checkpoint 1 complete)
      // Blocks 4-5 are uncheckpointed
      setRemoteTipsMultiBlock(5, 3);

      await blockStream.work();

      // Should emit checkpoint 1 blocks, then checkpoint event, then uncheckpointed blocks 4-5
      expect(handler.events).toEqual([expectBlocksAdded([1, 2, 3]), expectCheckpointed(1), expectBlocksAdded([4, 5])]);
    });

    it('handles starting from middle of a checkpoint', async () => {
      // Set up: 9 blocks in 3 checkpoints, but we start from block 5 (middle of checkpoint 2)
      // Local has blocks 1-4, local checkpointed = 0
      setRemoteTipsMultiBlock(9, 9);
      localData.proposed.number = BlockNumber(4);

      await blockStream.work();

      // Should first emit checkpoint 1 (blocks 1-4 already local)
      // Then continue from block 5, which is in checkpoint 2
      // Blocks 5-6 complete checkpoint 2, then blocks 7-9 complete checkpoint 3
      expect(handler.events).toEqual([
        expectCheckpointed(1), // checkpoint 1 for already-local blocks 1-4
        expectBlocksAdded([5, 6]),
        expectCheckpointed(2), // checkpoint 2
        expectBlocksAdded([7, 8, 9]),
        expectCheckpointed(3), // checkpoint 3
      ]);

      // Verify checkpoint order
      const checkpointEvents = handler.events.filter(e => e.type === 'chain-checkpointed');
      expect(checkpointEvents).toHaveLength(3);
      expect((checkpointEvents[0] as any).checkpoint.checkpoint.number).toBe(CheckpointNumber(1));
      expect((checkpointEvents[1] as any).checkpoint.checkpoint.number).toBe(CheckpointNumber(2));
      expect((checkpointEvents[2] as any).checkpoint.checkpoint.number).toBe(CheckpointNumber(3));
    });

    it('correctly identifies checkpoint number in chain-checkpointed events', async () => {
      // Set up: 6 blocks in 2 checkpoints
      setRemoteTipsMultiBlock(6, 6);

      await blockStream.work();

      // Extract the chain-checkpointed events
      const checkpointEvents = handler.events.filter(e => e.type === 'chain-checkpointed');
      expect(checkpointEvents).toHaveLength(2);
      expect((checkpointEvents[0] as any).checkpoint.checkpoint.number).toBe(CheckpointNumber(1));
      expect((checkpointEvents[1] as any).checkpoint.checkpoint.number).toBe(CheckpointNumber(2));
    });

    it('handles many checkpoints with batching', async () => {
      // Set up: 12 blocks in 4 checkpoints (3 blocks each), with batch size of 5
      // Batch size doesn't align with checkpoint boundaries, so the stream must
      // respect checkpoint boundaries and emit events correctly
      blockStream = new TestL2BlockStream(blockSource, localData, handler, createLogger('test:l2-block-stream'), {
        batchSize: 5,
      });
      setRemoteTipsMultiBlock(12, 12);

      await blockStream.work();

      // Even though batch size is 5, checkpoint boundaries (every 3 blocks) take precedence
      // Expected sequence:
      // - Blocks 1-3 (checkpoint 1), then checkpoint 1 event
      // - Blocks 4-6 (checkpoint 2), then checkpoint 2 event
      // - Blocks 7-9 (checkpoint 3), then checkpoint 3 event
      // - Blocks 10-12 (checkpoint 4), then checkpoint 4 event
      expect(handler.events).toEqual([
        expectBlocksAdded([1, 2, 3]),
        expectCheckpointed(1),
        expectBlocksAdded([4, 5, 6]),
        expectCheckpointed(2),
        expectBlocksAdded([7, 8, 9]),
        expectCheckpointed(3),
        expectBlocksAdded([10, 11, 12]),
        expectCheckpointed(4),
      ]);
    });

    it('does not emit more than batchSize blocks in a single blocks-added event for checkpointed blocks', async () => {
      // Set up: 12 blocks in 4 checkpoints (3 blocks each), but batch size is 2
      // Each checkpoint has 3 blocks, but we should never emit more than 2 at once
      blockStream = new TestL2BlockStream(blockSource, localData, handler, createLogger('test:l2-block-stream'), {
        batchSize: 2,
      });
      setRemoteTipsMultiBlock(12, 12);

      await blockStream.work();

      // Verify no blocks-added event has more than 2 blocks
      const blocksAddedEvents = handler.events.filter(e => e.type === 'blocks-added');
      for (const event of blocksAddedEvents) {
        if (event.type === 'blocks-added') {
          expect(event.blocks.length).toBeLessThanOrEqual(2);
        }
      }

      // Expected sequence with batchSize=2:
      // - Blocks 1-2, then blocks 3, then checkpoint 1
      // - Blocks 4-5, then block 6, then checkpoint 2
      // etc.
      expect(handler.events).toEqual([
        expectBlocksAdded([1, 2]),
        expectBlocksAdded([3]),
        expectCheckpointed(1),
        expectBlocksAdded([4, 5]),
        expectBlocksAdded([6]),
        expectCheckpointed(2),
        expectBlocksAdded([7, 8]),
        expectBlocksAdded([9]),
        expectCheckpointed(3),
        expectBlocksAdded([10, 11]),
        expectBlocksAdded([12]),
        expectCheckpointed(4),
      ]);
    });

    it('emits checkpoint event when blocks become checkpointed after being added as uncheckpointed', async () => {
      // Phase 1: Start with 3 checkpointed blocks (checkpoint 1), then add blocks 4-6 as uncheckpointed
      setRemoteTipsMultiBlock(6, 3);

      await blockStream.work();

      // Expect: blocks 1-3 via checkpoint, then uncheckpointed blocks 4-6
      expect(handler.events).toEqual([
        expectBlocksAdded([1, 2, 3]),
        expectCheckpointed(1),
        expectBlocksAdded([4, 5, 6]),
      ]);

      handler.clearEvents();

      // Update local state to reflect what the handler would have stored
      localData.proposed.number = BlockNumber(6);
      localData.checkpointed.block.number = BlockNumber(3);
      localData.checkpointed.checkpoint.number = CheckpointNumber(1);

      // Phase 2: Now checkpoint 2 completes (blocks 4-6 become checkpointed)
      setRemoteTipsMultiBlock(6, 6);

      await blockStream.work();

      // Should emit a checkpoint event for checkpoint 2 (blocks 4-6), even though blocks were already added
      const checkpointEvents = handler.events.filter(e => e.type === 'chain-checkpointed');
      expect(checkpointEvents).toHaveLength(1);
      expect((checkpointEvents[0] as any).checkpoint.checkpoint.number).toBe(CheckpointNumber(2));
    });

    it('emits checkpoint event BEFORE new uncheckpointed blocks when checkpoint completes', async () => {
      // Phase 1: Start with 3 checkpointed blocks (checkpoint 1), then add blocks 4-6 as uncheckpointed
      setRemoteTipsMultiBlock(6, 3);

      await blockStream.work();

      // Expect: blocks 1-3 via checkpoint, then uncheckpointed blocks 4-6
      expect(handler.events).toEqual([
        expectBlocksAdded([1, 2, 3]),
        expectCheckpointed(1),
        expectBlocksAdded([4, 5, 6]),
      ]);

      handler.clearEvents();

      // Update local state to reflect what the handler would have stored
      localData.proposed.number = BlockNumber(6);
      localData.checkpointed.block.number = BlockNumber(3);
      localData.checkpointed.checkpoint.number = CheckpointNumber(1);

      // Phase 2: Checkpoint 2 completes (blocks 4-6) AND a new block 7 arrives
      setRemoteTipsMultiBlock(7, 6);

      await blockStream.work();

      // Should emit checkpoint 2 FIRST, then the new uncheckpointed block 7
      // NOT: block 7 first, then checkpoint 2
      expect(handler.events).toEqual([expectCheckpointed(2), expectBlocksAdded([7])]);
    });

    it('emits checkpoint as soon as last block in checkpoint arrives', async () => {
      // This tests the realistic scenario where checkpoints are published as blocks arrive.
      // Uncheckpointed blocks are always just a partial checkpoint (the current incomplete one).

      // Sync 1: Source has checkpointed=6 (checkpoint 2), proposed=9
      // Client gets blocks 1-6 via checkpoints, blocks 7-9 as uncheckpointed
      setRemoteTipsMultiBlock(9, 6);

      await blockStream.work();

      expect(handler.events).toEqual([
        expectBlocksAdded([1, 2, 3]),
        expectCheckpointed(1),
        expectBlocksAdded([4, 5, 6]),
        expectCheckpointed(2),
        expectBlocksAdded([7, 8, 9]), // uncheckpointed
      ]);

      handler.clearEvents();

      // Update local state
      localData.proposed.number = BlockNumber(9);
      localData.checkpointed.block.number = BlockNumber(6);
      localData.checkpointed.checkpoint.number = CheckpointNumber(2);

      // Sync 2: Checkpoint 3 is now published (blocks 7-9), new blocks 10-12 are uncheckpointed
      setRemoteTipsMultiBlock(12, 9);

      await blockStream.work();

      // Should emit checkpoint 3 for already-local blocks 7-9, then uncheckpointed blocks 10-12
      expect(handler.events).toEqual([
        expectCheckpointed(3),
        expectBlocksAdded([10, 11, 12]), // uncheckpointed
      ]);

      handler.clearEvents();

      // Update local state
      localData.proposed.number = BlockNumber(12);
      localData.checkpointed.block.number = BlockNumber(9);
      localData.checkpointed.checkpoint.number = CheckpointNumber(3);

      // Sync 3: Checkpoint 4 is now published (blocks 10-12), no new blocks
      setRemoteTipsMultiBlock(12, 12);

      await blockStream.work();

      // Should emit checkpoint 4 for already-local blocks 10-12
      expect(handler.events).toEqual([expectCheckpointed(4)]);
    });

    it('emits all checkpoints when source jumps ahead with multiple new checkpoints', async () => {
      // Phase 1: Start with checkpoint 1 complete (blocks 1-3), blocks 4-6 uncheckpointed
      setRemoteTipsMultiBlock(6, 3);

      await blockStream.work();

      expect(handler.events).toEqual([
        expectBlocksAdded([1, 2, 3]),
        expectCheckpointed(1),
        expectBlocksAdded([4, 5, 6]),
      ]);

      handler.clearEvents();

      // Update local state
      localData.proposed.number = BlockNumber(6);
      localData.checkpointed.block.number = BlockNumber(3);
      localData.checkpointed.checkpoint.number = CheckpointNumber(1);

      // Phase 2: Source jumps to block 12 with checkpoints at 6, 9, and 12
      // - Checkpoint 2 (blocks 4-6) - blocks already local, needs checkpoint event
      // - Checkpoint 3 (blocks 7-9) - new blocks + checkpoint event
      // - Checkpoint 4 (blocks 10-12) - new blocks + checkpoint event
      setRemoteTipsMultiBlock(12, 12);

      await blockStream.work();

      // Should emit:
      // 1. Checkpoint 2 event (blocks 4-6 were already local)
      // 2. Blocks 7-9 + checkpoint 3 event
      // 3. Blocks 10-12 + checkpoint 4 event
      expect(handler.events).toEqual([
        expectCheckpointed(2),
        expectBlocksAdded([7, 8, 9]),
        expectCheckpointed(3),
        expectBlocksAdded([10, 11, 12]),
        expectCheckpointed(4),
      ]);
    });

    describe('checkpoint prefetching', () => {
      it('prefetches multiple checkpoints in a single RPC call', async () => {
        // Set up: 9 blocks in 3 checkpoints
        setRemoteTipsMultiBlock(9, 9);

        // Create a stream with prefetch limit of 10 (will fetch all 3 checkpoints in one call)
        // This also tests that we handle getting fewer checkpoints (3) than requested (10)
        const prefetchStream = new TestL2BlockStream(
          blockSource,
          localData,
          handler,
          createLogger('test:l2-block-stream'),
          {
            batchSize: 10,
            checkpointPrefetchLimit: 10,
          },
        );

        await prefetchStream.work();

        // Should have fetched all 3 checkpoints in a single call (Loop 2 makes 1 call with limit 10)
        // Even though we requested 10, only 3 exist - verify we handle this correctly
        const calls = blockSource.getPublishedCheckpoints.mock.calls;
        const loop2Calls = calls.filter(([_, limit]) => limit === 10);
        expect(loop2Calls.length).toBe(1);
        expect(loop2Calls[0][0]).toBe(1); // Starting from checkpoint 1

        // All 3 checkpoints should be emitted correctly (not 10)
        const checkpointEvents = handler.events.filter(e => e.type === 'chain-checkpointed');
        expect(checkpointEvents).toHaveLength(3);

        // Verify correct event order
        expect(handler.events).toEqual([
          expectBlocksAdded([1, 2, 3]),
          expectCheckpointed(1),
          expectBlocksAdded([4, 5, 6]),
          expectCheckpointed(2),
          expectBlocksAdded([7, 8, 9]),
          expectCheckpointed(3),
        ]);
      });

      it('prefetches checkpoints correctly when starting from an offset', async () => {
        // Set up: 15 blocks in 5 checkpoints, but we already have blocks 1-6 locally (checkpoints 1-2)
        setRemoteTipsMultiBlock(15, 15);
        localData.proposed.number = BlockNumber(6);
        localData.checkpointed.checkpoint.number = CheckpointNumber(2);

        // Create a stream with prefetch limit of 10
        const prefetchStream = new TestL2BlockStream(
          blockSource,
          localData,
          handler,
          createLogger('test:l2-block-stream'),
          {
            batchSize: 10,
            checkpointPrefetchLimit: 10,
          },
        );

        await prefetchStream.work();

        // Loop 2 should start fetching from checkpoint 3 (block 7 is in checkpoint 3)
        const calls = blockSource.getPublishedCheckpoints.mock.calls;
        const loop2Calls = calls.filter(([_, limit]) => limit === 10);
        expect(loop2Calls.length).toBe(1);
        expect(loop2Calls[0][0]).toBe(3); // Starting from checkpoint 3, not 1

        // Should only emit blocks 7-15 and checkpoints 3-5 (not 1-2, those are already local)
        expect(handler.events).toEqual([
          expectBlocksAdded([7, 8, 9]),
          expectCheckpointed(3),
          expectBlocksAdded([10, 11, 12]),
          expectCheckpointed(4),
          expectBlocksAdded([13, 14, 15]),
          expectCheckpointed(5),
        ]);

        // Verify only 3 new checkpoints emitted
        const checkpointEvents = handler.events.filter(e => e.type === 'chain-checkpointed');
        expect(checkpointEvents).toHaveLength(3);
      });

      it('prefetches correctly when starting from middle of a checkpoint', async () => {
        // Local has blocks 1-7: checkpoints 1-2 complete, block 7 is first block of checkpoint 3
        setRemoteTipsMultiBlock(15, 15);
        localData.proposed.number = BlockNumber(7);
        localData.checkpointed.checkpoint.number = CheckpointNumber(2);

        const prefetchStream = new TestL2BlockStream(
          blockSource,
          localData,
          handler,
          createLogger('test:l2-block-stream'),
          {
            batchSize: 10,
            checkpointPrefetchLimit: 10,
          },
        );

        await prefetchStream.work();

        // Should start prefetching from checkpoint 3
        const calls = blockSource.getPublishedCheckpoints.mock.calls;
        const loop2Calls = calls.filter(([_, limit]) => limit === 10);
        expect(loop2Calls.length).toBe(1);
        expect(loop2Calls[0][0]).toBe(3); // Starting from checkpoint 3

        // Should emit only blocks 8-9 from checkpoint 3 (block 7 is already local)
        expect(handler.events).toEqual([
          expectBlocksAdded([8, 9]), // Rest of checkpoint 3
          expectCheckpointed(3),
          expectBlocksAdded([10, 11, 12]),
          expectCheckpointed(4),
          expectBlocksAdded([13, 14, 15]),
          expectCheckpointed(5),
        ]);

        // Verify only 3 checkpoints emitted
        const checkpointEvents = handler.events.filter(e => e.type === 'chain-checkpointed');
        expect(checkpointEvents).toHaveLength(3);
      });

      it('refills prefetch buffer when exhausted', async () => {
        // Set up: 15 blocks in 5 checkpoints
        setRemoteTipsMultiBlock(15, 15);

        // Create a stream with prefetch limit of 2 (will need 3 calls to fetch 5 checkpoints)
        const prefetchStream = new TestL2BlockStream(
          blockSource,
          localData,
          handler,
          createLogger('test:l2-block-stream'),
          {
            batchSize: 10,
            checkpointPrefetchLimit: 2,
          },
        );

        await prefetchStream.work();

        // Should have made 3 calls with limit 2 to fetch 5 checkpoints
        const calls = blockSource.getPublishedCheckpoints.mock.calls;
        const loop2Calls = calls.filter(([_, limit]) => limit === 2);
        expect(loop2Calls.length).toBe(3); // ceil(5/2) = 3
        expect(loop2Calls[0][0]).toBe(1); // First batch: checkpoints 1-2
        expect(loop2Calls[1][0]).toBe(3); // Second batch: checkpoints 3-4
        expect(loop2Calls[2][0]).toBe(5); // Third batch: checkpoint 5

        // All 5 checkpoints should be emitted
        const checkpointEvents = handler.events.filter(e => e.type === 'chain-checkpointed');
        expect(checkpointEvents).toHaveLength(5);
      });

      it('uses default prefetch limit when not specified', async () => {
        // Set up: 9 blocks in 3 checkpoints
        setRemoteTipsMultiBlock(9, 9);

        // Create a stream without specifying checkpointPrefetchLimit (should use default of 50)
        const defaultPrefetchStream = new TestL2BlockStream(
          blockSource,
          localData,
          handler,
          createLogger('test:l2-block-stream'),
          {
            batchSize: 10,
          },
        );

        await defaultPrefetchStream.work();

        // Should have used default limit of 50 for Loop 2 calls
        const calls = blockSource.getPublishedCheckpoints.mock.calls;
        const loop2Calls = calls.filter(([_, limit]) => limit === 50);
        expect(loop2Calls.length).toBeGreaterThanOrEqual(1);
      });
    });

    describe('prune scenarios', () => {
      it('prunes proposed chain back to checkpointed tip, then continues', async () => {
        // Phase 1: Sync blocks 1-9 with checkpoints 1-2, blocks 7-9 uncheckpointed
        setRemoteTipsMultiBlock(9, 6);

        await blockStream.work();

        expect(handler.events).toEqual([
          expectBlocksAdded([1, 2, 3]),
          expectCheckpointed(1),
          expectBlocksAdded([4, 5, 6]),
          expectCheckpointed(2),
          expectBlocksAdded([7, 8, 9]), // uncheckpointed
        ]);

        handler.clearEvents();

        // Update local state to reflect what the handler stored
        localData.proposed.number = BlockNumber(9);
        localData.checkpointed.block.number = BlockNumber(6);
        localData.checkpointed.checkpoint.number = CheckpointNumber(2);

        // Phase 2: Prune - proposed chain pruned back to checkpointed tip (block 6)
        // This happens when uncheckpointed blocks (7-9) are invalid
        // Mess up hashes for blocks 7-9 to simulate reorg
        localData.blockHashes[7] = '0xbad7';
        localData.blockHashes[8] = '0xbad8';
        localData.blockHashes[9] = '0xbad9';

        // Source now has proposed=6, checkpointed=6
        setRemoteTipsMultiBlock(6, 6);

        await blockStream.work();

        // Should emit chain-pruned back to block 6
        expect(handler.events).toEqual([
          {
            type: 'chain-pruned',
            block: makeBlockId(6),
            checkpoint: expect.objectContaining({ number: CheckpointNumber(2) }),
          },
        ]);

        handler.clearEvents();

        // Update local state after prune
        localData.proposed.number = BlockNumber(6);
        delete localData.blockHashes[7];
        delete localData.blockHashes[8];
        delete localData.blockHashes[9];

        // Phase 3: Chain continues - new blocks 7-12 arrive with checkpoints 3-4
        setRemoteTipsMultiBlock(12, 12);

        await blockStream.work();

        // Should continue normally: blocks 7-9 + checkpoint 3, blocks 10-12 + checkpoint 4
        expect(handler.events).toEqual([
          expectBlocksAdded([7, 8, 9]),
          expectCheckpointed(3),
          expectBlocksAdded([10, 11, 12]),
          expectCheckpointed(4),
        ]);
      });

      it('prunes proposed and checkpointed chains back to proven tip, then continues', async () => {
        // Phase 1: Sync blocks 1-12 with checkpoints 1-3, proven at checkpoint 2 (block 6)
        setRemoteTipsMultiBlock(12, 9, 6);

        await blockStream.work();

        expect(handler.events).toEqual([
          expectBlocksAdded([1, 2, 3]),
          expectCheckpointed(1),
          expectBlocksAdded([4, 5, 6]),
          expectCheckpointed(2),
          expectBlocksAdded([7, 8, 9]),
          expectCheckpointed(3),
          expectBlocksAdded([10, 11, 12]),
          { type: 'chain-proven', block: makeBlockId(6) },
        ]);

        handler.clearEvents();

        // Update local state
        localData.proposed.number = BlockNumber(12);
        localData.checkpointed.block.number = BlockNumber(9);
        localData.checkpointed.checkpoint.number = CheckpointNumber(3);
        localData.proven.block.number = BlockNumber(6);
        localData.proven.checkpoint.number = CheckpointNumber(2);

        // Phase 2: Prune - checkpoint 3 failed to prove, prune back to proven tip (block 6)
        // Mess up hashes for blocks 7-12 to simulate reorg
        for (let i = 7; i <= 12; i++) {
          localData.blockHashes[i] = `0xbad${i}`;
        }

        // Source now has proposed=6, checkpointed=6, proven=6
        setRemoteTipsMultiBlock(6, 6, 6);

        await blockStream.work();

        // Should emit chain-pruned back to block 6
        expect(handler.events).toEqual([
          {
            type: 'chain-pruned',
            block: makeBlockId(6),
            checkpoint: expect.objectContaining({ number: CheckpointNumber(2) }),
          },
        ]);

        handler.clearEvents();

        // Update local state after prune
        localData.proposed.number = BlockNumber(6);
        localData.checkpointed.block.number = BlockNumber(6);
        localData.checkpointed.checkpoint.number = CheckpointNumber(2);
        for (let i = 7; i <= 12; i++) {
          delete localData.blockHashes[i];
        }

        // Phase 3: Chain continues with new blocks and checkpoints
        // New blocks 7-15 arrive with checkpoints 3-5, proven advances to checkpoint 3
        setRemoteTipsMultiBlock(15, 15, 9);

        await blockStream.work();

        // Should continue normally with new blocks and checkpoints
        expect(handler.events).toEqual([
          expectBlocksAdded([7, 8, 9]),
          expectCheckpointed(3),
          expectBlocksAdded([10, 11, 12]),
          expectCheckpointed(4),
          expectBlocksAdded([13, 14, 15]),
          expectCheckpointed(5),
          { type: 'chain-proven', block: makeBlockId(9) },
        ]);
      });

      it('prunes uncheckpointed blocks and immediately receives new ones', async () => {
        // Phase 1: Sync blocks 1-6 with checkpoint 1, blocks 4-6 uncheckpointed
        setRemoteTipsMultiBlock(6, 3);

        await blockStream.work();

        expect(handler.events).toEqual([
          expectBlocksAdded([1, 2, 3]),
          expectCheckpointed(1),
          expectBlocksAdded([4, 5, 6]),
        ]);

        handler.clearEvents();

        // Update local state
        localData.proposed.number = BlockNumber(6);
        localData.checkpointed.block.number = BlockNumber(3);
        localData.checkpointed.checkpoint.number = CheckpointNumber(1);

        // Phase 2: Prune blocks 4-6 due to bad hashes
        localData.blockHashes[4] = '0xbad4';
        localData.blockHashes[5] = '0xbad5';
        localData.blockHashes[6] = '0xbad6';

        // Source still at checkpointed=3 (no new checkpoints yet)
        setRemoteTipsMultiBlock(3, 3);

        await blockStream.work();

        // Should emit prune back to block 3
        expect(handler.events).toEqual([
          {
            type: 'chain-pruned',
            block: makeBlockId(3),
            checkpoint: expect.objectContaining({ number: CheckpointNumber(1) }),
          },
        ]);

        handler.clearEvents();

        // Update local state after prune
        localData.proposed.number = BlockNumber(3);
        delete localData.blockHashes[4];
        delete localData.blockHashes[5];
        delete localData.blockHashes[6];

        // Phase 3: New blocks 4-9 arrive with checkpoints 2-3
        setRemoteTipsMultiBlock(9, 9);

        await blockStream.work();

        // Should continue normally with new blocks and checkpoints
        expect(handler.events).toEqual([
          expectBlocksAdded([4, 5, 6]),
          expectCheckpointed(2),
          expectBlocksAdded([7, 8, 9]),
          expectCheckpointed(3),
        ]);
      });

      it('prunes proposed chain back to genesis when no checkpoints exist', async () => {
        // Phase 1: Sync blocks 1-6, no checkpoints (checkpointed=0, proven=0, finalized=0)
        setRemoteTipsMultiBlock(6, 0);

        await blockStream.work();

        // All blocks come as uncheckpointed
        expect(handler.events).toEqual([expectBlocksAdded([1, 2, 3, 4, 5, 6])]);

        handler.clearEvents();

        // Update local state
        localData.proposed.number = BlockNumber(6);

        // Phase 2: All blocks are invalid, prune back to genesis (block 0)
        for (let i = 1; i <= 6; i++) {
          localData.blockHashes[i] = `0xbad${i}`;
        }

        // Source now has proposed=0, checkpointed=0
        setRemoteTipsMultiBlock(0, 0);

        await blockStream.work();

        // Should emit chain-pruned back to block 0
        expect(handler.events).toEqual([
          {
            type: 'chain-pruned',
            block: makeBlockId(0),
            checkpoint: expect.objectContaining({ number: CheckpointNumber(0) }),
          },
        ]);

        handler.clearEvents();

        // Update local state after prune
        localData.proposed.number = BlockNumber(0);
        for (let i = 1; i <= 6; i++) {
          delete localData.blockHashes[i];
        }

        // Phase 3: New blocks 1-6 arrive with checkpoints 1-2
        setRemoteTipsMultiBlock(6, 6);

        await blockStream.work();

        // Should continue normally from genesis
        expect(handler.events).toEqual([
          expectBlocksAdded([1, 2, 3]),
          expectCheckpointed(1),
          expectBlocksAdded([4, 5, 6]),
          expectCheckpointed(2),
        ]);
      });

      it('prunes both proposed and checkpointed chains back to genesis', async () => {
        // Phase 1: Sync blocks 1-6 with checkpoint 1 (blocks 1-3), blocks 4-6 uncheckpointed
        setRemoteTipsMultiBlock(6, 3);

        await blockStream.work();

        expect(handler.events).toEqual([
          expectBlocksAdded([1, 2, 3]),
          expectCheckpointed(1),
          expectBlocksAdded([4, 5, 6]),
        ]);

        handler.clearEvents();

        // Update local state
        localData.proposed.number = BlockNumber(6);
        localData.checkpointed.block.number = BlockNumber(3);
        localData.checkpointed.checkpoint.number = CheckpointNumber(1);

        // Phase 2: All blocks are invalid (even checkpointed ones), prune back to genesis
        for (let i = 1; i <= 6; i++) {
          localData.blockHashes[i] = `0xbad${i}`;
        }

        // Source now has proposed=0, checkpointed=0 (full chain reset)
        setRemoteTipsMultiBlock(0, 0);

        await blockStream.work();

        // Should emit chain-pruned back to block 0
        expect(handler.events).toEqual([
          {
            type: 'chain-pruned',
            block: makeBlockId(0),
            checkpoint: expect.objectContaining({ number: CheckpointNumber(0) }),
          },
        ]);

        handler.clearEvents();

        // Update local state after prune
        localData.proposed.number = BlockNumber(0);
        localData.checkpointed.block.number = BlockNumber(0);
        localData.checkpointed.checkpoint.number = CheckpointNumber(0);
        for (let i = 1; i <= 6; i++) {
          delete localData.blockHashes[i];
        }

        // Phase 3: New chain starts fresh with blocks 1-9 and checkpoints 1-3
        setRemoteTipsMultiBlock(9, 9);

        await blockStream.work();

        // Should continue normally from genesis
        expect(handler.events).toEqual([
          expectBlocksAdded([1, 2, 3]),
          expectCheckpointed(1),
          expectBlocksAdded([4, 5, 6]),
          expectCheckpointed(2),
          expectBlocksAdded([7, 8, 9]),
          expectCheckpointed(3),
        ]);
      });
    });

    describe('ignoreCheckpoints', () => {
      beforeEach(() => {
        blockStream = new TestL2BlockStream(blockSource, localData, handler, createLogger('test:l2-block-stream'), {
          batchSize: 10,
          ignoreCheckpoints: true,
        });
      });

      it('does not emit checkpoint events for new checkpointed blocks', async () => {
        // 6 blocks in 2 checkpoints (blocks 1-3 in checkpoint 1, blocks 4-6 in checkpoint 2)
        setRemoteTipsMultiBlock(6, 6);

        await blockStream.work();

        // Should emit blocks-added events but NO chain-checkpointed events
        expect(handler.events).toEqual([expectBlocksAdded([1, 2, 3]), expectBlocksAdded([4, 5, 6])]);
      });

      it('does not emit checkpoint events when blocks become checkpointed after being added', async () => {
        // Phase 1: Blocks 1-3 checkpointed (checkpoint 1), blocks 4-6 uncheckpointed
        setRemoteTipsMultiBlock(6, 3);

        await blockStream.work();

        // Blocks 1-3 via checkpoint, blocks 4-6 as uncheckpointed, no checkpoint events
        expect(handler.events).toEqual([expectBlocksAdded([1, 2, 3]), expectBlocksAdded([4, 5, 6])]);

        handler.clearEvents();

        // Update local state
        localData.proposed.number = BlockNumber(6);
        localData.checkpointed.block.number = BlockNumber(3);
        localData.checkpointed.checkpoint.number = CheckpointNumber(1);

        // Phase 2: Now blocks 4-6 become checkpointed too (checkpoint 2)
        setRemoteTipsMultiBlock(6, 6);

        await blockStream.work();

        // Checkpoint 2 event would normally be emitted for blocks 4-6, but not with ignoreCheckpoints
        expect(handler.events).toEqual([]);
      });

      it('does not emit checkpoint events but still emits prune events for uncheckpointed blocks', async () => {
        // Phase 1: Sync blocks 1-9, blocks 1-6 checkpointed (checkpoints 1-2), blocks 7-9 uncheckpointed
        setRemoteTipsMultiBlock(9, 6);

        await blockStream.work();

        expect(handler.events).toEqual([
          expectBlocksAdded([1, 2, 3]),
          expectBlocksAdded([4, 5, 6]),
          expectBlocksAdded([7, 8, 9]),
        ]);

        handler.clearEvents();

        // Update local state
        localData.proposed.number = BlockNumber(9);
        localData.checkpointed.block.number = BlockNumber(6);
        localData.checkpointed.checkpoint.number = CheckpointNumber(2);

        // Phase 2: Prune uncheckpointed blocks 7-9 (bad hashes)
        localData.blockHashes[7] = '0xbad7';
        localData.blockHashes[8] = '0xbad8';
        localData.blockHashes[9] = '0xbad9';

        setRemoteTipsMultiBlock(6, 6);

        await blockStream.work();

        // Should emit chain-pruned event (prune events are always emitted), no checkpoint events
        expect(handler.events).toEqual([
          {
            type: 'chain-pruned',
            block: makeBlockId(6),
            checkpoint: expect.objectContaining({ number: CheckpointNumber(2) }),
          },
        ]);
      });

      it('does not emit checkpoint events but still emits prune events for checkpointed blocks', async () => {
        // Phase 1: Sync blocks 1-9, all checkpointed (checkpoints 1-3)
        setRemoteTipsMultiBlock(9, 9);

        await blockStream.work();

        expect(handler.events).toEqual([
          expectBlocksAdded([1, 2, 3]),
          expectBlocksAdded([4, 5, 6]),
          expectBlocksAdded([7, 8, 9]),
        ]);

        handler.clearEvents();

        // Update local state
        localData.proposed.number = BlockNumber(9);
        localData.checkpointed.block.number = BlockNumber(9);
        localData.checkpointed.checkpoint.number = CheckpointNumber(3);

        // Phase 2: Prune checkpointed blocks (reorg of checkpointed chain back to checkpoint 1)
        localData.blockHashes[4] = '0xbad4';
        localData.blockHashes[5] = '0xbad5';
        localData.blockHashes[6] = '0xbad6';
        localData.blockHashes[7] = '0xbad7';
        localData.blockHashes[8] = '0xbad8';
        localData.blockHashes[9] = '0xbad9';

        setRemoteTipsMultiBlock(3, 3);

        await blockStream.work();

        // Should emit chain-pruned event
        expect(handler.events).toEqual([
          {
            type: 'chain-pruned',
            block: makeBlockId(3),
            checkpoint: expect.objectContaining({ number: CheckpointNumber(1) }),
          },
        ]);
      });

      it('does not emit checkpoint events but still emits proven and finalized events', async () => {
        // 9 blocks in 3 checkpoints, proven at block 6 (checkpoint 2), finalized at block 3 (checkpoint 1)
        setRemoteTipsMultiBlock(9, 9, 6, 3);

        await blockStream.work();

        // Should have blocks-added, chain-proven, chain-finalized, but NO checkpoint events
        expect(handler.events).toEqual([
          expectBlocksAdded([1, 2, 3]),
          expectBlocksAdded([4, 5, 6]),
          expectBlocksAdded([7, 8, 9]),
          { type: 'chain-proven', block: makeBlockId(6) },
          { type: 'chain-finalized', block: makeBlockId(3) },
        ]);
      });

      it('does not emit checkpoint events but still emits proven and finalized events with skipFinalized', async () => {
        // Use skipFinalized in addition to ignoreCheckpoints
        blockStream = new TestL2BlockStream(blockSource, localData, handler, createLogger('test:l2-block-stream'), {
          batchSize: 10,
          ignoreCheckpoints: true,
          skipFinalized: true,
        });

        // 12 blocks in 4 checkpoints, proven at block 9 (checkpoint 3), finalized at block 6 (checkpoint 2)
        setRemoteTipsMultiBlock(12, 12, 9, 6);

        // Local is behind - at block 3, finalized at block 3
        localData.proposed.number = BlockNumber(3);
        localData.checkpointed.block.number = BlockNumber(3);
        localData.checkpointed.checkpoint.number = CheckpointNumber(1);
        localData.proven.block.number = BlockNumber(3);
        localData.proven.checkpoint.number = CheckpointNumber(1);
        localData.finalized.block.number = BlockNumber(3);
        localData.finalized.checkpoint.number = CheckpointNumber(1);

        await blockStream.work();

        // With skipFinalized, we skip to the finalized tip (block 6), then sync from there
        // Should emit blocks 6-12, proven, finalized, but NO checkpoint events
        expect(handler.events).toEqual([
          expectBlocksAdded([6]),
          expectBlocksAdded([7, 8, 9]),
          expectBlocksAdded([10, 11, 12]),
          { type: 'chain-proven', block: makeBlockId(9) },
          { type: 'chain-finalized', block: makeBlockId(6) },
        ]);
      });

      it('does not emit checkpoint events after prune and re-sync with new blocks', async () => {
        // Phase 1: Sync blocks 1-9, all checkpointed (checkpoints 1-3)
        setRemoteTipsMultiBlock(9, 9);

        await blockStream.work();

        expect(handler.events).toEqual([
          expectBlocksAdded([1, 2, 3]),
          expectBlocksAdded([4, 5, 6]),
          expectBlocksAdded([7, 8, 9]),
        ]);

        handler.clearEvents();

        // Update local state
        localData.proposed.number = BlockNumber(9);
        localData.checkpointed.block.number = BlockNumber(9);
        localData.checkpointed.checkpoint.number = CheckpointNumber(3);

        // Phase 2: Prune back to block 6 (checkpoint 2)
        localData.blockHashes[7] = '0xbad7';
        localData.blockHashes[8] = '0xbad8';
        localData.blockHashes[9] = '0xbad9';

        setRemoteTipsMultiBlock(6, 6);

        await blockStream.work();

        expect(handler.events).toEqual([
          {
            type: 'chain-pruned',
            block: makeBlockId(6),
            checkpoint: expect.objectContaining({ number: CheckpointNumber(2) }),
          },
        ]);

        handler.clearEvents();

        // Update local state after prune
        localData.proposed.number = BlockNumber(6);
        localData.checkpointed.block.number = BlockNumber(6);
        localData.checkpointed.checkpoint.number = CheckpointNumber(2);
        delete localData.blockHashes[7];
        delete localData.blockHashes[8];
        delete localData.blockHashes[9];

        // Phase 3: New blocks 7-12 arrive, all checkpointed (checkpoints 3-4)
        setRemoteTipsMultiBlock(12, 12);

        await blockStream.work();

        // Should have new blocks-added events but still no checkpoint events
        expect(handler.events).toEqual([expectBlocksAdded([7, 8, 9]), expectBlocksAdded([10, 11, 12])]);
      });
    });
  });

  describe('skipFinalized', () => {
    let localData: TestL2BlockStreamLocalDataProvider;
    let handler: TestL2BlockStreamEventHandler;
    let blockStream: TestL2BlockStream;

    beforeEach(() => {
      localData = new TestL2BlockStreamLocalDataProvider();
      handler = new TestL2BlockStreamEventHandler();
      blockStream = new TestL2BlockStream(blockSource, localData, handler, createLogger('test:l2-block-stream'), {
        batchSize: 10,
        skipFinalized: true,
      });
    });

    it('skips ahead to the latest finalized block', async () => {
      setRemoteTips(40, 0, 38, 35);

      localData.proposed.number = BlockNumber(5);
      localData.proven.block.number = BlockNumber(2);
      localData.finalized.block.number = BlockNumber(2);

      await blockStream.work();

      // Instead of fetching the next local block (6), we skip ahead to the latest finalized (35) and go from there.
      expect(handler.events).toEqual([
        { type: 'blocks-added', blocks: times(6, i => makeBlock(i + 35)) },
        { type: 'chain-proven', block: makeBlockId(38) },
        { type: 'chain-finalized', block: makeBlockId(35) },
      ] satisfies L2BlockStreamEvent[]);
    });

    it('does not skip if already ahead of finalized', async () => {
      setRemoteTips(40, 0, 38, 35);

      localData.proposed.number = BlockNumber(38);
      localData.proven.block.number = BlockNumber(38);
      localData.finalized.block.number = BlockNumber(35);

      await blockStream.work();

      expect(handler.events).toEqual([
        { type: 'blocks-added', blocks: times(2, i => makeBlock(i + 39)) },
      ] satisfies L2BlockStreamEvent[]);
    });

    it('emits the finalized checkpoint when fetching the finalized block (inconsistency)', async () => {
      // This test demonstrates an inconsistency: Loop 1 skips finalized checkpoints via
      // nextCheckpointToEmit adjustment, but Loop 2 still emits the finalized checkpoint
      // when we fetch the finalized block.
      //
      // Scenario: Fresh start with skipFinalized=true
      // - Checkpoint 6 (block 6) is finalized
      // - Checkpoints 7-9 are checkpointed
      // - Blocks 10-12 are uncheckpointed
      //
      // Expected (if consistent): Skip checkpoint 6, only emit checkpoints 7+
      // Actual: Checkpoint 6 IS emitted because Loop 2 fetches block 6 and emits its checkpoint

      // 12 blocks total, checkpointed up to 9, proven at 9, finalized at 6
      setRemoteTips(12, 9, 9, 6);

      // Fresh start - no local blocks
      localData.proposed.number = BlockNumber(0);
      localData.checkpointed.block.number = BlockNumber(0);
      localData.checkpointed.checkpoint.number = CheckpointNumber(0);
      localData.proven.block.number = BlockNumber(0);
      localData.proven.checkpoint.number = CheckpointNumber(0);
      localData.finalized.block.number = BlockNumber(0);
      localData.finalized.checkpoint.number = CheckpointNumber(0);

      await blockStream.work();

      // With skipFinalized, nextCheckpointToEmit starts at checkpoint 6 (finalized checkpoint)
      // Loop 1 skips immediately (no local blocks)
      // Loop 2 starts at block 6 (finalized block), finds checkpoint 6, emits block 6, then emits checkpoint 6
      // This IS the inconsistency: we emit checkpoint 6 even though it's finalized
      expect(handler.events).toEqual([
        expectBlocksAdded([6]),
        expectCheckpointed(6), // <-- This is the finalized checkpoint being emitted!
        expectBlocksAdded([7]),
        expectCheckpointed(7),
        expectBlocksAdded([8]),
        expectCheckpointed(8),
        expectBlocksAdded([9]),
        expectCheckpointed(9),
        { type: 'blocks-added', blocks: times(3, i => makeBlock(i + 10)) },
        { type: 'chain-proven', block: makeBlockId(9) },
        { type: 'chain-finalized', block: makeBlockId(6) },
      ]);
    });

    it('does not emit finalized checkpointed blocks when skipFinalized is true', async () => {
      // Source: finalized=35, proven=38, checkpointed=38, proposed=40
      // All blocks up to 38 are checkpointed (each block is its own checkpoint), blocks 39-40 are uncheckpointed
      setRemoteTips(40, 38, 38, 35);

      // Local is at block 5, finalized at 2
      localData.proposed.number = BlockNumber(5);
      localData.checkpointed.block.number = BlockNumber(2);
      localData.checkpointed.checkpoint.number = CheckpointNumber(2);
      localData.proven.block.number = BlockNumber(2);
      localData.proven.checkpoint.number = CheckpointNumber(2);
      localData.finalized.block.number = BlockNumber(2);
      localData.finalized.checkpoint.number = CheckpointNumber(2);

      await blockStream.work();

      // With skipFinalized=true, we should skip to block 35 (finalized tip)
      // We should NOT emit blocks 6-34 since they are finalized
      // We should only emit blocks from 35 onwards, and checkpoint events from checkpoint 36 onwards
      // (checkpoint 35 is the finalized checkpoint, so we skip it too)
      expect(handler.events).toEqual([
        expect.objectContaining({
          type: 'blocks-added',
          blocks: [expect.objectContaining({ number: BlockNumber(35) })],
        }),
        expect.objectContaining({
          type: 'chain-checkpointed',
          block: expect.objectContaining({ number: BlockNumber(35) }),
          checkpoint: expect.objectContaining({
            checkpoint: expect.objectContaining({ number: CheckpointNumber(35) }),
          }),
        }),
        expect.objectContaining({
          type: 'blocks-added',
          blocks: [expect.objectContaining({ number: BlockNumber(36) })],
        }),
        expect.objectContaining({
          type: 'chain-checkpointed',
          block: expect.objectContaining({ number: BlockNumber(36) }),
          checkpoint: expect.objectContaining({
            checkpoint: expect.objectContaining({ number: CheckpointNumber(36) }),
          }),
        }),
        expect.objectContaining({
          type: 'blocks-added',
          blocks: [expect.objectContaining({ number: BlockNumber(37) })],
        }),
        expect.objectContaining({
          type: 'chain-checkpointed',
          block: expect.objectContaining({ number: BlockNumber(37) }),
          checkpoint: expect.objectContaining({
            checkpoint: expect.objectContaining({ number: CheckpointNumber(37) }),
          }),
        }),
        expect.objectContaining({
          type: 'blocks-added',
          blocks: [expect.objectContaining({ number: BlockNumber(38) })],
        }),
        expect.objectContaining({
          type: 'chain-checkpointed',
          block: expect.objectContaining({ number: BlockNumber(38) }),
          checkpoint: expect.objectContaining({
            checkpoint: expect.objectContaining({ number: CheckpointNumber(38) }),
          }),
        }),
        { type: 'blocks-added', blocks: times(2, i => makeBlock(i + 39)) },
        { type: 'chain-proven', block: makeBlockId(38) },
        { type: 'chain-finalized', block: makeBlockId(35) },
      ]);
    });
  });
});

class TestL2BlockStreamEventHandler implements L2BlockStreamEventHandler {
  public readonly events: L2BlockStreamEvent[] = [];
  public throwing: boolean = false;
  public callCount: number = 0;

  constructor(private forwardedTo?: L2BlockStreamEventHandler) {}

  async handleBlockStreamEvent(event: L2BlockStreamEvent): Promise<void> {
    if (this.forwardedTo) {
      await this.forwardedTo.handleBlockStreamEvent(event);
    }
    this.callCount++;
    if (this.throwing) {
      throw new Error('Handler error');
    }
    this.events.push(event);
  }

  clearEvents() {
    this.events.length = 0;
  }
}

class TestL2BlockStreamLocalDataProvider implements L2BlockStreamLocalDataProvider {
  public readonly blockHashes: Record<number, string> = {};

  public proposed = { number: BlockNumber.ZERO, hash: GENESIS_BLOCK_HEADER_HASH.toString() };
  public checkpointed = {
    block: { number: BlockNumber.ZERO, hash: GENESIS_BLOCK_HEADER_HASH.toString() },
    checkpoint: { number: CheckpointNumber.ZERO, hash: GENESIS_CHECKPOINT_HEADER_HASH.toString() },
  };
  public proven = {
    block: { number: BlockNumber.ZERO, hash: GENESIS_BLOCK_HEADER_HASH.toString() },
    checkpoint: { number: CheckpointNumber.ZERO, hash: GENESIS_CHECKPOINT_HEADER_HASH.toString() },
  };
  public finalized = {
    block: { number: BlockNumber.ZERO, hash: GENESIS_BLOCK_HEADER_HASH.toString() },
    checkpoint: { number: CheckpointNumber.ZERO, hash: GENESIS_CHECKPOINT_HEADER_HASH.toString() },
  };

  public getL2BlockHash(number: number): Promise<string | undefined> {
    return Promise.resolve(
      number > this.proposed.number ? undefined : (this.blockHashes[number] ?? new Fr(number).toString()),
    );
  }

  public getL2Tips(): Promise<L2Tips> {
    return Promise.resolve({
      proposed: this.proposed,
      checkpointed: this.checkpointed,
      proven: this.proven,
      finalized: this.finalized,
    });
  }
}

class TestL2BlockStream extends L2BlockStream {
  public running = true;

  public override work() {
    return super.work();
  }

  public override isRunning(): boolean {
    return this.running;
  }
}

class TestL2TipsMemoryStore extends L2TipsMemoryStore {
  protected override computeBlockHash(block: L2BlockNew): Promise<`0x${string}`> {
    return Promise.resolve(new Fr(block.number).toString());
  }
}
