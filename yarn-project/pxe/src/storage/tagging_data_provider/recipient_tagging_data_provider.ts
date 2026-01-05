import type { AztecAsyncKVStore, AztecAsyncMap } from '@aztec/kv-store';
import type { DirectionalAppTaggingSecret } from '@aztec/stdlib/logs';

/**
 * Data provider of tagging data used when syncing the logs as a recipient. The sender counterpart of this class
 * is called SenderTaggingDataProvider. We have the providers separate for the sender and recipient because
 * the algorithms are completely disjoint and there is not data reuse between the two.
 *
 * @dev Chain reorgs do not need to be handled here because both the finalized and aged indexes refer to finalized
 * blocks, which by definition cannot be affected by reorgs.
 *
 * TODO(benesjan): Relocate to yarn-project/pxe/src/storage/tagging_data_provider
 */
export class RecipientTaggingDataProvider {
  #store: AztecAsyncKVStore;

  #highestAgedIndex: AztecAsyncMap<string, number>;
  #highestFinalizedIndex: AztecAsyncMap<string, number>;

  constructor(store: AztecAsyncKVStore) {
    this.#store = store;

    this.#highestAgedIndex = this.#store.openMap('highest_aged_index');
    this.#highestFinalizedIndex = this.#store.openMap('highest_finalized_index');
  }

  getHighestAgedIndex(secret: DirectionalAppTaggingSecret): Promise<number | undefined> {
    return this.#highestAgedIndex.getAsync(secret.toString());
  }

  async updateHighestAgedIndex(secret: DirectionalAppTaggingSecret, index: number): Promise<void> {
    const currentIndex = await this.#highestAgedIndex.getAsync(secret.toString());
    if (currentIndex !== undefined && index <= currentIndex) {
      // Log sync should never set a lower highest aged index.
      throw new Error(`New highest aged index (${index}) must be higher than the current one (${currentIndex})`);
    }
    await this.#highestAgedIndex.set(secret.toString(), index);
  }

  getHighestFinalizedIndex(secret: DirectionalAppTaggingSecret): Promise<number | undefined> {
    return this.#highestFinalizedIndex.getAsync(secret.toString());
  }

  async updateHighestFinalizedIndex(secret: DirectionalAppTaggingSecret, index: number): Promise<void> {
    const currentIndex = await this.#highestFinalizedIndex.getAsync(secret.toString());
    if (currentIndex !== undefined && index < currentIndex) {
      // Log sync should never set a lower highest finalized index but it can happen that it would try to set the same
      // one because we are loading logs from highest aged index + 1 and not from the highest finalized index.
      throw new Error(`New highest finalized index (${index}) must be higher than the current one (${currentIndex})`);
    }
    await this.#highestFinalizedIndex.set(secret.toString(), index);
  }
}
