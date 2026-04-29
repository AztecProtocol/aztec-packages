import { Fr } from '@aztec/foundation/curves/bn254';
import { Point } from '@aztec/foundation/curves/grumpkin';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { SerializableContractInstance } from '@aztec/stdlib/contract';
import { PublicKeys } from '@aztec/stdlib/keys';

/** The type name reported by the schema-compatibility test for `SerializableContractInstance` fixtures. */
export const SERIALIZABLE_CONTRACT_INSTANCE_FIXTURE_TYPE_NAME = 'SerializableContractInstance';

/**
 * Builds a deterministic, fully-populated `SerializableContractInstance` for the schema-compatibility snapshot.
 * The type has no optional fields, so the suite contains a single canonical instance.
 */
export function buildSerializableContractInstanceFixtures(): SerializableContractInstance[] {
  const publicKeys = new PublicKeys(
    new Point(new Fr(31n), new Fr(37n), false),
    new Point(new Fr(41n), new Fr(43n), false),
    new Point(new Fr(47n), new Fr(53n), false),
    new Point(new Fr(59n), new Fr(61n), false),
  );
  return [
    new SerializableContractInstance({
      version: 1,
      salt: new Fr(2n),
      deployer: AztecAddress.fromBigInt(3n),
      currentContractClassId: new Fr(5n),
      originalContractClassId: new Fr(7n),
      initializationHash: new Fr(11n),
      publicKeys,
    }),
  ];
}
