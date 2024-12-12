import { type BlockHeader, Fr } from '@aztec/circuits.js';
import { compactArray } from '@aztec/foundation/collection';

import { type MockProxy, mock } from 'jest-mock-extended';
import times from 'lodash.times';

import { type L2Block } from '../l2_block.js';
import { type L2BlockSource, type L2Tips } from '../l2_block_source.js';
import {
  L2BlockStream,
  type L2BlockStreamEvent,
  type L2BlockStreamEventHandler,
  type L2BlockStreamLocalDataProvider,
} from './l2_block_stream.js';

describe('L2BlockStream', () => {
  let blockStream: TestL2BlockStream;

  let blockSource: MockProxy<L2BlockSource>;
  let localData: TestL2BlockStreamLocalDataProvider;
  let handler: TestL2BlockStreamEventHandler;

  let latest: number = 0;

  beforeEach(() => {
    blockSource = mock<L2BlockSource>();
    localData = new TestL2BlockStreamLocalDataProvider();
    handler = new TestL2BlockStreamEventHandler();

    // Archiver returns headers with hashes equal to the block number for simplicity
    blockSource.getBlockHeader.mockImplementation(number =>
      Promise.resolve(makeHeader(number === 'latest' ? 1 : number)),
    );

    // And returns blocks up until what was reported as the latest block
    blockSource.getBlocks.mockImplementation((from, limit) =>
      Promise.resolve(compactArray(times(limit, i => (from + i > latest ? undefined : makeBlock(from + i))))),
    );

    blockStream = new TestL2BlockStream(blockSource, localData, handler, undefined, { batchSize: 10 });
  });

  const makeBlock = (number: number) => ({ number } as L2Block);

  const makeHeader = (number: number) => mock<BlockHeader>({ hash: () => new Fr(number) } as BlockHeader);

  const setRemoteTips = (latest_: number, proven?: number, finalized?: number) => {
    proven = proven ?? 0;
    finalized = finalized ?? 0;
    latest = latest_;

    blockSource.getL2Tips.mockResolvedValue({
      latest: { number: latest, hash: latest.toString() },
      proven: { number: proven, hash: proven.toString() },
      finalized: { number: finalized, hash: finalized.toString() },
    });
  };

  describe('work', () => {
    it('pulls new blocks from start', async () => {
      setRemoteTips(5);

      await blockStream.work();
      expect(handler.events).toEqual([{ type: 'blocks-added', blocks: times(5, i => makeBlock(i + 1)) }]);
    });

    it('pulls new blocks from offset', async () => {
      setRemoteTips(15);
      localData.latest.number = 10;

      await blockStream.work();
      expect(blockSource.getBlocks).toHaveBeenCalledWith(11, 5, undefined);
      expect(handler.events).toEqual([{ type: 'blocks-added', blocks: times(5, i => makeBlock(i + 11)) }]);
    });

    it('pulls new blocks in multiple batches', async () => {
      setRemoteTips(45);

      await blockStream.work();
      expect(blockSource.getBlocks).toHaveBeenCalledTimes(5);
      expect(handler.events).toEqual([
        { type: 'blocks-added', blocks: times(10, i => makeBlock(i + 1)) },
        { type: 'blocks-added', blocks: times(10, i => makeBlock(i + 11)) },
        { type: 'blocks-added', blocks: times(10, i => makeBlock(i + 21)) },
        { type: 'blocks-added', blocks: times(10, i => makeBlock(i + 31)) },
        { type: 'blocks-added', blocks: times(5, i => makeBlock(i + 41)) },
      ]);
    });

    it('halts pulling blocks if stopped', async () => {
      setRemoteTips(45);
      blockStream.running = false;

      await blockStream.work();
      expect(blockSource.getBlocks).toHaveBeenCalledTimes(1);
      expect(handler.events).toEqual([{ type: 'blocks-added', blocks: times(10, i => makeBlock(i + 1)) }]);
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
        { type: 'chain-pruned', blockNumber: 36 },
        { type: 'blocks-added', blocks: times(9, i => makeBlock(i + 37)) },
      ]);
    });

    it('emits events for chain proven and finalized', async () => {
      setRemoteTips(45, 40, 35);
      localData.latest.number = 40;
      localData.proven.number = 10;
      localData.finalized.number = 10;

      await blockStream.work();
      expect(handler.events).toEqual([
        { type: 'blocks-added', blocks: times(5, i => makeBlock(i + 41)) },
        { type: 'chain-proven', blockNumber: 40 },
        { type: 'chain-finalized', blockNumber: 35 },
      ]);
    });
  });
});

class TestL2BlockStreamEventHandler implements L2BlockStreamEventHandler {
  public readonly events: L2BlockStreamEvent[] = [];

  handleBlockStreamEvent(event: L2BlockStreamEvent): Promise<void> {
    this.events.push(event);
    return Promise.resolve();
  }
}

class TestL2BlockStreamLocalDataProvider implements L2BlockStreamLocalDataProvider {
  public readonly blockHashes: Record<number, string> = {};

  public latest = { number: 0, hash: '' };
  public proven = { number: 0, hash: '' };
  public finalized = { number: 0, hash: '' };

  public getL2BlockHash(number: number): Promise<string | undefined> {
    return Promise.resolve(
      number > this.latest.number ? undefined : this.blockHashes[number] ?? new Fr(number).toString(),
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
