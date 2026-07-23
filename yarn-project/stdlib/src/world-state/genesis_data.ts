import type { Fr } from '@aztec/foundation/curves/bn254';

import type { PublicDataTreeLeaf } from '../trees/index.js';

/** Data used to initialize the genesis block, including prefilled public state and an optional timestamp. */
export type GenesisData = {
  /** Public data tree leaves to pre-populate in the genesis state (e.g. fee juice balances). */
  prefilledPublicData: PublicDataTreeLeaf[];
  /**
   * Nullifiers to pre-insert into the genesis nullifier tree. Optional; defaults to an empty list, which leaves the
   * nullifier tree at its canonical empty-genesis state so that production genesis roots are unchanged. When non-empty,
   * the leaves must be unique and strictly increasing in field value (the native world state enforces this before
   * construction). Test networks pass a non-empty list to seed e.g. standard-contract registration nullifiers.
   */
  prefilledNullifiers?: Fr[];
  /** Timestamp for the genesis block header. Defaults to 0 (canonical empty genesis) in production. */
  genesisTimestamp: bigint;
};

/** An empty genesis data with no prefilled state and a zero timestamp. */
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
    'genesisTimestamp' in obj &&
    typeof obj.genesisTimestamp === 'bigint'
  );
}
