import type { GenesisData } from '@aztec/stdlib/world-state';

import { ProtocolContractGenesisNullifiers } from './protocol_contract_data.js';

/**
 * Canonical genesis data for a production network. Seeds the protocol contract registration nullifiers
 * ({@link ProtocolContractGenesisNullifiers}) into the genesis nullifier tree so that an on-chain re-publish of a
 * bundled protocol class id pushes an already-existing nullifier, making that transaction invalid (duplicate nullifier)
 * before it ever reaches the archiver. Production world-state callers should construct genesis on top of this rather
 * than `EMPTY_GENESIS_DATA` so the genesis roots match the canonical constants.
 */
export const DEFAULT_GENESIS_DATA: GenesisData = {
  prefilledPublicData: [],
  prefilledNullifiers: ProtocolContractGenesisNullifiers,
  genesisTimestamp: 0n,
};
