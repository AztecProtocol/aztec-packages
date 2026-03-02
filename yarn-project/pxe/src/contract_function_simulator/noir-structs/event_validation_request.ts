import { Fr } from '@aztec/foundation/curves/bn254';
import { FieldReader } from '@aztec/foundation/serialize';
import { EventSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { TxHash } from '@aztec/stdlib/tx';

// Default BoundedVec storage capacity for contracts that don't explicitly store their capacity.
// TODO(F-380): remove once all contracts store capacity explicitly.
const DEFAULT_EVENT_BOUNDED_VEC_CAPACITY = 11;

/**
 * Intermediate struct used to perform batch event validation by PXE. The `utilityValidateAndStoreEnqueuedNotesAndEvents` oracle
 * expects for values of this type to be stored in a `CapsuleArray`.
 */
export class EventValidationRequest {
  constructor(
    public contractAddress: AztecAddress,
    public eventTypeId: EventSelector,
    public randomness: Fr,
    public serializedEvent: Fr[],
    public eventCommitment: Fr,
    public txHash: TxHash,
    public recipient: AztecAddress,
  ) {}

  static fromFields(fields: Fr[], capacity: number = DEFAULT_EVENT_BOUNDED_VEC_CAPACITY): EventValidationRequest {
    const reader = FieldReader.asReader(fields);

    const contractAddress = AztecAddress.fromField(reader.readField());
    const eventTypeId = EventSelector.fromField(reader.readField());

    const randomness = reader.readField();

    const eventStorage = reader.readFieldArray(capacity);
    const eventLen = reader.readField().toNumber();
    const serializedEvent = eventStorage.slice(0, eventLen);

    const eventCommitment = reader.readField();
    const txHash = TxHash.fromField(reader.readField());
    const recipient = AztecAddress.fromField(reader.readField());

    if (reader.remainingFields() !== 0) {
      throw new Error(
        `EventValidationRequest deserialization did not consume all fields: ${reader.remainingFields()} remaining (capacity=${capacity}).`,
      );
    }

    return new EventValidationRequest(
      contractAddress,
      eventTypeId,
      randomness,
      serializedEvent,
      eventCommitment,
      txHash,
      recipient,
    );
  }
}
