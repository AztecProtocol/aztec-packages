import { Fr } from '@aztec/foundation/curves/bn254';
import { FieldReader } from '@aztec/foundation/serialize';
import { EventSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { TxHash } from '@aztec/stdlib/tx';

// TODO(#14617): should we compute this from constants? This value is aztec-nr specific.
const MAX_EVENT_SERIALIZED_LEN = 11;

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

  static fromFields(fields: Fr[] | FieldReader): EventValidationRequest {
    const reader = FieldReader.asReader(fields);

    const contractAddress = AztecAddress.fromField(reader.readField());
    const eventTypeId = EventSelector.fromField(reader.readField());

    const randomness = reader.readField();

    const eventStorage = reader.readFieldArray(MAX_EVENT_SERIALIZED_LEN);
    const eventLen = reader.readField().toNumber();
    const serializedEvent = eventStorage.slice(0, eventLen);

    const eventCommitment = reader.readField();
    const txHash = TxHash.fromField(reader.readField());
    const recipient = AztecAddress.fromField(reader.readField());

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
