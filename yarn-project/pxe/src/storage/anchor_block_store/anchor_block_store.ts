import type { AztecAsyncKVStore, AztecAsyncSingleton } from '@aztec/kv-store';
import { BlockHeader } from '@aztec/stdlib/tx';

import type { JobContext, StagedStore } from '../../job_coordinator/index.js';

const HEADER_KEY = 'header';

/**
 * AnchorBlockStore manages the synchronized block header for PXE.
 *
 * The anchor block is the latest block PXE has synced to. All simulations
 * use this block as their reference point.
 *
 * Supports staged writes via JobContext for crash resilience.
 */
export class AnchorBlockStore implements StagedStore {
  readonly storeName = 'anchor_block';

  #store: AztecAsyncKVStore;
  #synchronizedHeader: AztecAsyncSingleton<Buffer>;
  /** In-memory stage: jobId -> header buffer */
  #stagedHeader: Map<string, Buffer>;

  constructor(store: AztecAsyncKVStore) {
    this.#store = store;
    this.#synchronizedHeader = this.#store.openSingleton(HEADER_KEY);
    this.#stagedHeader = new Map();
  }

  /**
   * Sets the synchronized block header.
   *
   * @param header - The block header to set
   * @param context - Optional job context for staged writes
   */
  async setHeader(header: BlockHeader, context?: JobContext): Promise<void> {
    if (context) {
      this.#stagedHeader.set(context.jobId, header.toBuffer());
    } else {
      await this.#synchronizedHeader.set(header.toBuffer());
    }
  }

  /**
   * Gets the synchronized block header.
   *
   * @param context - Optional job context to check staged version first
   * @returns The block header
   * @throws If no header has been set
   */
  async getBlockHeader(context?: JobContext): Promise<BlockHeader> {
    if (context) {
      const stagedBuffer = this.#stagedHeader.get(context.jobId);
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
   * Must be called within a transaction by the JobCoordinator.
   */
  async commit(context: JobContext): Promise<void> {
    const stagedBuffer = this.#stagedHeader.get(context.jobId);

    if (stagedBuffer) {
      await this.#synchronizedHeader.set(stagedBuffer);
      this.#stagedHeader.delete(context.jobId);
    }
  }

  /**
   * Discards staged data without committing.
   * Called by JobCoordinator on abort or during recovery.
   */
  discardStaged(stagingPrefix: string): Promise<void> {
    // Extract jobId from prefix format "job_{jobId}:"
    const jobId = stagingPrefix.slice(4, -1);
    this.#stagedHeader.delete(jobId);
    return Promise.resolve();
  }
}
