import type { Fr } from '@aztec/foundation/curves/bn254';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

import type { EphemeralArray } from './ephemeral_array.js';
import type { Fact } from './fact.js';

/**
 * A fact collection.
 */
export type FactCollection = {
  contractAddress: AztecAddress;
  scope: AztecAddress;
  factCollectionTypeId: Fr;
  factCollectionId: Fr;
  facts: EphemeralArray<Fact>;
};
