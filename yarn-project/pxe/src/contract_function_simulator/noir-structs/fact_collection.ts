import { Fr } from '@aztec/foundation/curves/bn254';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

import type { AnnotatedFact, RetractableFactOrigin } from '../../storage/fact_store/index.js';
import { OriginState } from '../../storage/fact_store/index.js';
import type { EphemeralArrayService } from '../ephemeral_array_service.js';
import { EphemeralArray } from './ephemeral_array.js';
import type { Fact } from './fact.js';
import { Option } from './option.js';

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

/**
 * Builds the Noir-facing `FactCollection` from stored facts.
 */
export function toNoirFactCollection(
  service: EphemeralArrayService,
  contractAddress: AztecAddress,
  scope: AztecAddress,
  factCollectionTypeId: Fr,
  factCollectionId: Fr,
  facts: AnnotatedFact[],
): FactCollection {
  return {
    contractAddress,
    scope,
    factCollectionTypeId,
    factCollectionId,
    facts: EphemeralArray.fromValues(
      service,
      facts.map(
        (fact: AnnotatedFact): Fact => ({
          factTypeId: fact.factTypeId,
          payload: EphemeralArray.fromValues(service, fact.payload),
          originBlock: fact.originBlock
            ? Option.some(fact.originBlock)
            : Option.none<RetractableFactOrigin>({
                blockNumber: 0,
                blockHash: Fr.ZERO,
                blockState: OriginState.Pending,
              }),
        }),
      ),
    ),
  };
}

/**
 * A zeroed `FactCollection` used only as a serialization shape template for the `None` case of
 * `Option<FactCollection>`. Noir's `Option<T>` is fixed-width on the wire, so `None` must emit the same number of
 * (zeroed) field slots as `Some`.
 **/
export function emptyFactCollection(service: EphemeralArrayService): FactCollection {
  return toNoirFactCollection(service, AztecAddress.ZERO, AztecAddress.ZERO, Fr.ZERO, Fr.ZERO, []);
}
