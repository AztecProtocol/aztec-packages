import { times } from '@aztec/foundation/collection';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import { DateProvider } from '@aztec/foundation/timer';
import { TxHash } from '@aztec/stdlib/tx';

import type { FileStoreTxSource } from './file_store_tx_source.js';
import type { IRequestTracker } from './request_tracker.js';
import type { TxAddContext, TxCollectionSink } from './tx_collection_sink.js';

/** Configuration for a FileStoreTxCollection instance. */
export type FileStoreCollectionConfig = {
  workerCount: number;
  backoffBaseMs: number;
  backoffMaxMs: number;
};

type FileStoreTxEntry = {
  txHash: string;
  attempts: number;
  lastAttemptTime: number;
  nextSourceIndex: number;
};

/**
 * Collects txs from file stores as a fallback after P2P methods have been tried.
 * Each call to startCollecting spins up its own worker pool which pulls entries with priority
 * (fewest attempts first), retries with round-robin across sources, and applies exponential
 * backoff between full cycles through all sources. Workers self-terminate when the request
 * tracker is cancelled (deadline / all-fetched / external) or when there is nothing left to do.
 */
export class FileStoreTxCollection {
  constructor(
    private readonly sources: FileStoreTxSource[],
    private readonly txCollectionSink: TxCollectionSink,
    private readonly config: FileStoreCollectionConfig,
    private readonly dateProvider: DateProvider = new DateProvider(),
    private readonly log: Logger = createLogger('p2p:file_store_tx_collection'),
  ) {}

  /**
   * Spins up workers to download all txs still missing from the tracker, racing across the
   * configured file store sources. Resolves once all workers settle.
   */
  public async startCollecting(requestTracker: IRequestTracker, context: TxAddContext): Promise<void> {
    if (this.sources.length === 0 || requestTracker.checkCancelled()) {
      return;
    }

    // eslint-disable-next-line aztec-custom/no-non-primitive-in-collections
    const entries: Set<FileStoreTxEntry> = new Set();
    for (const hashStr of requestTracker.missingTxHashes) {
      entries.add({
        txHash: hashStr,
        attempts: 0,
        lastAttemptTime: 0,
        nextSourceIndex: Math.floor(Math.random() * this.sources.length),
      });
    }

    // Yield before spawning so the synchronous caller can finish any follow-up (eg. marking a tx
    // as fetched on the tracker, or cancelling it) before workers begin scanning entries.
    await Promise.resolve();
    if (requestTracker.checkCancelled()) {
      return;
    }

    await Promise.allSettled(times(this.config.workerCount, () => this.workerLoop(entries, requestTracker, context)));
  }

  private async workerLoop(
    // eslint-disable-next-line aztec-custom/no-non-primitive-in-collections
    entries: Set<FileStoreTxEntry>,
    requestTracker: IRequestTracker,
    context: TxAddContext,
  ): Promise<void> {
    while (!requestTracker.checkCancelled() && entries.size > 0) {
      const action = this.getNextAction(entries, requestTracker);
      if (action.type === 'sleep') {
        await Promise.race([sleep(action.ms), requestTracker.cancellationToken]);
        continue;
      }

      const entry = action.entry;
      const source = this.sources[entry.nextSourceIndex % this.sources.length];
      entry.nextSourceIndex++;
      entry.attempts++;
      entry.lastAttemptTime = this.dateProvider.now();

      try {
        const result = await this.txCollectionSink.collect(
          () => source.getTxsByHash([TxHash.fromString(entry.txHash)]),
          [entry.txHash],
          {
            description: `file-store ${source.getInfo()}`,
            method: 'file-store',
            fileStore: source.getInfo(),
          },
          context,
        );
        if (result.txs.length > 0) {
          entries.delete(entry);
        }
      } catch (err) {
        this.log.trace(`Error downloading tx ${entry.txHash} from ${source.getInfo()}`, { err });
      }
    }
  }

  /** Single-pass scan: removes stale entries, finds the best ready entry, or computes sleep time. */
  private getNextAction(
    // eslint-disable-next-line aztec-custom/no-non-primitive-in-collections
    entries: Set<FileStoreTxEntry>,
    requestTracker: IRequestTracker,
  ): { type: 'process'; entry: FileStoreTxEntry } | { type: 'sleep'; ms: number } {
    const now = this.dateProvider.now();
    let best: FileStoreTxEntry | undefined;
    let earliestReadyAt = Infinity;

    for (const entry of entries) {
      // Drop entries whose tx was already found via another collection path.
      if (!requestTracker.isMissing(entry.txHash)) {
        entries.delete(entry);
        continue;
      }
      const backoffMs = this.getBackoffMs(entry);
      const readyAt = entry.lastAttemptTime + backoffMs;
      if (readyAt > now) {
        earliestReadyAt = Math.min(earliestReadyAt, readyAt);
        continue;
      }
      if (!best || entry.attempts < best.attempts) {
        best = entry;
      }
    }

    if (best) {
      return { type: 'process', entry: best };
    }
    // earliestReadyAt is finite whenever there are surviving entries; if entries became empty,
    // the outer worker loop will exit on its next iteration via entries.size === 0.
    return { type: 'sleep', ms: earliestReadyAt === Infinity ? 0 : earliestReadyAt - now };
  }

  /** Computes backoff for an entry. Backoff applies after a full cycle through all sources. */
  private getBackoffMs(entry: FileStoreTxEntry): number {
    const fullCycles = Math.floor(entry.attempts / this.sources.length);
    if (fullCycles === 0) {
      return 0;
    }
    return Math.min(this.config.backoffBaseMs * Math.pow(2, fullCycles - 1), this.config.backoffMaxMs);
  }
}
