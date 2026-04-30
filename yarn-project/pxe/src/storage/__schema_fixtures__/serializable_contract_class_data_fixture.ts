import { Fr } from '@aztec/foundation/curves/bn254';
import { FunctionSelector } from '@aztec/stdlib/abi';

import { SerializableContractClassData } from '../contract_store/contract_store.js';

/** The type name reported by the schema-compatibility test for `SerializableContractClassData` fixtures. */
export const SERIALIZABLE_CONTRACT_CLASS_DATA_FIXTURE_TYPE_NAME = 'SerializableContractClassData';

/**
 * Builds the canonical-fixture suite for `SerializableContractClassData`. Each variant pins one
 * binary-layout branch of `toBuffer()`:
 * - variant 0: populated `privateFunctions` — every field populated; passes
 *   `assertNoDefaultFields`.
 * - variant 1: empty `privateFunctions` — pins the empty-vector serialization (length=0 prefix,
 *   no payload). A contract class with only public functions is a real production state.
 */
export function buildSerializableContractClassDataFixtures(): SerializableContractClassData[] {
  return [
    new SerializableContractClassData({
      id: new Fr(2n),
      artifactHash: new Fr(3n),
      privateFunctionsRoot: new Fr(5n),
      publicBytecodeCommitment: new Fr(7n),
      privateFunctions: [
        { selector: FunctionSelector.fromField(new Fr(11n)), vkHash: new Fr(13n) },
        { selector: FunctionSelector.fromField(new Fr(17n)), vkHash: new Fr(19n) },
      ],
    }),
    new SerializableContractClassData({
      id: new Fr(2n),
      artifactHash: new Fr(3n),
      privateFunctionsRoot: new Fr(5n),
      publicBytecodeCommitment: new Fr(7n),
      privateFunctions: [],
    }),
  ];
}
