import { type Logger, createLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/running-promise';

import type { BlockData } from '../block_data.js';
import type { L2Block } from '../l2_block.js';
import {
  type ArchiverEmitter,
  type BlockQuery,
  type BlocksQuery,
  type L2BlockSource,
  type L2BlockSourceEventEmitter,
  L2BlockSourceEvents,
  type L2BlockSourceUpdatedEvent,
  type L2Tips,
} from '../l2_block_source.js';
import type { L2BlockStreamEventHandler, L2BlockStreamLocalDataProvider } from './interfaces.js';
import { L2BlockStream, type L2BlockStreamOptions, type L2BlockStreamSource } from './l2_block_stream.js';

/** Derives the metadata-only {@link BlockData} view of a hydrated {@link L2Block}. */
async function l2BlockToBlockData(block: L2Block): Promise<BlockData> {
  return {
    header: block.header,
    archive: block.archive,
    blockHash: await block.hash(),
    checkpointNumber: block.checkpointNumber,
    indexWithinCheckpoint: block.indexWithinCheckpoint,
  };
}

/** Returns whether two tips snapshots agree on the proposed tip (number and hash). */
function proposedTipMatches(a: L2Tips, b: L2Tips): boolean {
  return a.proposed.number === b.proposed.number && a.proposed.hash === b.proposed.hash;
}

/** Returns the event emitter of a source that exposes one, or undefined for plain (e.g. RPC-backed) sources. */
function getEmitter(source: L2BlockSource | L2BlockSourceEventEmitter): ArchiverEmitter | undefined {
  return 'events' in source ? source.events : undefined;
}

/**
 * Wraps a block source so that hydrated blocks delivered by an aggregate update event can satisfy the block
 * stream's reads, avoiding a round-trip to archiver storage on a triggered sync. The cache is an optimization
 * only: `getL2Tips` always delegates to the source and reconciliation is driven by the fresh source tips, so a
 * stale or partial cache simply delegates and never changes the sync outcome.
 */
/** A set of hydrated blocks installed from one aggregate event, tagged with the tips that event reported. */
type HotBlockCacheEntry = { byNumber: Map<number, L2Block>; minNumber: number; maxNumber: number; toTips: L2Tips };

class HotBlockSourceAdapter implements L2BlockStreamSource {
  /** Blocks installed from the most recent aggregate event, indexed by number, tagged with the event's tips. */
  private cache: HotBlockCacheEntry | undefined;

  constructor(
    private readonly source: L2BlockStreamSource,
    private readonly log: Logger,
  ) {}

  /** Installs hydrated blocks from an aggregate update event, associated with the event's post-pass tips. */
  public install(blocks: readonly L2Block[], toTips: L2Tips): void {
    if (blocks.length === 0) {
      this.cache = undefined;
      return;
    }
    const byNumber = new Map<number, L2Block>();
    for (const block of blocks) {
      byNumber.set(block.number, block);
    }
    const numbers = [...byNumber.keys()];
    this.cache = { byNumber, minNumber: Math.min(...numbers), maxNumber: Math.max(...numbers), toTips };
  }

  /** Returns the current cache entry (or undefined), so a pass can later clear exactly the entry it used. */
  public snapshot(): HotBlockCacheEntry | undefined {
    return this.cache;
  }

  /**
   * Drops the cache only if it is still the given entry. Clearing unconditionally would let a pass clobber a cache
   * that a later-arriving event installed for the next pass.
   */
  public clearEntry(entry: HotBlockCacheEntry | undefined): void {
    if (this.cache === entry) {
      this.cache = undefined;
    }
  }

  public async getL2Tips(): Promise<L2Tips> {
    const tips = await this.source.getL2Tips();
    // Self-invalidate when the fresh proposed tip no longer matches the tips the cache was built against: the
    // source moved on since the event, so the cached blocks may belong to a superseded chain. Matching the
    // proposed tip is the minimum bar (and is what gates the stream's block downloads); matching all tiers would
    // be stricter and is also acceptable.
    if (this.cache && !proposedTipMatches(tips, this.cache.toTips)) {
      this.log.trace(`Dropping stale hot-block cache; fresh proposed tip does not match the event tips`);
      this.cache = undefined;
    }
    return tips;
  }

  public getBlocks(query: BlocksQuery): Promise<L2Block[]> {
    const served = this.tryServeBlocksFromCache(query);
    return served ? Promise.resolve(served) : this.source.getBlocks(query);
  }

  public getBlockData(query: BlockQuery): Promise<BlockData | undefined> {
    if ('number' in query && this.cache) {
      const block = this.cache.byNumber.get(query.number);
      if (block) {
        return l2BlockToBlockData(block);
      }
    }
    return this.source.getBlockData(query);
  }

  /** Serves a block range from the cache only when it is fully covered by contiguous cached blocks. */
  private tryServeBlocksFromCache(query: BlocksQuery): L2Block[] | undefined {
    // Only the by-range form is cacheable, and only for the full (not checkpointed-only) chain: the cache may hold
    // uncheckpointed blocks that an onlyCheckpointed query must not receive.
    if (!this.cache || !('from' in query) || query.onlyCheckpointed) {
      return undefined;
    }
    const from = query.from;
    const to = from + query.limit - 1;
    if (from < this.cache.minNumber || to > this.cache.maxNumber) {
      return undefined;
    }
    const blocks: L2Block[] = [];
    for (let n = from; n <= to; n++) {
      const block = this.cache.byNumber.get(n);
      if (!block) {
        // A gap inside the requested range: bail out and let the source serve the whole range.
        return undefined;
      }
      blocks.push(block);
    }
    return blocks;
  }
}

/**
 * Event-driven wrapper around {@link L2BlockStream}. Subscribes to the source's aggregate `l2BlockSourceUpdated`
 * event (when the source exposes one) to trigger an immediate reconciliation, while keeping the periodic poll as
 * the correctness fallback. Subsystems keep consuming the same {@link L2BlockStreamEvent}s; the archiver aggregate
 * event is handled entirely here.
 *
 * Hydrated blocks carried by an event are served back through a hot-block cache so a triggered sync does not
 * re-read archiver block bodies. A fully-synced pass remains a no-op: it calls the source `getL2Tips()` only.
 */
export class EventDrivenL2BlockStream {
  private readonly adapter: HotBlockSourceAdapter;
  private readonly blockStream: L2BlockStream;
  private readonly runningPromise: RunningPromise;
  private readonly emitter: ArchiverEmitter | undefined;
  private started = false;

  private readonly onSourceUpdated = (event: L2BlockSourceUpdatedEvent) => {
    this.adapter.install(event.blocksAdded, event.toTips);
    // Fire-and-forget: trigger coalesces with any in-flight or periodic pass (see RunningPromise.trigger), so a
    // burst of events does not run passes concurrently. Errors are swallowed by the inner stream's own handler.
    void this.runningPromise.trigger().catch(err => this.log.error(`Error in event-triggered block stream sync`, err));
  };

  constructor(
    source: L2BlockSource | L2BlockSourceEventEmitter,
    localData: L2BlockStreamLocalDataProvider,
    handler: L2BlockStreamEventHandler,
    private readonly log = createLogger('types:event_driven_block_stream'),
    opts: L2BlockStreamOptions = {},
  ) {
    this.adapter = new HotBlockSourceAdapter(source, log);
    // The inner stream's own RunningPromise is never started; this wrapper owns the polling loop and drives the
    // stream through `sync()` (which runs `work()` directly when the inner loop is stopped).
    this.blockStream = new L2BlockStream(this.adapter, localData, handler, log, opts);
    this.runningPromise = new RunningPromise(() => this.runPass(), log, opts.pollIntervalMS ?? 1000);
    this.emitter = getEmitter(source);
  }

  public start(): void {
    if (this.started) {
      this.log.warn(`Attempted to start an already-started event-driven block stream`);
      return;
    }
    this.started = true;
    this.emitter?.on(L2BlockSourceEvents.L2BlockSourceUpdated, this.onSourceUpdated);
    this.runningPromise.start();
  }

  public async stop(): Promise<void> {
    this.started = false;
    this.emitter?.off(L2BlockSourceEvents.L2BlockSourceUpdated, this.onSourceUpdated);
    await this.runningPromise.stop();
    await this.blockStream.stop();
  }

  public isRunning(): boolean {
    return this.runningPromise.isRunning();
  }

  /**
   * Runs a synchronization pass now, bypassing the poll interval, and resolves once a pass that ran at or after
   * this call completes. Concurrent callers and periodic ticks coalesce onto the same pass.
   */
  public sync(): Promise<void> {
    return this.runningPromise.trigger();
  }

  /** A single pass over the underlying block stream, dropping afterwards only the cache entry this pass began with. */
  private async runPass(): Promise<void> {
    const entry = this.adapter.snapshot();
    try {
      await this.blockStream.sync();
    } finally {
      this.adapter.clearEntry(entry);
    }
  }
}
