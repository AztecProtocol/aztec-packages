import { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';
import { compactArray } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';

import { type MockProxy, mock } from 'jest-mock-extended';
import times from 'lodash.times';

import type { PublishedCheckpoint } from '../../checkpoint/published_checkpoint.js';
import type { BlockHeader } from '../../tx/block_header.js';
import type { CheckpointedL2Block } from '../checkpointed_l2_block.js';
import type { L2BlockNew } from '../l2_block_new.js';
import type { L2BlockId, L2BlockSource, L2Tips } from '../l2_block_source.js';
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

  /** Sets the remote tips. checkpointed_ defaults to 0 (no checkpointed blocks). */
  const setRemoteTips = (latest_: number, proven?: number, finalized?: number, checkpointed_?: number) => {
    proven = proven ?? 0;
    finalized = finalized ?? 0;
    checkpointed_ = checkpointed_ ?? 0;
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
    blockSource.getPublishedCheckpoints.mockImplementation((checkpointNumber: CheckpointNumber, _limit: number) =>
      Promise.resolve([
        {
          checkpoint: {
            number: checkpointNumber,
            hash: () => new Fr(checkpointNumber),
            blocks: [makeBlockWithHash(checkpointNumber)],
          },
        } as unknown as PublishedCheckpoint,
      ]),
    );
  });

  describe('with mock local data provider', () => {
    let localData: TestL2BlockStreamLocalDataProvider;
    let handler: TestL2BlockStreamEventHandler;
    let blockStream: TestL2BlockStream;

    beforeEach(() => {
      localData = new TestL2BlockStreamLocalDataProvider();
      handler = new TestL2BlockStreamEventHandler();
      blockStream = new TestL2BlockStream(blockSource, localData, handler, undefined, { batchSize: 10 });
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
        { type: 'chain-pruned', block: makeBlockId(36), reason: 'unproven', checkpoint: makeCheckpointId(0) },
        { type: 'blocks-added', blocks: times(9, i => makeBlock(i + 37)) },
      ] satisfies L2BlockStreamEvent[]);
    });

    it('emits events for chain proven and finalized', async () => {
      setRemoteTips(45, 40, 35);
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
      setRemoteTips(5, 0, 0, 5);

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
      expect(blockSource.getCheckpointedBlocks).toHaveBeenCalledTimes(5);
      expect(blockSource.getL2BlocksNew).not.toHaveBeenCalled();
    });

    it('fetches checkpointed blocks first, then uncheckpointed blocks', async () => {
      // Blocks 1-3 are checkpointed, blocks 4-5 are uncheckpointed
      setRemoteTips(5, 0, 0, 3);

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
      expect(blockSource.getCheckpointedBlocks).toHaveBeenCalledTimes(3);
      expect(blockSource.getL2BlocksNew).toHaveBeenCalledWith(BlockNumber(4), 2, undefined);
    });

    it('handles reorg with uncheckpointed reason when pruned to checkpointed tip', async () => {
      // Source: checkpointed=3, proposed=5
      setRemoteTips(5, 0, 0, 3);
      localData.proposed.number = BlockNumber(5);
      localData.checkpointed.block.number = BlockNumber(3);

      // Mess up hashes for blocks 4 and 5 (uncheckpointed blocks)
      localData.blockHashes[4] = `0xaa4`;
      localData.blockHashes[5] = `0xaa5`;

      await blockStream.work();

      // Prune to block 3 (checkpointed tip), reason should be 'uncheckpointed'
      expect(handler.events[0]).toEqual({
        type: 'chain-pruned',
        block: makeBlockId(3),
        reason: 'uncheckpointed',
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
      blockStream = new TestL2BlockStream(blockSource, localData, handler, undefined, { batchSize: 10 });
    });

    // Regression test for https://github.com/AztecProtocol/aztec-packages/issues/13471
    it('handles a prune to a block before start block', async () => {
      setRemoteTips(35, 25, 10);
      blockStream = new TestL2BlockStream(blockSource, localData, handler, undefined, {
        batchSize: 10,
        startingBlock: 30,
      });

      // We first seed a few blocks into the blockstream
      await blockStream.work();
      expect(handler.events).toEqual([
        { type: 'blocks-added', blocks: times(6, i => makeBlock(i + 30)) },
        { type: 'chain-proven', block: makeBlockId(25) },
        { type: 'chain-finalized', block: makeBlockId(10) },
      ]);
      handler.clearEvents();

      // And then we reorg
      setRemoteTips(25, 25, 10);
      await blockStream.work();
      expect(handler.events).toEqual([
        { type: 'chain-pruned', block: makeBlockId(25), reason: 'unproven', checkpoint: makeCheckpointId(0) },
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
      proven?: number,
      finalized?: number,
      checkpointedBlock?: number,
    ) => {
      proven = proven ?? 0;
      finalized = finalized ?? 0;
      checkpointedBlock = checkpointedBlock ?? 0;
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
      blockStream = new TestL2BlockStream(blockSource, localData, handler, undefined, { batchSize: 10 });

      // Override the mocks to support multiple blocks per checkpoint
      blockSource.getCheckpointedBlocks.mockImplementation((from, limit) =>
        Promise.resolve(
          compactArray(
            times(limit, i => (from + i > checkpointed ? undefined : makeCheckpointedBlockInCheckpoint(from + i))),
          ),
        ),
      );

      // Returns published checkpoints with multiple blocks each
      blockSource.getPublishedCheckpoints.mockImplementation((checkpointNumber: CheckpointNumber, _limit: number) => {
        const firstBlock = getFirstBlockInCheckpoint(checkpointNumber);
        const lastBlock = Math.min(getLastBlockInCheckpoint(checkpointNumber), checkpointed);
        const blocks = times(lastBlock - firstBlock + 1, i => makeBlockInCheckpointWithHash(firstBlock + i));
        return Promise.resolve([
          {
            checkpoint: {
              number: checkpointNumber,
              hash: () => new Fr(checkpointNumber),
              blocks,
            },
          } as unknown as PublishedCheckpoint,
        ]);
      });
    });

    it('emits all blocks in a checkpoint before chain-checkpointed event', async () => {
      // Set up: 6 blocks in 2 checkpoints (blocks 1-3 in checkpoint 1, blocks 4-6 in checkpoint 2)
      setRemoteTipsMultiBlock(6, 0, 0, 6);

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
      setRemoteTipsMultiBlock(5, 0, 0, 3);

      await blockStream.work();

      // Should emit checkpoint 1 blocks, then checkpoint event, then uncheckpointed blocks 4-5
      expect(handler.events).toEqual([expectBlocksAdded([1, 2, 3]), expectCheckpointed(1), expectBlocksAdded([4, 5])]);
    });

    it('handles starting from middle of a checkpoint', async () => {
      // Set up: 9 blocks in 3 checkpoints, but we start from block 5 (middle of checkpoint 2)
      // Local has blocks 1-4, local checkpointed = 0
      setRemoteTipsMultiBlock(9, 0, 0, 9);
      localData.proposed.number = BlockNumber(4);

      await blockStream.work();

      // Should first emit checkpoint 1 (blocks 1-3 already local)
      // Then continue from block 5, which is in checkpoint 2
      // Blocks 5-6 complete checkpoint 2, then blocks 7-9 complete checkpoint 3
      expect(handler.events).toEqual([
        expectCheckpointed(1), // checkpoint 1 for already-local blocks 1-3
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
      setRemoteTipsMultiBlock(6, 0, 0, 6);

      await blockStream.work();

      // Extract the chain-checkpointed events
      const checkpointEvents = handler.events.filter(e => e.type === 'chain-checkpointed');
      expect(checkpointEvents).toHaveLength(2);
      expect((checkpointEvents[0] as any).checkpoint.checkpoint.number).toBe(CheckpointNumber(1));
      expect((checkpointEvents[1] as any).checkpoint.checkpoint.number).toBe(CheckpointNumber(2));
    });

    it('handles many checkpoints with batching', async () => {
      // Set up: 12 blocks in 4 checkpoints, with batch size of 5
      blockStream = new TestL2BlockStream(blockSource, localData, handler, undefined, { batchSize: 5 });
      setRemoteTipsMultiBlock(12, 0, 0, 12);

      await blockStream.work();

      // Should have 4 checkpoint events (one per checkpoint)
      const checkpointEvents = handler.events.filter(e => e.type === 'chain-checkpointed');
      expect(checkpointEvents).toHaveLength(4);

      // Should have multiple blocks-added events due to batching and checkpoint boundaries
      const blocksAddedEvents = handler.events.filter(e => e.type === 'blocks-added');
      expect(blocksAddedEvents.length).toBeGreaterThanOrEqual(4);

      // Verify all blocks were added in order
      const allBlocks = blocksAddedEvents.flatMap(e => (e as any).blocks);
      expect(allBlocks.map((b: L2BlockNew) => b.number)).toEqual(times(12, i => BlockNumber(i + 1)));
    });

    it('emits checkpoint event when blocks become checkpointed after being added as uncheckpointed', async () => {
      // Phase 1: Start with 3 checkpointed blocks (checkpoint 1), then add blocks 4-6 as uncheckpointed
      setRemoteTipsMultiBlock(6, 0, 0, 3);

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
      setRemoteTipsMultiBlock(6, 0, 0, 6);

      await blockStream.work();

      // Should emit a checkpoint event for checkpoint 2 (blocks 4-6), even though blocks were already added
      const checkpointEvents = handler.events.filter(e => e.type === 'chain-checkpointed');
      expect(checkpointEvents).toHaveLength(1);
      expect((checkpointEvents[0] as any).checkpoint.checkpoint.number).toBe(CheckpointNumber(2));
    });

    it('emits checkpoint event BEFORE new uncheckpointed blocks when checkpoint completes', async () => {
      // Phase 1: Start with 3 checkpointed blocks (checkpoint 1), then add blocks 4-6 as uncheckpointed
      setRemoteTipsMultiBlock(6, 0, 0, 3);

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
      setRemoteTipsMultiBlock(7, 0, 0, 6);

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
      setRemoteTipsMultiBlock(9, 0, 0, 6);

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
      setRemoteTipsMultiBlock(12, 0, 0, 9);

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
      setRemoteTipsMultiBlock(12, 0, 0, 12);

      await blockStream.work();

      // Should emit checkpoint 4 for already-local blocks 10-12
      expect(handler.events).toEqual([expectCheckpointed(4)]);
    });

    it('emits all checkpoints when source jumps ahead with multiple new checkpoints', async () => {
      // Phase 1: Start with checkpoint 1 complete (blocks 1-3), blocks 4-6 uncheckpointed
      setRemoteTipsMultiBlock(6, 0, 0, 3);

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
      setRemoteTipsMultiBlock(12, 0, 0, 12);

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
  });

  describe('skipFinalized', () => {
    let localData: TestL2BlockStreamLocalDataProvider;
    let handler: TestL2BlockStreamEventHandler;
    let blockStream: TestL2BlockStream;

    beforeEach(() => {
      localData = new TestL2BlockStreamLocalDataProvider();
      handler = new TestL2BlockStreamEventHandler();
      blockStream = new TestL2BlockStream(blockSource, localData, handler, undefined, {
        batchSize: 10,
        skipFinalized: true,
      });
    });

    it('skips ahead to the latest finalized block', async () => {
      setRemoteTips(40, 38, 35);

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
      setRemoteTips(40, 38, 35);

      localData.proposed.number = BlockNumber(38);
      localData.proven.block.number = BlockNumber(38);
      localData.finalized.block.number = BlockNumber(35);

      await blockStream.work();

      expect(handler.events).toEqual([
        { type: 'blocks-added', blocks: times(2, i => makeBlock(i + 39)) },
      ] satisfies L2BlockStreamEvent[]);
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

  public proposed = { number: BlockNumber.ZERO, hash: '' };
  public checkpointed = {
    block: { number: BlockNumber.ZERO, hash: '' },
    checkpoint: { number: CheckpointNumber.ZERO, hash: '' },
  };
  public proven = {
    block: { number: BlockNumber.ZERO, hash: '' },
    checkpoint: { number: CheckpointNumber.ZERO, hash: '' },
  };
  public finalized = {
    block: { number: BlockNumber.ZERO, hash: '' },
    checkpoint: { number: CheckpointNumber.ZERO, hash: '' },
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
