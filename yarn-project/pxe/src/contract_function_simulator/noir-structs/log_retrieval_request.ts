import { Fr } from '@aztec/foundation/fields';
import { FieldReader } from '@aztec/foundation/serialize';
import { AztecAddress } from '@aztec/stdlib/aztec-address';

/**
 * Intermediate struct used to perform batch log retrieval by PXE. The `bulkRetrieveLogs` oracle expects values of this
 * type to be stored in a `CapsuleArray`.
 */
export class LogRetrievalRequest {
  constructor(
    public contractAddress: AztecAddress,
    public unsiloedTag: Fr,
  ) {}

  toFields(): Fr[] {
    return [this.contractAddress.toField(), this.unsiloedTag];
  }

  static fromFields(fields: Fr[] | FieldReader): LogRetrievalRequest {
    const reader = FieldReader.asReader(fields);

    const contractAddress = AztecAddress.fromField(reader.readField());
    const unsiloedTag = reader.readField();

    return new LogRetrievalRequest(contractAddress, unsiloedTag);
  }
}
