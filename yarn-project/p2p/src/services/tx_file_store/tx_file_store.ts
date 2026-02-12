import { type Logger, createLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/promise';
import { makeBackoff, retry } from '@aztec/foundation/retry';
import { Timer } from '@aztec/foundation/timer';
import { type FileStore, createFileStore } from '@aztec/stdlib/file-store';
import type { Tx } from '@aztec/stdlib/tx';
import { type TelemetryClient, getTelemetryClient } from '@aztec/telemetry-client';

import type { TxPoolV2 } from '../../mem_pools/index.js';
import type { TxFileStoreConfig } from './config.js';
import { TxFileStoreInstrumentation } from './instrumentation.js';

/**
 * Uploads validated transactions to a file store as a fallback retrieval mechanism.
 * Listens to TxPool txs-added events and uploads txs asynchronously with bounded concurrency.
 */
export class TxFileStore {
  private uploadQueue: Tx[] = [];
  private activeUploads = 0;
  private readonly queueProcessor: RunningPromise;
  private readonly handleTxsAdded: (args: { txs: Tx[]; source?: string }) => void;

  /** Recently uploaded tx hashes for deduplication. */
  private recentUploads: Set<string> = new Set();
  private recentUploadsOrder: string[] = [];
  private readonly maxRecentUploads = 1000;

  private constructor(
    private readonly fileStore: FileStore,
    private readonly txPool: TxPoolV2,
    private readonly config: TxFileStoreConfig,
    private readonly instrumentation: TxFileStoreInstrumentation,
    private readonly log: Logger,
  ) {
    this.handleTxsAdded = (args: { txs: Tx[]; source?: string }) => {
      this.enqueueTxs(args.txs);
    };
    this.queueProcessor = new RunningPromise(() => this.processQueueBatch(), this.log, 100);
  }

  /**
   * Creates and initializes the file store.
   * @param txPool - The transaction pool to listen to.
   * @param config - The file store configuration.
   * @param log - Optional logger.
   * @param telemetry - Optional telemetry client.
   * @param fileStoreOverride - Optional FileStore for testing (bypasses createFileStore).
   * @returns The file store instance, or undefined if not configured/enabled.
   */
  static async create(
    txPool: TxPoolV2,
    config: TxFileStoreConfig,
    log: Logger = createLogger('p2p:tx_file_store'),
    telemetry: TelemetryClient = getTelemetryClient(),
    fileStoreOverride?: FileStore,
  ): Promise<TxFileStore | undefined> {
    if (!config.txFileStoreEnabled) {
      log.debug('Tx file store is disabled');
      return undefined;
    }

    if (!config.txFileStoreUrl) {
      log.warn('Tx file store is enabled but URL is not configured');
      return undefined;
    }

    const fileStore = fileStoreOverride ?? (await createFileStore(config.txFileStoreUrl, log));
    if (!fileStore) {
      log.warn('Failed to create file store for tx file store');
      return undefined;
    }

    const instrumentation = new TxFileStoreInstrumentation(telemetry, 'TxFileStore');
    log.info('Created tx file store', { url: config.txFileStoreUrl });
    return new TxFileStore(fileStore, txPool, config, instrumentation, log);
  }

  /** Starts listening to TxPool events and uploading txs. */
  public start(): void {
    this.queueProcessor.start();
    this.txPool.on('txs-added', this.handleTxsAdded);
    this.log.info('Started tx file store', {
      concurrency: this.config.txFileStoreUploadConcurrency,
      maxQueueSize: this.config.txFileStoreMaxQueueSize,
    });
  }

  /** Stops listening and waits for pending uploads to complete. */
  public async stop(): Promise<void> {
    this.txPool.removeListener('txs-added', this.handleTxsAdded);
    await this.queueProcessor.stop();
    this.log.info('Stopped tx file store');
  }

  private enqueueTxs(txs: Tx[]): void {
    this.uploadQueue.push(...txs);

    // Enforce max queue size by dropping oldest entries
    const overflow = this.uploadQueue.length - this.config.txFileStoreMaxQueueSize;
    if (overflow > 0) {
      this.log.warn(`Upload queue overflow, dropping ${overflow} oldest txs`);
      this.uploadQueue.splice(0, overflow);
    }

    this.instrumentation.recordQueueSize(this.uploadQueue.length);

    // Immediately start uploading txs
    void this.queueProcessor.trigger();
  }

  private async processQueueBatch(): Promise<void> {
    const batch = this.uploadQueue.splice(0, this.config.txFileStoreUploadConcurrency);
    this.instrumentation.recordQueueSize(this.uploadQueue.length);

    this.activeUploads += batch.length;
    try {
      await Promise.all(batch.map(tx => this.uploadTx(tx)));
    } finally {
      this.activeUploads -= batch.length;
    }
  }

  private async uploadTx(tx: Tx): Promise<void> {
    const txHash = tx.getTxHash().toString();
    const path = `txs/${txHash}.bin`;
    const timer = new Timer();

    if (this.recentUploads.has(txHash)) {
      return;
    }

    try {
      this.recentUploads.add(txHash);
      this.recentUploadsOrder.push(txHash);

      if (this.recentUploadsOrder.length > this.maxRecentUploads) {
        // delete old entries in recentUploads
        for (const txHashToRemove of this.recentUploadsOrder.splice(
          0,
          this.recentUploadsOrder.length - this.maxRecentUploads,
        )) {
          this.recentUploads.delete(txHashToRemove);
        }
      }

      await retry(
        () => this.fileStore.save(path, tx.toBuffer(), { compress: false }),
        `Uploading tx ${txHash}`,
        makeBackoff([0.1, 0.5, 2]),
        this.log,
        true, // failSilently - don't log errors during retries
      );
      const durationMs = Math.trunc(timer.ms());
      this.log.debug(`Uploaded tx to file store`, { txHash, path, durationMs });
      this.instrumentation.recordUploadSuccess(durationMs);
    } catch (err) {
      this.log.warn(`Failed to upload tx to file store after retries`, { txHash, error: err });
      this.instrumentation.recordUploadFailed();
    }
  }

  /** Waits for all queued and in-flight uploads to complete. For testing. */
  public async flush(): Promise<void> {
    while (this.uploadQueue.length > 0 || this.activeUploads > 0) {
      await this.queueProcessor.trigger();
    }
  }

  /** Returns the number of pending uploads (queued + in-flight). */
  public getPendingUploadCount(): number {
    return this.uploadQueue.length + this.activeUploads;
  }
}
