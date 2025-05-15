import { compactArray } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields';

import { type MockProxy, mock } from 'jest-mock-extended';
import times from 'lodash.times';

import type { BlockHeader } from '../../tx/block_header.js';
import type { L2Block } from '../l2_block.js';
import type { L2BlockId, L2BlockSource, L2Tips } from '../l2_block_source.js';
import type { PublishedL2Block } from '../published_l2_block.js';
import type { L2BlockStreamEvent, L2BlockStreamEventHandler, L2BlockStreamLocalDataProvider } from './interfaces.js';
import { L2BlockStream } from './l2_block_stream.js';
import { L2TipsMemoryStore } from './l2_tips_memory_store.js';

describe('L2BlockStream', () => {
  let blockSource: MockProxy<L2BlockSource>;

  let latest: number = 0;

  const makeHash = (number: number) => new Fr(number).toString();

  const makeBlock = (number: number) => ({ block: { number } as L2Block }) as PublishedL2Block;

  const makeHeader = (number: number) => ({ hash: () => Promise.resolve(new Fr(number)) }) as BlockHeader;

  const makeBlockId = (number: number): L2BlockId => ({ number, hash: makeHash(number) });

  const setRemoteTips = (latest_: number, proven?: number, finalized?: number) => {
    proven = proven ?? 0;
    finalized = finalized ?? 0;
    latest = latest_;

    blockSource.getL2Tips.mockResolvedValue({
      latest: { number: latest, hash: makeHash(latest) },
      proven: { number: proven, hash: makeHash(proven) },
      finalized: { number: finalized, hash: makeHash(finalized) },
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

    // And returns blocks up until what was reported as the latest block
    blockSource.getPublishedBlocks.mockImplementation((from, limit) =>
      Promise.resolve(compactArray(times(limit, i => (from + i > latest ? undefined : makeBlock(from + i))))),
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
      localData.latest.number = 10;

      await blockStream.work();
      expect(blockSource.getPublishedBlocks).toHaveBeenCalledWith(11, 5, undefined);
      expect(handler.events).toEqual([
        { type: 'blocks-added', blocks: times(5, i => makeBlock(i + 11)) },
      ] satisfies L2BlockStreamEvent[]);
    });

    it('pulls new blocks in multiple batches', async () => {
      setRemoteTips(45);

      await blockStream.work();
      expect(blockSource.getPublishedBlocks).toHaveBeenCalledTimes(5);
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
      expect(blockSource.getPublishedBlocks).toHaveBeenCalledTimes(1);
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
      localData.latest.number = 40;

      for (const i of [37, 38, 39, 40]) {
        // Mess up the block hashes for a bunch of blocks
        localData.blockHashes[i] = `0xaa${i.toString()}`;
      }

      await blockStream.work();
      expect(handler.events).toEqual([
        { type: 'chain-pruned', block: makeBlockId(36) },
        { type: 'blocks-added', blocks: times(9, i => makeBlock(i + 37)) },
      ] satisfies L2BlockStreamEvent[]);
    });

    it('emits events for chain proven and finalized', async () => {
      setRemoteTips(45, 40, 35);
      localData.latest.number = 40;
      localData.proven.number = 10;
      localData.finalized.number = 10;

      await blockStream.work();
      expect(handler.events).toEqual([
        { type: 'blocks-added', blocks: times(5, i => makeBlock(i + 41)) },
        { type: 'chain-proven', block: makeBlockId(40) },
        { type: 'chain-finalized', block: makeBlockId(35) },
      ] satisfies L2BlockStreamEvent[]);
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
      ] satisfies L2BlockStreamEvent[]);
      handler.clearEvents();

      // And then we reorg
      setRemoteTips(25, 25, 10);
      await blockStream.work();
      expect(handler.events).toEqual([{ type: 'chain-pruned', block: makeBlockId(25) }] satisfies L2BlockStreamEvent[]);
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

      localData.latest.number = 5;
      localData.proven.number = 2;
      localData.finalized.number = 2;

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

      localData.latest.number = 38;
      localData.proven.number = 38;
      localData.finalized.number = 35;

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

  public latest = { number: 0, hash: '' };
  public proven = { number: 0, hash: '' };
  public finalized = { number: 0, hash: '' };

  public getL2BlockHash(number: number): Promise<string | undefined> {
    return Promise.resolve(
      number > this.latest.number ? undefined : (this.blockHashes[number] ?? new Fr(number).toString()),
    );
  }

  public getL2Tips(): Promise<L2Tips> {
    return Promise.resolve(this);
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
  protected override computeBlockHash(block: L2Block): Promise<`0x${string}`> {
    return Promise.resolve(new Fr(block.number).toString());
  }
}
