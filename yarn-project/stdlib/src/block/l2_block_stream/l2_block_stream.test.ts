import { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';
import { compactArray } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';

import { type MockProxy, mock } from 'jest-mock-extended';
import times from 'lodash.times';

import type { PublishedCheckpoint } from '../../checkpoint/published_checkpoint.js';
import type { BlockHeader } from '../../tx/block_header.js';
import type { CheckpointedL2Block } from '../checkpointed_l2_block.js';
import type { L2BlockNew } from '../l2_block_new.js';
import type { CheckpointId, L2BlockId, L2BlockSource, L2Tips } from '../l2_block_source.js';
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

  const makeCheckpointedBlock = (number: number, checkpointNum: number): CheckpointedL2Block =>
    ({
      block: makeBlock(number),
      checkpointNumber: checkpointNum,
    }) as CheckpointedL2Block;

  const makeHeader = (number: number) => ({ hash: () => Promise.resolve(new Fr(number)) }) as BlockHeader;

  const makeBlockId = (number: number): L2BlockId => ({ number: BlockNumber(number), hash: makeHash(number) });

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
            blocks: [makeBlock(checkpointNumber)],
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
        { type: 'blocks-added', blocks: [makeBlock(1)] },
        expect.objectContaining({ type: 'chain-checkpointed' }),
        { type: 'blocks-added', blocks: [makeBlock(2)] },
        expect.objectContaining({ type: 'chain-checkpointed' }),
        { type: 'blocks-added', blocks: [makeBlock(3)] },
        expect.objectContaining({ type: 'chain-checkpointed' }),
        { type: 'blocks-added', blocks: [makeBlock(4)] },
        expect.objectContaining({ type: 'chain-checkpointed' }),
        { type: 'blocks-added', blocks: [makeBlock(5)] },
        expect.objectContaining({ type: 'chain-checkpointed' }),
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
        { type: 'blocks-added', blocks: [makeBlock(1)] },
        expect.objectContaining({ type: 'chain-checkpointed' }),
        { type: 'blocks-added', blocks: [makeBlock(2)] },
        expect.objectContaining({ type: 'chain-checkpointed' }),
        { type: 'blocks-added', blocks: [makeBlock(3)] },
        expect.objectContaining({ type: 'chain-checkpointed' }),
        { type: 'blocks-added', blocks: [makeBlock(4), makeBlock(5)] },
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
