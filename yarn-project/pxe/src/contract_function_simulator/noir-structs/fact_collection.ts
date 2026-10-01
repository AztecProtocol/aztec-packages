import type { Fr } from '@aztec/foundation/curves/bn254';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

import type { FactScope, FactWithOriginState, RetractableFactOrigin } from '../../storage/fact_store/index.js';
import type { EphemeralArrayService } from '../ephemeral_array_service.js';
import { EphemeralArray } from './ephemeral_array.js';
import type { Fact } from './fact.js';
import { Option } from './option.js';

/**
 * A fact collection.
 */
export type FactCollection = {
  contractAddress: AztecAddress;
  scope: FactScope;
  factCollectionTypeId: Fr;
  factCollectionId: Fr;
  facts: EphemeralArray<Fact>;
};

/**
 * Builds the Noir-facing `FactCollection` from stored facts.
 */
export function toNoirFactCollection(
  service: EphemeralArrayService,
  contractAddress: AztecAddress,
  scope: FactScope,
  factCollectionTypeId: Fr,
  factCollectionId: Fr,
  facts: FactWithOriginState[],
): FactCollection {
  return {
    contractAddress,
    scope,
    factCollectionTypeId,
    factCollectionId,
    facts: EphemeralArray.fromValues(
      service,
      facts.map(
        (fact: FactWithOriginState): Fact => ({
          factTypeId: fact.factTypeId,
          payload: EphemeralArray.fromValues(service, fact.payload),
          originBlock: fact.originBlock ? Option.some(fact.originBlock) : Option.none<RetractableFactOrigin>(),
        }),
      ),
    ),
  };
}
