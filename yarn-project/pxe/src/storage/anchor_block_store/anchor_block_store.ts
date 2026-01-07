import type { AztecAsyncKVStore, AztecAsyncSingleton } from '@aztec/kv-store';
import { BlockHeader } from '@aztec/stdlib/tx';

import type { StagedStore } from '../../job_coordinator/index.js';

const HEADER_KEY = 'header';

/**
 * AnchorBlockStore manages the synchronized block header for PXE.
 *
 * The anchor block is the latest block PXE has synced to. All simulations
 * use this block as their reference point.
 *
 * Supports staged writes via string for crash resilience.
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
   * @param jobId - Optional job ID for staged writes
   */
  async setHeader(header: BlockHeader, jobId?: string): Promise<void> {
    if (jobId) {
      this.#stagedHeader.set(jobId, header.toBuffer());
    } else {
      await this.#synchronizedHeader.set(header.toBuffer());
    }
  }

  /**
   * Gets the synchronized block header.
   *
   * @param jobId - Optional job ID to check staged version first
   * @returns The block header
   * @throws If no header has been set
   */
  async getBlockHeader(jobId?: string): Promise<BlockHeader> {
    if (jobId) {
      const stagedBuffer = this.#stagedHeader.get(jobId);
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
  async commit(jobId: string): Promise<void> {
    const stagedBuffer = this.#stagedHeader.get(jobId);

    if (stagedBuffer) {
      await this.#synchronizedHeader.set(stagedBuffer);
      this.#stagedHeader.delete(jobId);
    }
  }

  /**
   * Discards staged data without committing.
   * Called by JobCoordinator on abort or during recovery.
   */
  discardStaged(jobId: string): Promise<void> {
    this.#stagedHeader.delete(jobId);
    return Promise.resolve();
  }
}
