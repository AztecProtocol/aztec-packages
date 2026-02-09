import { type Logger, createLogger } from '@aztec/foundation/log';
import { type PromiseWithResolvers, promiseWithResolvers } from '@aztec/foundation/promise';
import { sleep } from '@aztec/foundation/sleep';
import { DateProvider } from '@aztec/foundation/timer';
import { Tx, TxHash } from '@aztec/stdlib/tx';

import type { FileStoreTxSource } from './file_store_tx_source.js';
import type { TxAddContext, TxCollectionSink } from './tx_collection_sink.js';

/** Configuration for a FileStoreTxCollection instance. */
export type FileStoreCollectionConfig = {
  workerCount: number;
  backoffBaseMs: number;
  backoffMaxMs: number;
};

type FileStoreTxEntry = {
  txHash: string;
  context: TxAddContext;
  deadline: Date;
  attempts: number;
  lastAttemptTime: number;
  nextSourceIndex: number;
};

/**
 * Collects txs from file stores as a fallback after P2P methods have been tried.
 * Uses a shared worker pool that pulls entries with priority (fewest attempts first),
 * retries with round-robin across sources, and applies exponential backoff between
 * full cycles through all sources.
 */
export class FileStoreTxCollection {
  /** Map from tx hash string to entry for all pending downloads. */
  private entries = new Map<string, FileStoreTxEntry>();

  /** Worker promises for the shared worker pool. */
  private workers: Promise<void>[] = [];

  /** Whether the worker pool is running. */
  private running = false;

  /** Signal used to wake sleeping workers when new entries arrive or stop is called. */
  private wakeSignal: PromiseWithResolvers<void>;

  constructor(
    private readonly sources: FileStoreTxSource[],
    private readonly txCollectionSink: TxCollectionSink,
    private readonly config: FileStoreCollectionConfig,
    private readonly dateProvider: DateProvider = new DateProvider(),
    private readonly log: Logger = createLogger('p2p:file_store_tx_collection'),
  ) {
    this.wakeSignal = promiseWithResolvers<void>();
  }

  /** Starts the shared worker pool. */
  public start(): void {
    if (this.sources.length === 0) {
      this.log.debug('No file store sources configured');
      return;
    }
    this.running = true;
    for (let i = 0; i < this.config.workerCount; i++) {
      this.workers.push(this.workerLoop());
    }
  }

  /** Stops all workers and clears state. */
  public async stop(): Promise<void> {
    this.running = false;
    this.wake();
    await Promise.all(this.workers);
    this.workers = [];
    this.entries.clear();
  }

  /** Adds entries to the shared map and wakes workers. */
  public startCollecting(txHashes: TxHash[], context: TxAddContext, deadline: Date): void {
    if (this.sources.length === 0 || txHashes.length === 0) {
      return;
    }
    if (+deadline <= this.dateProvider.now()) {
      return;
    }

    for (const txHash of txHashes) {
      const hashStr = txHash.toString();
      if (!this.entries.has(hashStr)) {
        this.entries.set(hashStr, {
          txHash: hashStr,
          context,
          deadline,
          attempts: 0,
          lastAttemptTime: 0,
          nextSourceIndex: Math.floor(Math.random() * this.sources.length),
        });
      }
    }
    this.wake();
  }

  /** Removes entries for txs that have been found elsewhere. */
  public foundTxs(txs: Tx[]): void {
    for (const tx of txs) {
      this.entries.delete(tx.getTxHash().toString());
    }
  }

  /** Clears all pending entries. */
  public clearPending(): void {
    this.entries.clear();
  }

  private async workerLoop(): Promise<void> {
    while (this.running) {
      const entry = this.pickNextEntry();
      if (!entry) {
        const sleepMs = this.getSleepMs();
        if (sleepMs === undefined) {
          await this.waitForWake();
          continue;
        }
        await this.sleepOrWake(sleepMs);
        continue;
      }

      const source = this.sources[entry.nextSourceIndex % this.sources.length];
      entry.nextSourceIndex++;
      entry.attempts++;
      entry.lastAttemptTime = this.dateProvider.now();

      try {
        const result = await this.txCollectionSink.collect(
          hashes => source.getTxsByHash(hashes),
          [TxHash.fromString(entry.txHash)],
          { description: `file-store ${source.getInfo()}`, method: 'file-store', fileStore: source.getInfo() },
          entry.context,
        );
        if (result.txs.length > 0) {
          this.entries.delete(entry.txHash);
        }
      } catch (err) {
        this.log.trace(`Error downloading tx ${entry.txHash} from ${source.getInfo()}`, { err });
      }
    }
  }

  /** Picks the next entry to process: removes expired, skips entries in backoff, returns entry with fewest attempts. */
  private pickNextEntry(): FileStoreTxEntry | undefined {
    const now = this.dateProvider.now();
    let best: FileStoreTxEntry | undefined;

    for (const [key, entry] of this.entries) {
      if (+entry.deadline <= now) {
        this.entries.delete(key);
        continue;
      }
      const backoffMs = this.getBackoffMs(entry);
      if (entry.lastAttemptTime + backoffMs > now) {
        continue;
      }
      if (!best || entry.attempts < best.attempts) {
        best = entry;
      }
    }
    return best;
  }

  /** Computes backoff for an entry. Backoff applies after a full cycle through all sources. */
  private getBackoffMs(entry: FileStoreTxEntry): number {
    const fullCycles = Math.floor(entry.attempts / this.sources.length);
    if (fullCycles === 0) {
      return 0;
    }
    return Math.min(this.config.backoffBaseMs * Math.pow(2, fullCycles - 1), this.config.backoffMaxMs);
  }

  /** Returns time in ms until the earliest entry exits backoff, or undefined if no entries. */
  private getSleepMs(): number | undefined {
    if (this.entries.size === 0) {
      return undefined;
    }
    const now = this.dateProvider.now();
    let earliest = Infinity;
    for (const entry of this.entries.values()) {
      const readyAt = entry.lastAttemptTime + this.getBackoffMs(entry);
      earliest = Math.min(earliest, readyAt);
    }
    return Math.max(0, earliest - now);
  }

  /** Resolves the current wake signal and creates a new one. */
  private wake(): void {
    this.wakeSignal.resolve();
    this.wakeSignal = promiseWithResolvers<void>();
  }

  /** Waits until the wake signal is resolved. */
  private async waitForWake(): Promise<void> {
    await this.wakeSignal.promise;
  }

  /** Sleeps for the given duration or until the wake signal is resolved. */
  private async sleepOrWake(ms: number): Promise<void> {
    await Promise.race([sleep(ms), this.wakeSignal.promise]);
  }
}
