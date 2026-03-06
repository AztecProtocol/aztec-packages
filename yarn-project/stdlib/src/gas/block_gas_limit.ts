/**
 * Default per-block allocation multiplier. Budget per block is (checkpointLimit / maxBlocks) * multiplier.
 * Values greater than one allow early blocks to use more than their even share,
 * relying on checkpoint-level capping for later blocks.
 */
export const DEFAULT_PER_BLOCK_ALLOCATION_MULTIPLIER = 2;

/**
 * Derives the per-block L2 gas limit from the checkpoint-level rollup mana limit.
 *
 * If an explicit limit is provided, it is capped at the rollup mana limit.
 * Otherwise, the limit is derived as `ceil(rollupManaLimit / maxBlocksPerSlot * multiplier)`,
 * capped at the rollup mana limit.
 *
 * Used by the sequencer (to set block building limits) and the P2P gossip validator
 * (to reject transactions whose gas limits exceed what any block can accommodate).
 */
export function deriveMaxBlockL2Gas(opts: {
  rollupManaLimit: number;
  maxBlocksPerSlot: number;
  multiplier: number;
  explicitLimit?: number;
}): number {
  const { rollupManaLimit, maxBlocksPerSlot, multiplier, explicitLimit } = opts;
  if (explicitLimit !== undefined) {
    return Math.min(explicitLimit, rollupManaLimit);
  }
  return Math.min(rollupManaLimit, Math.ceil((rollupManaLimit / maxBlocksPerSlot) * multiplier));
}
