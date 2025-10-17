import type { AztecAsyncKVStore, AztecAsyncSingleton } from '@aztec/kv-store';
import { BlockHeader } from '@aztec/stdlib/tx';

/**
 * Manages synchronization state for the PXE.
 *
 * @remarks
 * SyncDataProvider tracks the PXE's current synchronization position with the Aztec network
 * by maintaining the latest synchronized block header. This simple but critical component
 * enables the PXE to:
 * - Know which block it has processed up to
 * - Resume synchronization after restarts
 * - Detect chain reorganizations by comparing stored and current headers
 * - Provide block context for transaction validation
 *
 * The provider stores only a single block header (the latest synchronized one), making it
 * lightweight and efficient. The header contains global variables including the block number,
 * timestamp, and chain state roots.
 */
export class SyncDataProvider {
  /** The underlying key-value store for persistence */
  #store: AztecAsyncKVStore;
  /** Singleton storage for the latest synchronized block header */
  #synchronizedHeader: AztecAsyncSingleton<Buffer>;

  /**
   * Creates a new SyncDataProvider.
   *
   * @param store - The key-value store for persistent storage
   */
  constructor(store: AztecAsyncKVStore) {
    this.#store = store;
    this.#synchronizedHeader = this.#store.openSingleton('header');
  }

  /**
   * Updates the synchronized block header to mark progress in chain synchronization.
   *
   * @param header - The block header to store as the new synchronization point
   * @remarks
   * This method is called after the PXE successfully processes a block, updating the
   * synchronization checkpoint. The header is stored in serialized form for efficient
   * storage and retrieval.
   */
  async setHeader(header: BlockHeader): Promise<void> {
    await this.#synchronizedHeader.set(header.toBuffer());
  }

  /**
   * Retrieves the current synchronized block number.
   *
   * @returns The block number of the last synchronized block
   * @throws If the PXE has not yet synchronized any blocks (header not set)
   * @remarks
   * This is a convenience method that extracts just the block number from the stored header.
   * The error condition indicates the PXE has not completed initial synchronization.
   */
  async getBlockNumber(): Promise<number> {
    const headerBuffer = await this.#synchronizedHeader.getAsync();
    if (!headerBuffer) {
      throw new Error(`Trying to get block number with a not-yet-synchronized PXE - this should never happen`);
    }

    return BlockHeader.fromBuffer(headerBuffer).globalVariables.blockNumber;
  }

  /**
   * Retrieves the complete synchronized block header.
   *
   * @returns The last synchronized block header
   * @throws If no header has been set (PXE not yet synchronized)
   * @remarks
   * The block header contains comprehensive block metadata including:
   * - Global variables (block number, timestamp, version)
   * - State tree roots (note hash tree, nullifier tree, public data tree)
   * - Last archive root
   * - Total fees and mana used
   *
   * This information is essential for validating transactions and generating proofs.
   */
  async getBlockHeader(): Promise<BlockHeader> {
    const headerBuffer = await this.#synchronizedHeader.getAsync();
    if (!headerBuffer) {
      throw new Error(`Header not set`);
    }

    return BlockHeader.fromBuffer(headerBuffer);
  }
}
