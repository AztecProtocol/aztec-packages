import { BlockNumber, CheckpointNumber, IndexWithinCheckpoint } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { sleep } from '@aztec/foundation/sleep';
import { Timer } from '@aztec/foundation/timer';
import {
  type ArchiverEmitter,
  type BlockData,
  BlockHash,
  type BlockQuery,
  L2Block,
  type L2BlockSource,
  type L2BlockSourceEventEmitter,
  L2BlockSourceEvents,
} from '@aztec/stdlib/block';
import { BlockHeader, GlobalVariables } from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';
import { EventEmitter } from 'node:events';

import { MAX_CONCURRENT_HOLDS, UnseenBlockHoldOff } from './unseen_block_hold_off.js';

const BY_NUMBER_WAIT_MS = 1000;
const BY_HASH_WAIT_MS = 600;

/** Builds minimal block metadata for a given block number and hash, as returned by the block source. */
const makeBlockData = (blockNumber: BlockNumber, blockHash: BlockHash = BlockHash.random()): BlockData => ({
  header: BlockHeader.empty({ globalVariables: GlobalVariables.empty({ blockNumber }) }),
  archive: L2Block.empty().archive,
  blockHash,
  checkpointNumber: CheckpointNumber(1),
  indexWithinCheckpoint: IndexWithinCheckpoint(0),
});

describe('UnseenBlockHoldOff', () => {
  let blockSource: MockProxy<L2BlockSourceEventEmitter>;
  /** Stands in for the archiver's emitter: the hold-off wakes held requests off the updates reported here. */
  let events: EventEmitter;
  let holdOff: UnseenBlockHoldOff;
  let tip: BlockNumber;
  /** Hash of the synthetic genesis block, which this source never serves — as the block store does not. */
  let genesisBlockHash: BlockHash;
  /** Blocks the source knows about, keyed by block number. Tests add entries to simulate a block arriving. */
  let chain: Map<BlockNumber, BlockData>;

  /** Adds a block to the source without reporting it, as a source that never notifies would leave it. */
  const addBlockSilently = (blockNumber: BlockNumber, blockHash?: BlockHash) => {
    const data = makeBlockData(blockNumber, blockHash);
    chain.set(blockNumber, data);
    tip = BlockNumber(Math.max(tip, blockNumber));
    return data;
  };

  /** Adds a block and reports the update, as the archiver does after a sync pass that committed one. */
  const addBlock = (blockNumber: BlockNumber, blockHash?: BlockHash) => {
    const data = addBlockSilently(blockNumber, blockHash);
    events.emit(L2BlockSourceEvents.L2BlockSourceUpdated);
    return data;
  };

  beforeEach(() => {
    tip = BlockNumber(5);
    genesisBlockHash = BlockHash.random();
    chain = new Map();
    for (let i = 1; i <= tip; i++) {
      chain.set(BlockNumber(i), makeBlockData(BlockNumber(i)));
    }

    events = new EventEmitter();
    blockSource = mock<L2BlockSourceEventEmitter>({ events: events as ArchiverEmitter });
    blockSource.getGenesisBlockHash.mockImplementation(() => genesisBlockHash);
    blockSource.getBlockNumber.mockImplementation((() => Promise.resolve(tip)) as L2BlockSource['getBlockNumber']);
    blockSource.getBlockData.mockImplementation(((query: BlockQuery) => {
      if ('number' in query) {
        return Promise.resolve(chain.get(query.number));
      }
      if ('hash' in query) {
        return Promise.resolve([...chain.values()].find(data => data.blockHash.equals(query.hash)));
      }
      if ('archive' in query) {
        return Promise.resolve([...chain.values()].find(data => data.archive.root.equals(query.archive)));
      }
      return Promise.resolve(chain.get(tip));
    }) as L2BlockSource['getBlockData']);

    holdOff = new UnseenBlockHoldOff(blockSource, {
      byNumberWaitMs: BY_NUMBER_WAIT_MS,
      byHashWaitMs: BY_HASH_WAIT_MS,
    });
  });

  // A single read of the block source proves nothing was polled: holding always issues further reads. Wall-clock
  // upper bounds would be the flakier way to assert the same thing, so only lower bounds are checked below.
  const expectResolvedWithoutHolding = () => expect(blockSource.getBlockData).toHaveBeenCalledTimes(1);

  it('returns a known block immediately without waiting', async () => {
    const data = await holdOff.getBlockData({ number: BlockNumber(3) });

    expect(data?.header.getBlockNumber()).toEqual(BlockNumber(3));
    expectResolvedWithoutHolding();
  });

  describe('query by block number', () => {
    it('waits for a block one ahead of the tip and returns it once it arrives', async () => {
      const requested = BlockNumber(tip + 1);
      void sleep(300).then(() => addBlock(requested));

      const data = await holdOff.getBlockData({ number: requested });

      // Returning the block at all proves the budget had not expired: an expired budget resolves to undefined. The
      // extra reads prove it was waited for rather than served straight away — a wall-clock bound against the same
      // delay races the clock the delay itself is scheduled on.
      expect(data?.header.getBlockNumber()).toEqual(requested);
      expect(blockSource.getBlockData.mock.calls.length).toBeGreaterThan(1);
    });

    it('gives up after the by-number budget when the block never arrives', async () => {
      const timer = new Timer();
      const data = await holdOff.getBlockData({ number: BlockNumber(tip + 1) });

      expect(data).toBeUndefined();
      // Also pins which budget was spent: the shorter by-hash budget would fall short of this bound.
      expect(timer.ms()).toBeGreaterThanOrEqual(BY_NUMBER_WAIT_MS);
    });

    it('fails fast for a block more than one ahead of the tip', async () => {
      const data = await holdOff.getBlockData({ number: BlockNumber(tip + 2) });

      expect(data).toBeUndefined();
      expectResolvedWithoutHolding();
    });

    it('fails fast for a missing block at or below the tip', async () => {
      chain.delete(BlockNumber(3));

      const data = await holdOff.getBlockData({ number: BlockNumber(3) });

      expect(data).toBeUndefined();
      expectResolvedWithoutHolding();
    });
  });

  describe('query by block hash or archive root', () => {
    it('waits for an unknown block hash and returns the block once it arrives', async () => {
      const blockHash = BlockHash.random();
      void sleep(200).then(() => addBlock(BlockNumber(tip + 1), blockHash));

      const data = await holdOff.getBlockData({ hash: blockHash });

      expect(data?.blockHash).toEqual(blockHash);
      expect(blockSource.getBlockData.mock.calls.length).toBeGreaterThan(1);
    });

    it('gives up after the by-hash budget when the block hash never arrives', async () => {
      const timer = new Timer();
      const data = await holdOff.getBlockData({ hash: BlockHash.random() });

      expect(data).toBeUndefined();
      expect(timer.ms()).toBeGreaterThanOrEqual(BY_HASH_WAIT_MS);
    });

    it('waits on an unknown archive root with the by-hash budget', async () => {
      const timer = new Timer();
      const data = await holdOff.getBlockData({ archive: Fr.random() });

      expect(data).toBeUndefined();
      expect(timer.ms()).toBeGreaterThanOrEqual(BY_HASH_WAIT_MS);
    });

    it('fails fast on the genesis block hash, which no wait can make appear', async () => {
      // A PXE anchors its early queries on the genesis block before it has synced a block. Genesis is synthetic,
      // so a source that does not serve it now never will, and the query must not burn a whole budget.
      const timer = new Timer();
      const data = await holdOff.getBlockData({ hash: genesisBlockHash });

      expect(data).toBeUndefined();
      expectResolvedWithoutHolding();
      expect(timer.ms()).toBeLessThan(BY_HASH_WAIT_MS);
    });

    it('does not consult the tip when resolving a hash', async () => {
      await holdOff.getBlockData({ hash: BlockHash.random() });
      expect(blockSource.getBlockNumber).not.toHaveBeenCalled();
    });
  });

  describe('waking held requests', () => {
    it('reads the source when it reports an update and not on a schedule of its own', async () => {
      const blockHash = BlockHash.random();
      const query = holdOff.getBlockData({ hash: blockHash });
      await sleep(BY_HASH_WAIT_MS / 4);
      addBlockSilently(BlockNumber(tip + 1), blockHash);
      await sleep(BY_HASH_WAIT_MS / 4);

      // The block is there for the taking, but nothing has woken the request, so it has not read the source again.
      expect(blockSource.getBlockData).toHaveBeenCalledTimes(1);

      events.emit(L2BlockSourceEvents.L2BlockSourceUpdated);

      expect((await query)?.blockHash).toEqual(blockHash);
    });

    it('does not hold off at all when the source reports no updates', async () => {
      const sourceWithoutEvents = mock<L2BlockSource>();
      sourceWithoutEvents.getGenesisBlockHash.mockImplementation(() => genesisBlockHash);
      sourceWithoutEvents.getBlockData.mockResolvedValue(undefined);
      const withoutEvents = new UnseenBlockHoldOff(sourceWithoutEvents, {
        byNumberWaitMs: BY_NUMBER_WAIT_MS,
        byHashWaitMs: BY_HASH_WAIT_MS,
      });

      const timer = new Timer();
      expect(await withoutEvents.getBlockData({ hash: BlockHash.random() })).toBeUndefined();
      expect(timer.ms()).toBeLessThan(BY_HASH_WAIT_MS);
      expect(sourceWithoutEvents.getBlockData).toHaveBeenCalledTimes(1);
    });
  });

  describe('cases that never wait', () => {
    it('fails fast on a tag miss', async () => {
      chain.clear();

      const data = await holdOff.getBlockData({ tag: 'proven' });

      expect(data).toBeUndefined();
      expectResolvedWithoutHolding();
    });

    it('fails fast when both budgets are zero', async () => {
      const disabled = new UnseenBlockHoldOff(blockSource, { byNumberWaitMs: 0, byHashWaitMs: 0 });

      expect(await disabled.getBlockData({ number: BlockNumber(tip + 1) })).toBeUndefined();
      expect(await disabled.getBlockData({ hash: BlockHash.random() })).toBeUndefined();

      // One read per query and nothing more: neither was polled.
      expect(blockSource.getBlockData).toHaveBeenCalledTimes(2);
    });

    it('fails fast when the caller opts out of holding off', async () => {
      const data = await holdOff.getBlockData({ number: BlockNumber(tip + 1) }, { holdOff: false });

      expect(data).toBeUndefined();
      expectResolvedWithoutHolding();
      expect(blockSource.getBlockNumber).not.toHaveBeenCalled();
    });
  });

  describe('getBlock', () => {
    /** Serves full blocks for the same chain the metadata reads see, for every query form. */
    const mockGetBlock = () =>
      blockSource.getBlock.mockImplementation(((query: BlockQuery) => {
        const found =
          'number' in query
            ? chain.get(query.number)
            : 'hash' in query
              ? [...chain.values()].find(data => data.blockHash.equals(query.hash))
              : undefined;
        return Promise.resolve(found === undefined ? undefined : L2Block.empty());
      }) as L2BlockSource['getBlock']);

    it('returns a known block immediately', async () => {
      mockGetBlock();

      expect(await holdOff.getBlock({ number: BlockNumber(3) })).toBeDefined();
      // The block read answers the query on its own: no metadata read is issued alongside it.
      expect(blockSource.getBlockData).not.toHaveBeenCalled();
    });

    it('waits on block metadata and reads the block once it arrives', async () => {
      mockGetBlock();
      const blockHash = BlockHash.random();
      void sleep(200).then(() => addBlock(BlockNumber(tip + 1), blockHash));

      expect(await holdOff.getBlock({ hash: blockHash })).toBeDefined();
      // Once to answer the query and once to serve it: waiting is done on metadata, so a held request never
      // reconstructs a whole block just to check whether it has arrived.
      expect(blockSource.getBlock).toHaveBeenCalledTimes(2);
      expect(blockSource.getBlockData.mock.calls.length).toBeGreaterThan(0);
    });

    it('gives up after the budget when the block never arrives', async () => {
      mockGetBlock();

      const timer = new Timer();
      expect(await holdOff.getBlock({ hash: BlockHash.random() })).toBeUndefined();
      expect(timer.ms()).toBeGreaterThanOrEqual(BY_HASH_WAIT_MS);
    });
  });

  describe('concurrency cap', () => {
    it('fails fast once the cap is saturated and holds again after they release', async () => {
      const held = Array.from({ length: MAX_CONCURRENT_HOLDS }, () =>
        holdOff.getBlockData({ hash: BlockHash.random() }),
      );
      // Let the initial miss of every held request land so they are all counted before the next call.
      await sleep(50);
      expect(holdOff.holds).toEqual(MAX_CONCURRENT_HOLDS);

      // Concurrent polling makes call counts useless here, so the overflow request is pinned by returning long
      // before its budget (a whole budget of slack) and by leaving the hold count untouched.
      const overflowTimer = new Timer();
      expect(await holdOff.getBlockData({ hash: BlockHash.random() })).toBeUndefined();
      expect(overflowTimer.ms()).toBeLessThan(BY_HASH_WAIT_MS);
      expect(holdOff.holds).toEqual(MAX_CONCURRENT_HOLDS);

      expect(await Promise.all(held)).toEqual(new Array(MAX_CONCURRENT_HOLDS).fill(undefined));
      expect(holdOff.holds).toEqual(0);

      // With the cap free again, a fresh miss is held for its full budget.
      const heldAgainTimer = new Timer();
      expect(await holdOff.getBlockData({ hash: BlockHash.random() })).toBeUndefined();
      expect(heldAgainTimer.ms()).toBeGreaterThanOrEqual(BY_HASH_WAIT_MS);
    });

    it('releases the counter when a hold resolves successfully', async () => {
      const blockHash = BlockHash.random();
      void sleep(200).then(() => addBlock(BlockNumber(tip + 1), blockHash));

      expect(await holdOff.getBlockData({ hash: blockHash })).toBeDefined();
      expect(holdOff.holds).toEqual(0);
    });

    it('releases the counter when the block source throws mid-hold', async () => {
      blockSource.getBlockData.mockResolvedValueOnce(undefined).mockRejectedValue(new Error('block source is down'));

      await expect(holdOff.getBlockData({ hash: BlockHash.random() })).rejects.toThrow('block source is down');
      expect(holdOff.holds).toEqual(0);
    });
  });
});
