import type { Fr } from '@aztec/foundation/curves/bn254';

/**
 * The block a retractable fact originates from.
 *
 * A TS version of the `OriginBlock` struct in `facts/mod.nr`.
 */
export type OriginBlock = { blockNumber: number; blockHash: Fr };
