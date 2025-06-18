import { Fr } from '@aztec/foundation/fields';

import type { AztecAddress } from '../aztec-address/index.js';

/**
 * Represents an offchain effect emitted via the `emit_offchain_effect` oracle (see the oracle documentation for
 * more details).
 */
export type OffchainEffect = {
  /** The message content */
  message: Fr[];
  /** The message recipient */
  recipient: AztecAddress;
  /** The contract that emitted the message */
  contractAddress: AztecAddress;
};
