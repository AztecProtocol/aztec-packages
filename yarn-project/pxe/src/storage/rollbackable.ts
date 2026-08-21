/**
 * A store holding block-indexed state that must be truncated when a chain prune (reorg) is detected.
 */
export interface Rollbackable {
  /**
   * Rolls the store back to `toBlock`: deletes all state originating from blocks strictly above it, as if nothing
   * past that block height ever happened.
   *
   * Called inside an already open store transaction shared with every other rollbackable and with the anchor block
   * update, so implementations must not open one of their own. Throwing aborts that transaction, undoing the whole
   * prune and leaving the sync cursor untouched so the prune event is re-emitted on the next sync.
   */
  rollbackToBlock(toBlock: number): Promise<void>;
}
