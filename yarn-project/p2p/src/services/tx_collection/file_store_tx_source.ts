import { type Logger, createLogger } from '@aztec/foundation/log';
import { type ReadOnlyFileStore, createReadOnlyFileStore } from '@aztec/stdlib/file-store';
import { Tx, type TxHash } from '@aztec/stdlib/tx';

import type { TxSource } from './tx_source.js';

/** TxSource implementation that downloads txs from a file store. */
export class FileStoreTxSource implements TxSource {
  private constructor(
    private readonly fileStore: ReadOnlyFileStore,
    private readonly baseUrl: string,
    private readonly log: Logger,
  ) {}

  /**
   * Creates a FileStoreTxSource from a URL.
   * @param url - The file store URL (s3://, gs://, file://, http://, https://).
   * @param log - Optional logger.
   * @returns The FileStoreTxSource instance, or undefined if creation fails.
   */
  public static async create(
    url: string,
    log: Logger = createLogger('p2p:file_store_tx_source'),
  ): Promise<FileStoreTxSource | undefined> {
    try {
      const fileStore = await createReadOnlyFileStore(url, log);
      if (!fileStore) {
        log.warn(`Failed to create file store for URL: ${url}`);
        return undefined;
      }
      return new FileStoreTxSource(fileStore, url, log);
    } catch (err) {
      log.warn(`Error creating file store for URL: ${url}`, { error: err });
      return undefined;
    }
  }

  public getInfo(): string {
    return `file-store:${this.baseUrl}`;
  }

  public async getTxsByHash(txHashes: TxHash[]): Promise<{ validTxs: Tx[]; invalidTxHashes: string[] }> {
    return {
      validTxs: (
        await Promise.all(
          txHashes.map(async txHash => {
            const path = `txs/${txHash.toString()}.bin`;
            try {
              const buffer = await this.fileStore.read(path);
              return Tx.fromBuffer(buffer);
            } catch {
              // Tx not found or error reading - return undefined
              return undefined;
            }
          }),
        )
      ).filter(tx => tx !== undefined),
      invalidTxHashes: [],
    };
  }
}

/**
 * Creates FileStoreTxSource instances from URLs.
 * @param urls - Array of file store URLs.
 * @param log - Optional logger.
 * @returns Array of successfully created FileStoreTxSource instances.
 */
export async function createFileStoreTxSources(
  urls: string[],
  log: Logger = createLogger('p2p:file_store_tx_source'),
): Promise<FileStoreTxSource[]> {
  const sources = await Promise.all(urls.map(url => FileStoreTxSource.create(url, log)));
  return sources.filter((s): s is FileStoreTxSource => s !== undefined);
}
