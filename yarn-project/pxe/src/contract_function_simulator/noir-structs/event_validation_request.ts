import { Fr } from '@aztec/foundation/curves/bn254';
import { FieldReader } from '@aztec/foundation/serialize';
import { EventSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { TxHash } from '@aztec/stdlib/tx';

/**
 * Intermediate struct used to perform batch event validation by PXE. The `utilityValidateAndStoreEnqueuedNotesAndEvents` oracle
 * expects for values of this type to be stored in a `EphemeralArray`.
 */
export class EventValidationRequest {
  constructor(
    public contractAddress: AztecAddress,
    public eventTypeId: EventSelector,
    public randomness: Fr,
    public serializedEvent: Fr[],
    public eventCommitment: Fr,
    public txHash: TxHash,
  ) {}

  static fromFields(fields: Fr[]): EventValidationRequest {
    const reader = FieldReader.asReader(fields);

    const contractAddress = AztecAddress.fromField(reader.readField());
    const eventTypeId = EventSelector.fromField(reader.readField());

    const randomness = reader.readField();

    const maxEventSerializedLen = reader.readField().toNumber();
    const eventStorage = reader.readFieldArray(maxEventSerializedLen);
    const eventLen = reader.readField().toNumber();
    const serializedEvent = eventStorage.slice(0, eventLen);

    const eventCommitment = reader.readField();
    const txHash = TxHash.fromField(reader.readField());

    if (reader.remainingFields() !== 0) {
      throw new Error(
        `Error converting array of fields to EventValidationRequest: expected ${reader.cursor} fields but received ${fields.length} (maxEventSerializedLen=${maxEventSerializedLen}).`,
      );
    }

    return new EventValidationRequest(
      contractAddress,
      eventTypeId,
      randomness,
      serializedEvent,
      eventCommitment,
      txHash,
    );
  }
}
