import { type ReadOnlyFileStore, createReadOnlyFileStore } from '@aztec/file-store';
import { partitionAsync } from '@aztec/foundation/collection';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';
import { Tx, type TxHash, type TxValidator } from '@aztec/stdlib/tx';
import {
  type Histogram,
  Metrics,
  type TelemetryClient,
  type UpDownCounter,
  getTelemetryClient,
} from '@aztec/telemetry-client';

import type { TxSource, TxSourceCollectionResult } from './tx_source.js';

/** TxSource implementation that downloads txs from a file store. */
export class FileStoreTxSource implements TxSource {
  private downloadsSuccess: UpDownCounter;
  private downloadsFailed: UpDownCounter;
  private downloadDuration: Histogram;
  private downloadSize: Histogram;

  private constructor(
    private readonly fileStore: ReadOnlyFileStore,
    private readonly baseUrl: string,
    private readonly basePath: string,
    private readonly txValidator: TxValidator,
    private readonly log: Logger,
    telemetry: TelemetryClient,
  ) {
    const meter = telemetry.getMeter('file-store-tx-source');
    this.downloadsSuccess = meter.createUpDownCounter(Metrics.TX_FILE_STORE_DOWNLOADS_SUCCESS);
    this.downloadsFailed = meter.createUpDownCounter(Metrics.TX_FILE_STORE_DOWNLOADS_FAILED);
    this.downloadDuration = meter.createHistogram(Metrics.TX_FILE_STORE_DOWNLOAD_DURATION);
    this.downloadSize = meter.createHistogram(Metrics.TX_FILE_STORE_DOWNLOAD_SIZE);
  }

  /**
   * Creates a FileStoreTxSource from a URL.
   * @param url - The file store URL (s3://, gs://, file://, http://, https://).
   * @param basePath - Base path for tx files within the store.
   * @param log - Optional logger.
   * @param telemetry - Optional telemetry client.
   * @returns The FileStoreTxSource instance, or undefined if creation fails.
   */
  public static async create(
    url: string,
    basePath: string,
    txValidator: TxValidator,
    log: Logger = createLogger('p2p:file_store_tx_source'),
    telemetry: TelemetryClient = getTelemetryClient(),
  ): Promise<FileStoreTxSource | undefined> {
    try {
      const fileStore = await createReadOnlyFileStore(url, log);
      if (!fileStore) {
        log.warn(`Failed to create file store for URL: ${url}`);
        return undefined;
      }
      return new FileStoreTxSource(fileStore, url, basePath, txValidator, log, telemetry);
    } catch (err) {
      log.warn(`Error creating file store for URL: ${url}`, { error: err });
      return undefined;
    }
  }

  public getInfo(): string {
    return `file-store:${this.baseUrl}`;
  }

  public async getTxsByHash(txHashes: TxHash[]): Promise<TxSourceCollectionResult> {
    const results = await Promise.all(
      txHashes.map(async txHash => {
        const path = `${this.basePath}/txs/${txHash.toString()}.bin`;
        const timer = new Timer();
        try {
          const buffer = await this.fileStore.read(path);
          const tx = Tx.fromBuffer(buffer);
          return { tx, downloadDuration: timer.ms(), downloadSize: buffer.length };
        } catch {
          this.downloadsFailed.add(1);
          return undefined;
        }
      }),
    );

    const txs = results.filter(tx => tx !== undefined);
    const [validTxs, invalidTxs] = await partitionAsync(
      txs,
      async ({ tx, downloadDuration, downloadSize }): Promise<boolean> => {
        const valid = await this.txValidator.validateTx(tx);
        if (valid.result === 'valid') {
          this.downloadsSuccess.add(1);
          this.downloadDuration.record(Math.ceil(downloadDuration));
          this.downloadSize.record(downloadSize);
          return true;
        } else {
          this.downloadsFailed.add(1);
          return false;
        }
      },
    );

    return {
      validTxs: validTxs.map(({ tx }) => tx),
      invalidTxHashes: invalidTxs.map(({ tx }) => tx.getTxHash().toString()),
    };
  }
}

/**
 * Creates FileStoreTxSource instances from URLs.
 * @param urls - Array of file store URLs.
 * @param basePath - Base path for tx files within each store.
 * @param log - Optional logger.
 * @param telemetry - Optional telemetry client.
 * @returns Array of successfully created FileStoreTxSource instances.
 */
export async function createFileStoreTxSources(
  urls: string[],
  basePath: string,
  txValidator: TxValidator,
  log: Logger = createLogger('p2p:file_store_tx_source'),
  telemetry: TelemetryClient = getTelemetryClient(),
): Promise<FileStoreTxSource[]> {
  const sources = await Promise.all(
    urls.map(url => FileStoreTxSource.create(url, basePath, txValidator, log, telemetry)),
  );
  return sources.filter((s): s is FileStoreTxSource => s !== undefined);
}
