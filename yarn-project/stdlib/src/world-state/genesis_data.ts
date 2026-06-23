import type { Fr } from '@aztec/foundation/curves/bn254';

import type { PublicDataTreeLeaf } from '../trees/index.js';

/** Data used to initialize the genesis block, including prefilled public state and an optional timestamp. */
export type GenesisData = {
  /** Public data tree leaves to pre-populate in the genesis state (e.g. fee juice balances). */
  prefilledPublicData: PublicDataTreeLeaf[];
  /**
   * Nullifiers to pre-insert into the genesis nullifier tree. Must be unique and strictly increasing in field value.
   * Production callers pass `DEFAULT_GENESIS_DATA.prefilledNullifiers` from `@aztec/protocol-contracts` (the canonical
   * protocol contract registration nullifiers); this cannot be defaulted here because `@aztec/stdlib` does not depend
   * on `@aztec/protocol-contracts`. Pass an explicit empty array for a truly-empty nullifier tree (e.g. low-level tree
   * unit tests).
   */
  prefilledNullifiers: Fr[];
  /** Timestamp for the genesis block header. Defaults to 0 (canonical empty genesis) in production. */
  genesisTimestamp: bigint;
};

/**
 * An empty genesis data with no prefilled state and a zero timestamp. Note this seeds an empty nullifier tree, so the
 * resulting genesis roots do not match the canonical production roots; production code should use `DEFAULT_GENESIS_DATA`
 * from `@aztec/protocol-contracts` instead. Use this only for low-level tree tests that want a truly-empty genesis.
 */
export const EMPTY_GENESIS_DATA: GenesisData = {
  prefilledPublicData: [],
  prefilledNullifiers: [],
  genesisTimestamp: 0n,
};

/** Returns if an object looks like genesis data */
export function isGenesisData(obj: any): obj is GenesisData {
  return (
    obj &&
    typeof obj === 'object' &&
    'prefilledPublicData' in obj &&
    Array.isArray(obj.prefilledPublicData) &&
    'prefilledNullifiers' in obj &&
    Array.isArray(obj.prefilledNullifiers) &&
    'genesisTimestamp' in obj &&
    typeof obj.genesisTimestamp === 'bigint'
  );
}
