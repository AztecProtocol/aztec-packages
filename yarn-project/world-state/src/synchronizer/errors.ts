/**
 * Thrown by {@link ServerWorldStateSynchronizer.syncImmediate} when world state cannot be synced to the requested
 * target: either the block is not available from the block source (`block_not_available`, e.g. it was pruned away)
 * or the synced block does not match the requested hash (`block_hash_mismatch`, i.e. a reorg). Both causes are
 * transient from the caller's perspective: re-resolving the query against the current chain and retrying may succeed
 * or produce a more precise error.
 */
export class WorldStateSynchronizerError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'WorldStateSynchronizerError';
  }
}
