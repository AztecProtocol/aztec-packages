import type { PublicDataTreeLeaf } from '../trees/index.js';

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
