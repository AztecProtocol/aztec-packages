import { Fr } from '@aztec/foundation/fields';

import type { AztecAddress } from '../aztec-address/index.js';

// The following identifier was copied over from `noir-projects/aztec-nr/aztec/src/messages/offchain_messages.nr`.
// poseidon2hash("aztecnr_offchain_message")
export const OFFCHAIN_MESSAGE_IDENTIFIER: Fr = new Fr(
  6023466688192654631553769360478808766602235351827869819420284624004071427516n,
);

/**
 * Represents an offchain effect emitted via the `emit_offchain_effect` oracle (see the oracle documentation for
 * more details).
 */
export type OffchainEffect = {
  /** The emitted data */
  data: Fr[];
  /** The contract that emitted the data */
  contractAddress: AztecAddress;
};
