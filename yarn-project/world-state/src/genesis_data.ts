import type { PublicDataTreeLeaf } from '@aztec/stdlib/trees';

/** Data used to initialize the genesis block, including prefilled public state and an optional timestamp. */
export type GenesisData = {
  /** Public data tree leaves to pre-populate in the genesis state (e.g. fee juice balances). */
  prefilledPublicData: PublicDataTreeLeaf[];
  /** Timestamp for the genesis block header. Defaults to 0 (canonical empty genesis) in production. */
  genesisTimestamp: bigint;
};

/** An empty genesis data with no prefilled state and a zero timestamp. */
export const EMPTY_GENESIS_DATA: GenesisData = {
  prefilledPublicData: [],
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
