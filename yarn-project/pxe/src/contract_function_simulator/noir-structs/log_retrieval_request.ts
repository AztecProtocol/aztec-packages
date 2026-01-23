import { Fr } from '@aztec/foundation/curves/bn254';
import { FieldReader } from '@aztec/foundation/serialize';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { Tag } from '@aztec/stdlib/logs';

/**
 * Intermediate struct used to perform batch log retrieval by PXE. The `utilityBulkRetrieveLogs` oracle expects values of this
 * type to be stored in a `CapsuleArray`.
 */
export class LogRetrievalRequest {
  constructor(
    public contractAddress: AztecAddress,
    public tag: Tag,
  ) {}

  toFields(): Fr[] {
    return [this.contractAddress.toField(), this.tag.value];
  }

  static fromFields(fields: Fr[] | FieldReader): LogRetrievalRequest {
    const reader = FieldReader.asReader(fields);

    const contractAddress = AztecAddress.fromField(reader.readField());
    const tag = new Tag(reader.readField());

    return new LogRetrievalRequest(contractAddress, tag);
  }
}
