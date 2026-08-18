import { createLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/running-promise';

import {
  type ArchiverEmitter,
  type L2BlockSource,
  type L2BlockSourceEventEmitter,
  L2BlockSourceEvents,
} from '../l2_block_source.js';
import type { L2BlockStreamEventHandler, L2BlockStreamLocalDataProvider } from './interfaces.js';
import { L2BlockStream, type L2BlockStreamOptions } from './l2_block_stream.js';

/** Returns the event emitter of a source that exposes one, or undefined for plain (e.g. RPC-backed) sources. */
function getEmitter(source: L2BlockSource | L2BlockSourceEventEmitter): ArchiverEmitter | undefined {
  return 'events' in source ? source.events : undefined;
}

/**
 * Event-driven wrapper around {@link L2BlockStream}. Subscribes to the source's aggregate `l2BlockSourceUpdated`
 * event (when the source exposes one) and uses it purely as a doorbell: each event triggers an immediate
 * reconciliation pass instead of waiting for the next tick, while the periodic poll remains the correctness
 * fallback. Every pass reads tips and blocks authoritatively from the source, so a missed, stale, or duplicated
 * event only affects latency. Subsystems keep consuming the same {@link L2BlockStreamEvent}s; the archiver
 * aggregate event is handled entirely here.
 */
export class EventDrivenL2BlockStream {
  private readonly blockStream: L2BlockStream;
  private readonly runningPromise: RunningPromise;
  private readonly emitter: ArchiverEmitter | undefined;
  private started = false;

  private readonly onSourceUpdated = () => {
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
    // The inner stream's own RunningPromise is never started; this wrapper owns the polling loop and drives the
    // stream through `sync()` (which runs `work()` directly when the inner loop is stopped).
    this.blockStream = new L2BlockStream(source, localData, handler, log, opts);
    this.runningPromise = new RunningPromise(() => this.blockStream.sync(), log, opts.pollIntervalMS ?? 1000);
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
   * Runs a synchronization pass now, bypassing the poll interval. Resolves once a pass that started after this call
   * completes, so the caller observes state at least as fresh as the moment it asked. Concurrent callers coalesce
   * onto a single such pass. Rejects if the stream is stopped before that pass runs.
   */
  public sync(): Promise<void> {
    return this.runningPromise.trigger();
  }
}
