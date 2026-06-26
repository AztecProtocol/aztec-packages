import { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';
import { compactArray } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { retryUntil } from '@aztec/foundation/retry';
import { sleep } from '@aztec/foundation/sleep';

import { jest } from '@jest/globals';
import { EventEmitter } from 'events';
import times from 'lodash.times';

import type { BlockData } from '../block_data.js';
import { BlockHash } from '../block_hash.js';
import type { L2Block } from '../l2_block.js';
import {
  type ArchiverEmitter,
  type BlockQuery,
  type BlocksQuery,
  type L2BlockSourceEventEmitter,
  L2BlockSourceEvents,
  type L2BlockSourceUpdatedEvent,
  type L2Tips,
} from '../l2_block_source.js';
import { EventDrivenL2BlockStream } from './event_driven_l2_block_stream.js';
import type {
  L2BlockStreamEvent,
  L2BlockStreamEventHandler,
  L2BlockStreamLocalDataProvider,
  LocalChainTips,
} from './interfaces.js';

const makeHash = (n: number) => new Fr(n).toString();

function blockHashFromNumber(this: { number: number }): Promise<BlockHash> {
  return Promise.resolve(new BlockHash(new Fr(this.number)));
}

const makeBlock = (n: number) =>
  ({
    number: BlockNumber(n),
    checkpointNumber: CheckpointNumber(n),
    indexWithinCheckpoint: 0,
    hash: blockHashFromNumber,
  }) as unknown as L2Block;

const makeBlockData = (n: number): BlockData =>
  ({ header: { hash: () => Promise.resolve(new BlockHash(new Fr(n))) } }) as unknown as BlockData;

const makeTipId = (n: number) => ({
  block: { number: BlockNumber(n), hash: makeHash(n) },
  checkpoint: { number: CheckpointNumber(n), hash: makeHash(n) },
});

const makeTips = (proposed: number): L2Tips => ({
  proposed: { number: BlockNumber(proposed), hash: makeHash(proposed) },
  checkpointed: makeTipId(0),
  proven: makeTipId(0),
  finalized: makeTipId(0),
});

/** Local provider whose proposed tip is fixed; the recording handler does not advance it (so passes recompute). */
class TestLocalData implements L2BlockStreamLocalDataProvider {
  public proposedNumber = BlockNumber.ZERO;

  public getL2BlockHash(n: number): Promise<string | undefined> {
    return Promise.resolve(n > this.proposedNumber ? undefined : makeHash(n));
  }

  public getL2Tips(): Promise<LocalChainTips> {
    return Promise.resolve({
      proposed: { number: this.proposedNumber, hash: makeHash(this.proposedNumber) },
      proven: { block: { number: BlockNumber.ZERO, hash: makeHash(0) } },
      finalized: { block: { number: BlockNumber.ZERO, hash: makeHash(0) } },
    });
  }
}

class TestHandler implements L2BlockStreamEventHandler {
  public readonly events: L2BlockStreamEvent[] = [];

  public handleBlockStreamEvent(event: L2BlockStreamEvent): Promise<void> {
    this.events.push(event);
    return Promise.resolve();
  }

  public addedBlockNumbers(): number[] {
    return this.events.filter(e => e.type === 'blocks-added').flatMap(e => e.blocks.map(b => b.number));
  }
}

describe('EventDrivenL2BlockStream', () => {
  let latest: number;
  let getL2Tips: jest.Mock<() => Promise<L2Tips>>;
  let getBlocks: jest.Mock<(query: BlocksQuery) => Promise<L2Block[]>>;
  let getBlockData: jest.Mock<(query: BlockQuery) => Promise<BlockData | undefined>>;
  let events: ArchiverEmitter;
  let source: L2BlockSourceEventEmitter;
  let local: TestLocalData;
  let handler: TestHandler;
  let wrapper: EventDrivenL2BlockStream;

  const setSourceTips = (proposed: number) => {
    latest = proposed;
    getL2Tips.mockResolvedValue(makeTips(proposed));
  };

  const emitUpdate = (toProposed: number, blocksAdded: L2Block[]) => {
    const event: L2BlockSourceUpdatedEvent = {
      type: 'l2BlockSourceUpdated',
      fromTips: makeTips(0),
      toTips: makeTips(toProposed),
      blocksAdded,
    };
    events.emit(L2BlockSourceEvents.L2BlockSourceUpdated, event);
  };

  const waitFor = (predicate: () => boolean) =>
    retryUntil(() => predicate() || undefined, 'event-driven sync', 5, 0.01);

  beforeEach(() => {
    latest = 0;
    getL2Tips = jest.fn<() => Promise<L2Tips>>();
    getBlocks = jest.fn<(query: BlocksQuery) => Promise<L2Block[]>>();
    getBlockData = jest.fn<(query: BlockQuery) => Promise<BlockData | undefined>>();
    getBlocks.mockImplementation(query =>
      'from' in query
        ? Promise.resolve(
            compactArray(times(query.limit, i => (query.from + i > latest ? undefined : makeBlock(query.from + i)))),
          )
        : Promise.resolve([]),
    );
    getBlockData.mockImplementation(query =>
      Promise.resolve('number' in query && query.number <= latest ? makeBlockData(query.number) : undefined),
    );
    events = new EventEmitter() as ArchiverEmitter;
    source = { getL2Tips, getBlocks, getBlockData, events } as unknown as L2BlockSourceEventEmitter;
    local = new TestLocalData();
    handler = new TestHandler();
    wrapper = new EventDrivenL2BlockStream(source, local, handler, undefined, {
      batchSize: 10,
      ignoreCheckpoints: true,
    });
  });

  afterEach(async () => {
    await wrapper.stop();
  });

  it('catches up from the local cursor via polling when no event is delivered', async () => {
    setSourceTips(5);
    local.proposedNumber = BlockNumber.ZERO;

    await wrapper.sync();

    expect(handler.addedBlockNumbers()).toEqual([1, 2, 3, 4, 5]);
  });

  it('serves a fully-covered block range from the hot cache without hitting the source', async () => {
    // Start fully synced so start()'s immediate pass is a no-op (no getBlocks).
    setSourceTips(3);
    local.proposedNumber = BlockNumber(3);
    wrapper.start();
    await waitFor(() => getL2Tips.mock.calls.length > 0);

    // Source advances to 6; the aggregate event carries the three new blocks 4-6.
    setSourceTips(6);
    getBlocks.mockClear();
    handler.events.length = 0;
    emitUpdate(6, [makeBlock(4), makeBlock(5), makeBlock(6)]);

    await waitFor(() => handler.events.some(e => e.type === 'blocks-added'));

    // The full 4-6 range was served from the cache, so the source's getBlocks was never called.
    expect(getBlocks).not.toHaveBeenCalled();
    expect(handler.addedBlockNumbers()).toEqual([4, 5, 6]);
  });

  it('delegates to the source when the cache only partially covers the requested range', async () => {
    setSourceTips(3);
    local.proposedNumber = BlockNumber(3);
    wrapper.start();
    await waitFor(() => getL2Tips.mock.calls.length > 0);

    setSourceTips(6);
    getBlocks.mockClear();
    handler.events.length = 0;
    // Event only carries blocks 4-5, but the stream needs through block 6.
    emitUpdate(6, [makeBlock(4), makeBlock(5)]);

    await waitFor(() => handler.events.some(e => e.type === 'blocks-added'));

    expect(getBlocks).toHaveBeenCalled();
    expect(handler.addedBlockNumbers()).toEqual([4, 5, 6]);
  });

  it('drops a stale cache when the fresh proposed tip no longer matches the event tips', async () => {
    setSourceTips(3);
    local.proposedNumber = BlockNumber(3);
    wrapper.start();
    await waitFor(() => getL2Tips.mock.calls.length > 0);

    // The source has actually moved to 6, but the event reports stale tips (proposed 3).
    setSourceTips(6);
    getBlocks.mockClear();
    handler.events.length = 0;
    emitUpdate(3, [makeBlock(4), makeBlock(5), makeBlock(6)]);

    await waitFor(() => handler.events.some(e => e.type === 'blocks-added'));

    // The fresh proposed tip (6) does not match the event tips (3), so the cache is dropped and the source serves.
    expect(getBlocks).toHaveBeenCalled();
    expect(handler.addedBlockNumbers()).toEqual([4, 5, 6]);
  });

  it('coalesces several events arriving during a sync into a single follow-up pass', async () => {
    // No-op passes (local == source) so each pass only reads getL2Tips.
    setSourceTips(3);
    local.proposedNumber = BlockNumber(3);

    const gate = promiseWithResolvers<void>();
    let calls = 0;
    getL2Tips.mockImplementation(() => {
      calls++;
      // Block only the first pass so the events fired during it coalesce into one follow-up.
      return (calls === 1 ? gate.promise : Promise.resolve()).then(() => makeTips(3));
    });

    // start() runs an immediate pass that blocks on the gate.
    wrapper.start();
    expect(calls).toBe(1);

    // Three events arrive while the first pass is in flight.
    emitUpdate(3, []);
    emitUpdate(3, []);
    emitUpdate(3, []);

    gate.resolve();
    await waitFor(() => calls >= 2);
    // Give any erroneous extra passes a chance to run, then confirm exactly one follow-up happened.
    await sleep(30);

    expect(calls).toBe(2);
  });

  it('keeps polling on the interval when no events arrive', async () => {
    setSourceTips(3);
    local.proposedNumber = BlockNumber(3);
    let calls = 0;
    getL2Tips.mockImplementation(() => {
      calls++;
      return Promise.resolve(makeTips(3));
    });

    const polled = new EventDrivenL2BlockStream(source, local, handler, undefined, {
      pollIntervalMS: 10,
      ignoreCheckpoints: true,
    });
    polled.start();
    try {
      await retryUntil(() => calls >= 3 || undefined, 'polls', 5, 0.01);
    } finally {
      await polled.stop();
    }

    expect(calls).toBeGreaterThanOrEqual(3);
  });
});
