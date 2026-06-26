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
import { type L2BlockStreamEventHandler, type L2BlockStreamLocalDataProvider, localTipsMatch } from './interfaces.js';
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

/** Returns the event emitter of a source that exposes one, or undefined for plain (e.g. RPC-backed) sources. */
function getEmitter(source: L2BlockSource | L2BlockSourceEventEmitter): ArchiverEmitter | undefined {
  return 'events' in source ? source.events : undefined;
}

/** Fast-path context for a single sync pass: blocks to serve by number, plus the tips to report as the source's. */
type ActiveUpdate = { byNumber: Map<number, L2Block>; toTips: L2Tips };

/**
 * Wraps a block source so a single sync pass can be served from blocks delivered by an aggregate update event,
 * avoiding round-trips to archiver storage. The fast path is only armed (via {@link activate}) for a pass that is
 * confirmed caught up to the event's pre-pass tips: in that case the event's `blocksAdded` contiguously cover the
 * pass's download range and `toTips` is the exact post-pass tip, so `getL2Tips` can report it without querying the
 * source. When the fast path is not armed, every read delegates to the source, so a stale or partial cache never
 * changes the sync outcome.
 */
class HotBlockSourceAdapter implements L2BlockStreamSource {
  /** Set for the duration of one fast-path pass; undefined when reads must delegate to the source. */
  private active: ActiveUpdate | undefined;

  constructor(
    private readonly source: L2BlockStreamSource,
    private readonly log: Logger,
  ) {}

  /** Arms the fast path for the current pass: serve these blocks and report `toTips` as the source tips. */
  public activate(blocks: readonly L2Block[], toTips: L2Tips): void {
    const byNumber = new Map<number, L2Block>();
    for (const block of blocks) {
      byNumber.set(block.number, block);
    }
    this.active = { byNumber, toTips };
    this.log.trace(`Armed hot-block fast path`, { blocks: byNumber.size, toTips });
  }

  /** Disarms the fast path so subsequent reads delegate to the source again. */
  public deactivate(): void {
    this.active = undefined;
  }

  public getL2Tips(): Promise<L2Tips> {
    return this.active ? Promise.resolve(this.active.toTips) : this.source.getL2Tips();
  }

  public getBlocks(query: BlocksQuery): Promise<L2Block[]> {
    const served = this.active ? this.tryServeBlocksFromCache(query) : undefined;
    return served ? Promise.resolve(served) : this.source.getBlocks(query);
  }

  public getBlockData(query: BlockQuery): Promise<BlockData | undefined> {
    if (this.active && 'number' in query) {
      const block = this.active.byNumber.get(query.number);
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
    if (!this.active || !('from' in query) || query.onlyCheckpointed) {
      return undefined;
    }
    const from = query.from;
    const to = from + query.limit - 1;
    const blocks: L2Block[] = [];
    for (let n = from; n <= to; n++) {
      const block = this.active.byNumber.get(n);
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
 * The event is passed through to the sync pass via {@link RunningPromise.trigger}. If, at the time the pass runs,
 * the stream's local tips match the event's `fromTips` (it is caught up to where the event began), the event's
 * hydrated blocks are served back through a hot-block cache and the event's `toTips` is reported as the source tips
 * — so the triggered sync re-reads neither block bodies nor tips from the archiver. Otherwise the pass delegates
 * entirely to the source, and the periodic poll guarantees eventual catch-up.
 */
export class EventDrivenL2BlockStream {
  private readonly adapter: HotBlockSourceAdapter;
  private readonly blockStream: L2BlockStream;
  private readonly runningPromise: RunningPromise<L2BlockSourceUpdatedEvent>;
  private readonly emitter: ArchiverEmitter | undefined;
  private started = false;

  private readonly onSourceUpdated = (event: L2BlockSourceUpdatedEvent) => {
    // Fire-and-forget: trigger coalesces with any in-flight or periodic pass (see RunningPromise.trigger), so a
    // burst of events does not run passes concurrently. Errors are swallowed by the inner stream's own handler.
    void this.runningPromise
      .trigger(event)
      .catch(err => this.log.error(`Error in event-triggered block stream sync`, err));
  };

  constructor(
    source: L2BlockSource | L2BlockSourceEventEmitter,
    private readonly localData: L2BlockStreamLocalDataProvider,
    handler: L2BlockStreamEventHandler,
    private readonly log = createLogger('types:event_driven_block_stream'),
    opts: L2BlockStreamOptions = {},
  ) {
    this.adapter = new HotBlockSourceAdapter(source, log);
    // The inner stream's own RunningPromise is never started; this wrapper owns the polling loop and drives the
    // stream through `sync()` (which runs `work()` directly when the inner loop is stopped).
    this.blockStream = new L2BlockStream(this.adapter, localData, handler, log, opts);
    this.runningPromise = new RunningPromise<L2BlockSourceUpdatedEvent>(
      this.runPass.bind(this),
      log,
      opts.pollIntervalMS ?? 1000,
    );
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

  /**
   * Runs a single pass over the underlying block stream. When triggered by an aggregate event and the stream is
   * caught up to the event's pre-pass tips, the event's blocks and tips serve the pass directly; the fast path is
   * always disarmed afterwards so a subsequent poll-driven pass reads from the source.
   */
  private async runPass(event?: L2BlockSourceUpdatedEvent): Promise<void> {
    if (event) {
      const localTips = await this.localData.getL2Tips();
      if (localTipsMatch(localTips, event.fromTips)) {
        this.adapter.activate(event.blocksAdded, event.toTips);
      }
    }

    try {
      await this.blockStream.sync();
    } finally {
      this.adapter.deactivate();
    }
  }
}
