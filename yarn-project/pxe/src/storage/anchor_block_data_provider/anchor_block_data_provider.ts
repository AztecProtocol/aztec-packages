import type { AztecAsyncKVStore, AztecAsyncMap, AztecAsyncSingleton } from '@aztec/kv-store';
import { BlockHeader } from '@aztec/stdlib/tx';

import type { JobContext, StagingDataProvider } from '../../job_coordinator/index.js';

const HEADER_KEY = 'header';

/**
 * AnchorBlockDataProvider manages the synchronized block header for PXE.
 *
 * The anchor block is the latest block PXE has synced to. All simulations
 * use this block as their reference point.
 *
 * Supports staged writes via JobContext for crash resilience.
 */
export class AnchorBlockDataProvider implements StagingDataProvider {
  readonly storeName = 'anchor_block';

  #store: AztecAsyncKVStore;
  #synchronizedHeader: AztecAsyncSingleton<Buffer>;
  /** Map for staging data - keys are staging prefixes */
  #stagingMap: AztecAsyncMap<string, Buffer>;

  constructor(store: AztecAsyncKVStore) {
    this.#store = store;
    this.#synchronizedHeader = this.#store.openSingleton(HEADER_KEY);
    this.#stagingMap = this.#store.openMap('anchor_block_staging');
  }

  /**
   * Sets the synchronized block header.
   *
   * @param header - The block header to set
   * @param context - Optional job context for staged writes
   */
  async setHeader(header: BlockHeader, context?: JobContext): Promise<void> {
    if (context) {
      // Write to staging
      const stagingKey = context.stagingKey(HEADER_KEY);
      await this.#stagingMap.set(stagingKey, header.toBuffer());
      context.registerWrite(this.storeName);
    } else {
      // Direct write
      await this.#synchronizedHeader.set(header.toBuffer());
    }
  }

  /**
   * Gets the synchronized block header.
   *
   * @param context - Optional job context to check staging first
   * @returns The block header
   * @throws If no header has been set
   */
  async getBlockHeader(context?: JobContext): Promise<BlockHeader> {
    // Check staging first if in a job
    if (context) {
      const stagingKey = context.stagingKey(HEADER_KEY);
      const stagedBuffer = await this.#stagingMap.getAsync(stagingKey);
      if (stagedBuffer) {
        return BlockHeader.fromBuffer(stagedBuffer);
      }
    }

    // Fall back to committed data
    const headerBuffer = await this.#synchronizedHeader.getAsync();
    if (!headerBuffer) {
      throw new Error(`Trying to get block header with a not-yet-synchronized PXE - this should never happen`);
    }

    return BlockHeader.fromBuffer(headerBuffer);
  }

  /**
   * Commits staged data to main storage.
   * Called by JobCoordinator when a job completes successfully.
   */
  commitStaging(context: JobContext): Promise<void> {
    return this.#store.transactionAsync(async () => {
      const stagingKey = context.stagingKey(HEADER_KEY);
      const stagedBuffer = await this.#stagingMap.getAsync(stagingKey);

      if (stagedBuffer) {
        await this.#synchronizedHeader.set(stagedBuffer);
        await this.#stagingMap.delete(stagingKey);
      }
    });
  }

  /**
   * Discards staged data without committing.
   * Called by JobCoordinator on abort or during recovery.
   */
  async discardStaging(stagingPrefix: string): Promise<void> {
    const stagingKey = `${stagingPrefix}${HEADER_KEY}`;
    await this.#stagingMap.delete(stagingKey);
  }
}
