import { type Logger, createLogger } from '@aztec/foundation/log';
import { FifoMemoryQueue } from '@aztec/foundation/queue';
import { Tx, TxHash } from '@aztec/stdlib/tx';

import type { FileStoreTxSource } from './file_store_tx_source.js';
import type { TxCollectionSink } from './tx_collection_sink.js';

// Internal constants (not configurable by node operators)
const FILE_STORE_DOWNLOAD_CONCURRENCY = 5; // Max concurrent downloads

/**
 * Collects txs from file stores as a fallback after P2P methods have been tried.
 * Runs in parallel to slow/fast collection. The delay before starting file store
 * collection is managed by the TxCollection orchestrator, not this class.
 */
export class FileStoreTxCollection {
  /** Set of tx hashes that have been queued for download (prevents duplicate queueing). */
  private pendingTxs = new Set<string>();

  /**
   * Tracks tx hashes found elsewhere, even before startCollecting is called.
   * Needed because the orchestrator delays startCollecting via a real sleep, but foundTxs
   * may arrive during that delay — before the hashes are added to pendingTxs.
   */
  private foundTxHashes = new Set<string>();

  /** Queue of tx hashes to be downloaded. */
  private downloadQueue = new FifoMemoryQueue<TxHash>();

  /** Worker promises for concurrent downloads. */
  private workers: Promise<void>[] = [];

  /** Whether the collection has been started. */
  private started = false;

  constructor(
    private readonly fileStoreSources: FileStoreTxSource[],
    private readonly txCollectionSink: TxCollectionSink,
    private readonly log: Logger = createLogger('p2p:file_store_tx_collection'),
  ) {}

  /** Starts the file store collection workers. */
  public start() {
    if (this.fileStoreSources.length === 0) {
      this.log.debug('No file store sources configured, skipping file store collection');
      return;
    }

    this.started = true;
    this.downloadQueue = new FifoMemoryQueue<TxHash>();

    // Start concurrent download workers
    for (let i = 0; i < FILE_STORE_DOWNLOAD_CONCURRENCY; i++) {
      this.workers.push(this.downloadQueue.process(txHash => this.processDownload(txHash)));
    }

    this.log.info(`Started file store tx collection with ${this.fileStoreSources.length} sources`, {
      sources: this.fileStoreSources.map(s => s.getInfo()),
      concurrency: FILE_STORE_DOWNLOAD_CONCURRENCY,
    });
  }

  /** Stops all collection activity. */
  public async stop() {
    if (!this.started) {
      return;
    }
    this.started = false;
    this.downloadQueue.end();
    await Promise.all(this.workers);
    this.workers = [];
    this.pendingTxs.clear();
    this.foundTxHashes.clear();
  }

  /** Remove the given tx hashes from pending. */
  public stopCollecting(txHashes: TxHash[]) {
    for (const txHash of txHashes) {
      const hashStr = txHash.toString();
      this.pendingTxs.delete(hashStr);
    }
  }

  /** Clears all pending state. Items already in the download queue will still be processed but won't be re-queued. */
  public clearPending() {
    this.pendingTxs.clear();
    this.foundTxHashes.clear();
  }

  /** Queue the given tx hashes for file store collection. */
  public startCollecting(txHashes: TxHash[]) {
    for (const txHash of txHashes) {
      const hashStr = txHash.toString();
      if (!this.pendingTxs.has(hashStr) && !this.foundTxHashes.has(hashStr)) {
        this.pendingTxs.add(hashStr);
        this.downloadQueue.put(txHash);
      }
    }
  }

  /** Stop tracking txs that were found elsewhere. */
  public foundTxs(txs: Tx[]) {
    for (const tx of txs) {
      const hashStr = tx.getTxHash().toString();
      this.pendingTxs.delete(hashStr);
      this.foundTxHashes.add(hashStr);
    }
  }

  /** Processes a single tx hash from the download queue. */
  private async processDownload(txHash: TxHash) {
    const hashStr = txHash.toString();

    // Skip if already found by another method
    if (!this.pendingTxs.has(hashStr)) {
      return;
    }

    await this.downloadTx(txHash);
    this.pendingTxs.delete(hashStr);
  }

  /** Attempt to download a tx from file stores (round-robin). */
  private async downloadTx(txHash: TxHash) {
    const startIndex = Math.floor(Math.random() * this.fileStoreSources.length);
    for (let i = startIndex; i < startIndex + this.fileStoreSources.length; i++) {
      const source = this.fileStoreSources[i % this.fileStoreSources.length];

      try {
        const result = await this.txCollectionSink.collect(() => source.getTxsByHash([txHash]), [txHash.toString()], {
          description: `file-store ${source.getInfo()}`,
          method: 'file-store',
          fileStore: source.getInfo(),
        });

        if (result.txs.length > 0) {
          return;
        }
      } catch (err) {
        this.log.trace(`Failed to download tx ${txHash} from ${source.getInfo()}`, { err });
      }
    }

    this.log.trace(`Tx ${txHash} not found in any file store`);
  }
}
