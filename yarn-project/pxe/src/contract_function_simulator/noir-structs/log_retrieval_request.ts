import { Fr } from '@aztec/foundation/curves/bn254';
import { FieldReader } from '@aztec/foundation/serialize';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { Tag } from '@aztec/stdlib/logs';

/**
 * A request for the `bulkRetrieveLogs` oracle. Contains the tag to search for and the capsule slot where PXE should
 * write matching `LogRetrievalResponse` values.
 */
export class LogRetrievalRequest {
  constructor(
    public contractAddress: AztecAddress,
    public tag: Tag,
    public responseSlot: Fr,
  ) {}

  toFields(): Fr[] {
    return [this.contractAddress.toField(), this.tag.value, this.responseSlot];
  }

  static fromFields(fields: Fr[] | FieldReader): LogRetrievalRequest {
    const reader = FieldReader.asReader(fields);

    const contractAddress = AztecAddress.fromField(reader.readField());
    const tag = new Tag(reader.readField());
    const responseSlot = reader.readField();

    return new LogRetrievalRequest(contractAddress, tag, responseSlot);
  }
}
