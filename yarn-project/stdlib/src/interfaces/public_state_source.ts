import type { Fr } from '@aztec/foundation/fields';

import type { AztecAddress } from '../aztec-address/index.js';

/** Provides a view into public contract state */
export interface PublicStateSource {
  /** Returns the value for a given slot at a given contract. */
  storageRead: (contractAddress: AztecAddress, slot: Fr) => Promise<Fr>;
}
