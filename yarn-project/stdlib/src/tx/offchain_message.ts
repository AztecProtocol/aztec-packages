import { Fr } from '@aztec/foundation/fields';

import type { AztecAddress } from '../aztec-address/index.js';

/**
 * Represents an offchain message emitted via the `emit_offchain_message` oracle (see the oracle documentation for
 * more details).
 */
export type OffchainMessage = {
  /** The message content */
  message: Fr[];
  /** The message recipient */
  recipient: AztecAddress;
  /** The contract that emitted the message */
  contractAddress: AztecAddress;
};
